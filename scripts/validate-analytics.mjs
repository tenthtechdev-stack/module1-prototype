import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

function pathFor(file) { return resolve(root, file); }
function expect(condition, message) { if (!condition) failures.push(message); }
function equal(actual, expected, message) { if (actual !== expected) failures.push(`${message}: expected ${expected}, received ${actual}`); }

const moduleUrlCache = new Map();
function resolveInternalModule(specifier) {
  const relativePath = specifier.slice(2);
  for (const suffix of ['', '.ts', '.tsx', '.js', '.mjs', '/index.ts', '/index.tsx']) {
    const candidate = pathFor(`${relativePath}${suffix}`);
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`could not resolve internal module ${specifier}`);
}

async function moduleUrlFor(absoluteFile) {
  if (moduleUrlCache.has(absoluteFile)) return moduleUrlCache.get(absoluteFile);
  const source = readFileSync(absoluteFile, 'utf8');
  let output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    fileName: absoluteFile,
  }).outputText;
  const internalSpecifiers = [...output.matchAll(/(?:from\s+|import\s*\()(['"])(@\/[^'"]+)\1/g)].map((match) => match[2]);
  for (const specifier of new Set(internalSpecifiers)) {
    const dependencyUrl = await moduleUrlFor(resolveInternalModule(specifier));
    output = output.replaceAll(`'${specifier}'`, `'${dependencyUrl}'`).replaceAll(`"${specifier}"`, `"${dependencyUrl}"`);
  }
  const url = `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`;
  moduleUrlCache.set(absoluteFile, url);
  return url;
}

async function load(file) { return import(await moduleUrlFor(pathFor(file))); }

try {
  const dataModule = await load('src/fixtures/data.ts');
  const fixtures = await load('src/fixtures/analytics-data.ts');
  const calculations = await load('src/domain/financial-calculations.ts');
  const sharedCalculations = await load('src/domain/calculations.ts');
  const aggregation = await load('src/services/analytics/analytics-aggregation.ts');
  const { MockCopilotRepository } = await load('src/services/mock/copilot-repository.ts');
  const { queryKeys } = await load('src/services/query-keys.ts');

  const dataset = fixtures.generateAnalyticsDataset({
    organisation: dataModule.organisation,
    companies: dataModule.companies,
    marketplaceAccounts: dataModule.marketplaceAccounts,
  });
  const repeated = fixtures.generateAnalyticsDataset({
    organisation: dataModule.organisation,
    companies: dataModule.companies,
    marketplaceAccounts: dataModule.marketplaceAccounts,
  });
  expect(JSON.stringify(dataset) === JSON.stringify(repeated), 'analytics fixture generation must be deterministic');
  expect(calculations.inclusiveDayCount(dataset.generatedRange) >= 180, 'analytics fixture must cover at least 180 days');
  expect(dataset.records.length >= 3_000 && dataset.records.length <= 30_000, 'analytics fixture should remain in the prototype-scale record range');
  equal(new Set(dataset.records.map((record) => record.id)).size, dataset.records.length, 'financial record IDs must be unique');
  expect(['amazon', 'ebay', 'temu'].every((marketplace) => dataset.records.some((record) => record.marketplace === marketplace)), 'records must include Amazon, eBay, and Temu');
  expect(new Set(dataset.records.map((record) => record.companyId)).size > 1, 'records must span multiple companies');
  expect(new Set(dataset.records.map((record) => record.marketplaceAccountId)).size > 1, 'records must span multiple marketplace accounts');
  expect(dataset.records.every((record) => [record.grossSalesMinor, record.discountsMinor, record.refundsMinor, record.cogsMinor, record.shippingMinor, record.otherDirectCostsMinor].every((value) => value === null || Number.isInteger(value))), 'all fixture money must use integer minor units');
  expect(dataset.expenses.some((expense) => expense.category.toLowerCase().includes('one-off')), 'expense fixtures must contain a genuine one-off cost');
  expect(dataset.expenses.some((expense) => expense.scope.type === 'marketplace'), 'expense fixtures must contain a marketplace-scoped cost');
  expect(dataset.expenses.some((expense) => expense.scope.type === 'product'), 'expense fixtures must contain a product-scoped cost');

  const blueGloves = dataset.products.find((product) => product.name === 'Blue Nitrile Gloves XL');
  expect(Boolean(blueGloves), 'reference COGS product must exist');
  if (blueGloves) {
    equal(calculations.resolveHistoricalUnitCogs(dataset.cogsHistory, blueGloves.id, '2026-02-15'), 650, 'February COGS must use the Jan-Mar rate');
    equal(calculations.resolveHistoricalUnitCogs(dataset.cogsHistory, blueGloves.id, '2026-06-15'), 690, 'June COGS must use the Apr-Jul rate');
    equal(calculations.resolveHistoricalUnitCogs(dataset.cogsHistory, blueGloves.id, '2026-08-15'), 720, 'August COGS must use the Aug-current rate');
    equal(calculations.resolveHistoricalUnitCogs(dataset.cogsHistory, 'missing-product', '2026-08-15'), null, 'missing COGS must remain null, never zero');
    const referenceRecord = dataset.records.find((record) => record.productId === blueGloves.id && record.occurredOn >= '2026-08-01');
    if (referenceRecord) equal(referenceRecord.cogsMinor, 720 * referenceRecord.units, 'transaction COGS must multiply the historically effective unit rate');
  }

  const baseContext = {
    organisationId: dataModule.organisation.id,
    companyId: 'all',
    marketplace: 'all',
    marketplaceAccountIds: [],
    dateRange: { from: '2026-07-29', to: '2026-08-27' },
  };
  const input = {
    context: baseContext,
    organisation: dataModule.organisation,
    scenarioId: 'healthy',
    companies: dataModule.companies,
    marketplaceAccounts: dataModule.marketplaceAccounts,
    authorisedCompanyIds: dataModule.companies.map((company) => company.id),
    authorisedAccountIds: dataModule.marketplaceAccounts.map((account) => account.id),
    reportingCurrency: 'GBP',
    canViewSensitiveExpenses: true,
    cogsReadiness: null,
  };
  const all = aggregation.aggregateDashboardAnalytics(dataset, input);
  expect(all.current.orders > 0, 'Last 30 days must contain activity');
  expect(all.current.revenueMinor !== all.previous.revenueMinor, 'Last 30 days must differ from the previous 30 days');
  equal(all.comparisonRange.from, '2026-06-29', 'comparison period must start exactly one equivalent period earlier');
  equal(all.comparisonRange.to, '2026-07-28', 'comparison period must end one day before the current period');
  equal(calculations.inclusiveDayCount(all.comparisonRange), calculations.inclusiveDayCount(baseContext.dateRange), 'comparison period must have equal inclusive length');

  const totals = all.current;
  equal(totals.netRevenueMinor, totals.revenueMinor - totals.refundsMinor, 'Net Revenue must reconcile');
  equal(totals.covered.netRevenueMinor, totals.covered.revenueMinor - totals.covered.refundsMinor, 'covered Net Revenue must reconcile');
  equal(totals.grossProfitKnownMinor, totals.covered.netRevenueMinor - totals.covered.cogsMinor, 'covered Gross Profit must reconcile');
  equal(
    totals.knownNetProfitMinor,
    totals.covered.grossProfitMinor - totals.covered.marketplaceFeesMinor - totals.covered.advertisingMinor - totals.covered.shippingMinor - totals.covered.otherDirectCostsMinor - totals.covered.allocatedExpensesMinor,
    'covered Profit bridge must reconcile to the minor unit',
  );
  expect(totals.profitabilityComplete && totals.netProfitMinor === totals.knownNetProfitMinor, 'healthy context must expose complete Net Profit');
  expect(Number.isFinite(totals.marginBps), 'healthy margin must be finite');
  equal(totals.profitabilityCoverageBps, 10_000, 'healthy profitability coverage must be complete');
  equal(totals.covered.netRevenueMinor, totals.netRevenueMinor, 'complete covered Net Revenue must equal selected Net Revenue');
  expect(all.profitabilityComparison.available, 'complete periods must expose an equivalent profitability comparison');
  equal(all.health.revenueCompletenessBps, 10_000, 'healthy revenue completeness must be derived as fully present');
  equal(all.metrics.refunds.currentBps, all.current.refundRateBps, 'Refunds KPI must carry the selected-scope refund rate');

  const marketplaceResults = ['amazon', 'ebay', 'temu'].map((marketplace) => aggregation.aggregateDashboardAnalytics(dataset, { ...input, context: { ...baseContext, marketplace } }));
  equal(marketplaceResults.reduce((sum, result) => sum + result.current.revenueMinor, 0), all.current.revenueMinor, 'marketplace Revenue must sum to All Marketplaces');
  equal(marketplaceResults.reduce((sum, result) => sum + (result.current.knownNetProfitMinor ?? 0), 0), all.current.knownNetProfitMinor, 'marketplace Net Profit must sum to All Marketplaces');
  expect(marketplaceResults[0].marketplaceComparison.every((row) => row.id === 'amazon'), 'Amazon-only comparison must not retain eBay or Temu');
  expect(marketplaceResults[0].current.revenueMinor !== all.current.revenueMinor, 'Amazon-only totals must differ from All Marketplaces');
  equal(all.marketplaceComparison.reduce((sum, row) => sum + row.totals.revenueMinor, 0), all.current.revenueMinor, 'marketplace comparison must reconcile to Dashboard Revenue');
  equal(all.companyComparison.reduce((sum, row) => sum + row.totals.revenueMinor, 0), all.current.revenueMinor, 'company comparison must reconcile to Dashboard Revenue');
  equal(all.accountComparison.reduce((sum, row) => sum + row.totals.revenueMinor, 0), all.current.revenueMinor, 'account comparison must reconcile to Dashboard Revenue');
  equal(all.productPerformance.reduce((sum, product) => sum + product.revenueMinor, 0), all.current.revenueMinor, 'product performance must reconcile to Dashboard Revenue');
  equal(all.productPerformance.reduce((sum, product) => sum + (product.knownNetProfitMinor ?? 0), 0), all.current.knownNetProfitMinor, 'product performance must reconcile to Dashboard known Net Profit');
  equal(all.topProducts.length, all.productPerformance.filter((product) => product.cogsStatus === 'complete' && product.netProfitMinor !== null).length, 'sortable Top Products source must include every complete-cost product before the UI slices the selected ranking');

  const company = dataModule.companies[0];
  const companyOnly = aggregation.aggregateDashboardAnalytics(dataset, { ...input, context: { ...baseContext, companyId: company.id } });
  expect(companyOnly.companyComparison.every((row) => row.id === company.id), 'company filter must exclude other companies');
  equal(companyOnly.current.revenueMinor, all.companyComparison.find((row) => row.id === company.id)?.totals.revenueMinor, 'company totals must match the all-company contribution');
  const account = dataModule.marketplaceAccounts[0];
  const accountOnly = aggregation.aggregateDashboardAnalytics(dataset, { ...input, context: { ...baseContext, companyId: account.companyId, marketplace: account.marketplace, marketplaceAccountIds: [account.id] } });
  expect(accountOnly.accountComparison.length === 1 && accountOnly.accountComparison[0].id === account.id, 'account filter must exclude every unrelated account');
  expect(accountOnly.marketplaceComparison.every((row) => row.id === account.marketplace), 'account filter must exclude unrelated marketplaces');

  const custom = aggregation.aggregateDashboardAnalytics(dataset, { ...input, context: { ...baseContext, dateRange: { from: '2026-08-01', to: '2026-08-15' } } });
  expect(custom.current.revenueMinor !== all.current.revenueMinor, 'custom date range must recalculate values');
  const month = aggregation.aggregateDashboardAnalytics(dataset, { ...input, context: { ...baseContext, dateRange: { from: '2026-08-01', to: '2026-08-27' } } });
  expect(month.current.revenueMinor !== custom.current.revenueMinor, 'month-to-date and custom dates must not reuse a fixed aggregate');

  const missing = aggregation.aggregateDashboardAnalytics(dataset, { ...input, scenarioId: 'cogs-none' });
  equal(missing.current.cogsCoverageBps, 0, 'COGS 0% scenario must have zero record coverage');
  equal(missing.current.netProfitMinor, null, 'incomplete COGS must not expose a complete Net Profit');
  expect(missing.topProducts.length === 0, 'missing-COGS products must be excluded from Top Net Profit ranking');
  expect(missing.needsReview.some((product) => product.issue === 'missing_cogs'), 'missing-COGS products must appear in Needs Review');
  const partial = aggregation.aggregateDashboardAnalytics(dataset, { ...input, scenarioId: 'partial-cogs' });
  expect(partial.current.cogsCoverageBps > 0 && partial.current.cogsCoverageBps < 10_000, 'partial COGS must report real partial coverage');
  equal(partial.current.netProfitMinor, null, 'partial COGS must not expose complete Net Profit');
  expect(partial.current.profitabilityCoverageBps > 0 && partial.current.profitabilityCoverageBps < 10_000, 'partial COGS must expose revenue-weighted profitability coverage');
  equal(partial.current.knownNetProfitMinor, partial.current.covered.netProfitMinor, 'partial known Net Profit must equal the cost-complete cohort result');
  equal(partial.current.knownMarginBps, calculations.safeRatioBps(partial.current.covered.netProfitMinor, partial.current.covered.netRevenueMinor), 'partial known Margin must use covered Net Revenue as its denominator');

  const preparedRecord = (overrides = {}) => ({
    id: 'covered-record', transactionId: 'covered-transaction', occurredOn: '2026-08-20',
    organisationId: dataModule.organisation.id, companyId: dataModule.companies[0].id,
    marketplace: 'amazon', marketplaceAccountId: dataModule.marketplaceAccounts[0].id,
    productId: dataset.products[0].id, listingId: dataset.listings[0].id,
    orders: 1, refundedOrders: 0, units: 1, sourceCurrency: 'GBP', reportingCurrency: 'GBP',
    sourceToReportingRateBps: 10_000, grossSalesMinor: 10_000, discountsMinor: 0,
    refundsMinor: 0, cogsMinor: 6_000, marketplaceFeesMinor: 1_000,
    advertisingMinor: 500, advertisingDataState: 'complete', shippingMinor: 500,
    otherDirectCostsMinor: 250, allocatedExpensesMinor: 250,
    ...overrides,
  });
  const coveredRecord = preparedRecord();
  const missingCogsRecord = preparedRecord({
    id: 'missing-cogs-record', transactionId: 'missing-cogs-transaction', productId: dataset.products[1].id,
    orders: 9, units: 12, grossSalesMinor: 90_000, discountsMinor: 1_000, refundsMinor: 4_000,
    cogsMinor: null, marketplaceFeesMinor: 9_000, advertisingMinor: 2_000,
    shippingMinor: 3_000, otherDirectCostsMinor: 1_000, allocatedExpensesMinor: 500,
  });
  const coveredOnlyTotals = aggregation.calculateDashboardTotals([coveredRecord]);
  const mixedCoverageTotals = aggregation.calculateDashboardTotals([coveredRecord, missingCogsRecord]);
  equal(missingCogsRecord.cogsMinor, null, 'missing transaction COGS must remain null, never zero');
  equal(mixedCoverageTotals.revenueMinor, coveredOnlyTotals.revenueMinor + 89_000, 'full Revenue must retain the missing-COGS transaction');
  equal(mixedCoverageTotals.orders, coveredOnlyTotals.orders + 9, 'full Orders must retain the missing-COGS transaction');
  equal(mixedCoverageTotals.units, coveredOnlyTotals.units + 12, 'full Units must retain the missing-COGS transaction');
  equal(mixedCoverageTotals.covered.netRevenueMinor, coveredOnlyTotals.covered.netRevenueMinor, 'covered Net Revenue must exclude the missing-COGS transaction');
  equal(mixedCoverageTotals.covered.marketplaceFeesMinor, coveredOnlyTotals.covered.marketplaceFeesMinor, 'covered fees must exclude the missing-COGS transaction');
  equal(mixedCoverageTotals.covered.advertisingMinor, coveredOnlyTotals.covered.advertisingMinor, 'covered advertising must exclude the missing-COGS transaction');
  equal(mixedCoverageTotals.covered.shippingMinor, coveredOnlyTotals.covered.shippingMinor, 'covered shipping must exclude the missing-COGS transaction');
  equal(mixedCoverageTotals.covered.otherDirectCostsMinor, coveredOnlyTotals.covered.otherDirectCostsMinor, 'covered direct costs must exclude the missing-COGS transaction');
  equal(mixedCoverageTotals.covered.allocatedExpensesMinor, coveredOnlyTotals.covered.allocatedExpensesMinor, 'covered allocated expenses must exclude the missing-COGS transaction');
  equal(mixedCoverageTotals.knownNetProfitMinor, coveredOnlyTotals.knownNetProfitMinor, 'unknown COGS must never increase known profitability');
  equal(mixedCoverageTotals.knownMarginBps, 1_500, 'covered Margin must divide £15 covered profit by £100 covered Net Revenue');
  equal(mixedCoverageTotals.profitabilityCoverageBps, Math.round((10_000 * 10_000) / 95_000), 'profitability coverage must be weighted by covered Net Revenue');
  equal(
    mixedCoverageTotals.covered.netProfitMinor,
    mixedCoverageTotals.covered.netRevenueMinor - mixedCoverageTotals.covered.cogsMinor - mixedCoverageTotals.covered.marketplaceFeesMinor - mixedCoverageTotals.covered.advertisingMinor - mixedCoverageTotals.covered.shippingMinor - mixedCoverageTotals.covered.otherDirectCostsMinor - mixedCoverageTotals.covered.allocatedExpensesMinor,
    'covered cohort profitability must reconcile after every applicable cost',
  );
  const missingAdvertisingRecord = preparedRecord({ id: 'missing-ad-record', transactionId: 'missing-ad-transaction', advertisingMinor: null, advertisingDataState: 'partial', grossSalesMinor: 20_000 });
  const advertisingIncompleteTotals = aggregation.calculateDashboardTotals([coveredRecord, missingAdvertisingRecord]);
  equal(advertisingIncompleteTotals.knownNetProfitMinor, coveredOnlyTotals.knownNetProfitMinor, 'missing advertising must not be treated as zero in known Net Profit');
  equal(advertisingIncompleteTotals.covered.netRevenueMinor, coveredOnlyTotals.covered.netRevenueMinor, 'profitability cohort must exclude any transaction with a nullable cost input');
  const uncoveredTotals = aggregation.calculateDashboardTotals([missingCogsRecord]);
  equal(uncoveredTotals.knownNetProfitMinor, null, 'zero cost-covered sales must make known Net Profit unavailable');
  equal(uncoveredTotals.knownMarginBps, null, 'zero cost-covered sales must make known Margin unavailable');
  const incompleteTransaction = calculations.deriveDetailedProfitability({ grossSalesMinor: 90_000, discountsMinor: 1_000, refundsMinor: 4_000, cogsMinor: null, marketplaceFeesMinor: 9_000, advertisingMinor: 2_000, shippingMinor: 3_000, otherDirectCostsMinor: 1_000, allocatedExpensesMinor: 500 });
  equal(incompleteTransaction.cogsKnownMinor, null, 'transaction-level missing COGS must not be coerced to zero');
  equal(incompleteTransaction.knownNetProfitMinor, null, 'an incomplete transaction must not emit a profit value');
  const noResults = aggregation.aggregateDashboardAnalytics(dataset, { ...input, scenarioId: 'no-results' });
  equal(noResults.current.orders, 0, 'No Results scenario must return zero orders');
  equal(noResults.current.marginBps, null, 'No Results scenario must avoid meaningless margin');

  equal(all.metrics.netProfit.delta.valueBps, calculations.percentageDeltaBps(all.current.knownNetProfitMinor, all.previous.knownNetProfitMinor), 'equivalent covered cohorts must use the covered-profit period delta');
  equal(all.metrics.margin.delta.valueBps, calculations.marginPointDeltaBps(all.current.knownMarginBps, all.previous.knownMarginBps), 'equivalent covered cohorts must use the covered-margin point delta');
  const representativeCurrentRecord = dataset.records.find((record) => record.occurredOn >= baseContext.dateRange.from && record.occurredOn <= baseContext.dateRange.to && record.cogsMinor !== null);
  expect(Boolean(representativeCurrentRecord), 'comparison mismatch fixture needs one current covered product');
  const comparisonMismatchDataset = {
    ...dataset,
    records: dataset.records.map((record) => record.occurredOn >= baseContext.dateRange.from
      && record.occurredOn <= baseContext.dateRange.to
      && record.productId !== representativeCurrentRecord?.productId
      ? { ...record, cogsMinor: null }
      : record),
  };
  const coverageMismatch = aggregation.aggregateDashboardAnalytics(comparisonMismatchDataset, input);
  expect(coverageMismatch.current.profitabilityCoverageBps > 0 && coverageMismatch.current.profitabilityCoverageBps < 9_500, 'comparison mismatch fixture must retain a small covered current cohort');
  expect(!coverageMismatch.profitabilityComparison.available && coverageMismatch.profitabilityComparison.reason === 'coverage_mismatch', 'materially different cost coverage must make profitability comparison unavailable');
  equal(coverageMismatch.metrics.netProfit.delta.valueBps, null, 'Net Profit delta must be unavailable for materially different coverage');
  equal(coverageMismatch.metrics.margin.delta.valueBps, null, 'Margin delta must be unavailable for materially different coverage');
  expect(coverageMismatch.trend.every((point) => point.previousKnownNetProfitMinor === null && point.previousMarginBps === null), 'profit trend must withhold the previous series when coverage is not comparable');
  equal(coverageMismatch.current.knownNetProfitMinor, coverageMismatch.current.covered.netProfitMinor, 'mismatched-period current profit must still use its covered cohort');

  const zeroRevenue = calculations.deriveDetailedProfitability({ grossSalesMinor: 0, discountsMinor: 0, refundsMinor: 0, cogsMinor: 0, marketplaceFeesMinor: 0, advertisingMinor: 0, shippingMinor: 0, otherDirectCostsMinor: 0, allocatedExpensesMinor: 0 });
  equal(zeroRevenue.marginBps, null, 'zero revenue must not produce NaN or Infinity margin');
  const negativeProfit = calculations.deriveDetailedProfitability({ grossSalesMinor: 10_000, discountsMinor: 0, refundsMinor: 0, cogsMinor: 8_000, marketplaceFeesMinor: 2_000, advertisingMinor: 2_000, shippingMinor: 1_000, otherDirectCostsMinor: 500, allocatedExpensesMinor: 500 });
  expect((negativeProfit.marginBps ?? 0) < 0 && Number.isFinite(negativeProfit.marginBps), 'negative profit must produce a finite negative margin');
  expect(all.needsReview.some((product) => product.issue === 'loss_making'), 'deterministic data must include genuinely loss-making products');
  for (const negligible of [-4, -3, -2, -1, 0, 1, 2, 3, 4]) {
    equal(sharedCalculations.normaliseDisplayBps(negligible), 0, `${negligible} bps must normalize to neutral zero`);
    equal(sharedCalculations.formatPercentage(negligible, { signed: true }), '0.0%', `${negligible} bps must render without a sign`);
  }
  equal(sharedCalculations.formatPercentage(-5, { signed: true }), '-0.1%', '-5 bps must retain a negative one-decimal change');
  equal(sharedCalculations.formatPercentage(5, { signed: true }), '+0.1%', '+5 bps must retain a positive one-decimal change');
  const kpiSource = readFileSync(pathFor('src/features/dashboard/kpi-strip.tsx'), 'utf8');
  const patternSource = readFileSync(pathFor('src/components/product/patterns.tsx'), 'utf8');
  expect(kpiSource.includes('normaliseDisplayBps(metric.delta.valueBps)'), 'KPI semantic tone must use normalized display deltas');
  expect(patternSource.includes('const value = normaliseDisplayBps(bps)'), 'shared PercentageDelta semantic tone must use normalized display deltas');

  const eurRecord = dataset.records.find((record) => record.sourceCurrency === 'EUR');
  expect(Boolean(eurRecord), 'dataset must retain a non-reporting source currency');
  if (eurRecord) equal(calculations.normaliseMinor(eurRecord.grossSalesMinor, eurRecord.sourceToReportingRateBps), Math.round(eurRecord.grossSalesMinor * 0.86), 'EUR source value must use the fixed deterministic reporting rate');
  equal(all.current.currency, 'GBP', 'combined Dashboard must use the organisation reporting currency');

  const onboarding = aggregation.aggregateDashboardAnalytics(dataset, { ...input, cogsReadiness: { productsImported: 2_480, cogsComplete: 2_124, cogsMissing: 356, coveragePercent: 86, reliableProfitability: false } });
  equal(onboarding.health.cogsCoverageBps, 8_600, 'onboarding COGS coverage must carry into Dashboard health');
  equal(onboarding.health.missingCogsProducts, 356, 'onboarding missing COGS count must carry into Dashboard attention');
  expect(onboarding.health.state === 'partial', 'onboarding partial COGS must mark profitability partial');
  const onboardingCompany = aggregation.aggregateDashboardAnalytics(dataset, { ...input, context: { ...baseContext, companyId: company.id }, cogsReadiness: { productsImported: 2_480, cogsComplete: 2_124, cogsMissing: 356, coveragePercent: 86, reliableProfitability: false } });
  expect(onboardingCompany.health.missingCogsProducts !== 356, 'company filtering must replace the organisation-wide onboarding missing count with selected-scope fixture truth');

  const delayedAccounts = dataModule.marketplaceAccounts.map((candidate) => candidate.marketplace === 'amazon' ? { ...candidate, status: 'delayed' } : candidate);
  const delayed = aggregation.aggregateDashboardAnalytics(dataset, { ...input, scenarioId: 'amazon-delayed', marketplaceAccounts: delayedAccounts });
  expect(delayed.sync.some((item) => item.marketplace === 'amazon' && item.state === 'partial'), 'Amazon delayed scenario must surface scoped partial sync');
  const failedAccounts = dataModule.marketplaceAccounts.map((candidate) => candidate.marketplace === 'ebay' ? { ...candidate, status: 'authentication_required' } : candidate);
  const failed = aggregation.aggregateDashboardAnalytics(dataset, { ...input, scenarioId: 'ebay-auth-failed', marketplaceAccounts: failedAccounts });
  expect(failed.sync.some((item) => item.marketplace === 'ebay' && item.state === 'failed'), 'eBay auth scenario must surface scoped failure');
  const importing = aggregation.aggregateDashboardAnalytics(dataset, { ...input, scenarioId: 'first-sync' });
  expect(importing.health.revenueCompletenessBps > 0 && importing.health.revenueCompletenessBps < 10_000, 'initial import revenue completeness must be derived from present versus baseline records');
  const importErrors = aggregation.aggregateDashboardAnalytics(dataset, { ...input, scenarioId: 'import-errors' });
  expect(importErrors.health.state !== 'healthy' && importErrors.health.title !== 'Data up to date', 'import errors must not contradict the Context Bar with a healthy Dashboard banner');

  const sharedResult = sharedCalculations.deriveProfitability({ grossRevenuePence: 50_000, refundsPence: 1_000, cogsPence: 20_000, marketplaceFeesPence: 5_000, advertisingPence: 2_000, shippingPence: 1_500, otherDirectCostsPence: 700, allocatedExpensesPence: 800 });
  const detailedResult = calculations.deriveDetailedProfitability({ grossSalesMinor: 50_000, discountsMinor: 0, refundsMinor: 1_000, cogsMinor: 20_000, marketplaceFeesMinor: 5_000, advertisingMinor: 2_000, shippingMinor: 1_500, otherDirectCostsMinor: 700, allocatedExpensesMinor: 800 });
  equal(sharedResult.netProfitPence, detailedResult.netProfitMinor, 'Products and Dashboard must delegate to the same profitability engine');

  const copilot = new MockCopilotRepository();
  const copilotContextFor = (analytics) => ({
    module: 'marketplace-profitability', page: 'dashboard', organisationId: dataModule.organisation.id,
    companyScope: 'All authorised companies', dateRange: baseContext.dateRange,
    dashboardSnapshot: {
      revenuePence: analytics.current.revenueMinor, previousRevenuePence: analytics.previous.revenueMinor,
      knownNetProfitPence: analytics.current.knownNetProfitMinor, previousKnownNetProfitPence: analytics.previous.knownNetProfitMinor,
      marginBps: analytics.current.knownMarginBps, previousMarginBps: analytics.previous.knownMarginBps,
      refundsPence: analytics.current.refundsMinor, previousRefundsPence: analytics.previous.refundsMinor,
      marketplaceFeesPence: analytics.current.marketplaceFeesMinor, previousMarketplaceFeesPence: analytics.previous.marketplaceFeesMinor,
      advertisingPence: analytics.current.advertisingKnownMinor, previousAdvertisingPence: analytics.previous.advertisingKnownMinor,
      cogsCoverageBps: analytics.current.cogsCoverageBps,
      profitabilityCoverageBps: analytics.current.profitabilityCoverageBps,
      previousProfitabilityCoverageBps: analytics.previous.profitabilityCoverageBps,
      coveredNetRevenuePence: analytics.current.covered.netRevenueMinor,
      profitComparisonAvailable: analytics.profitabilityComparison.available,
      missingCogsProducts: analytics.health.missingCogsProducts, affectedRevenuePence: analytics.health.affectedRevenueMinor,
      mostProfitableMarketplace: 'Amazon',
      mostProfitableMarketplacePence: analytics.marketplaceComparison.find((row) => row.id === 'amazon')?.totals.knownNetProfitMinor ?? null,
      priorityProduct: analytics.needsReview[0]?.name ?? null, priorityProductIssue: analytics.needsReview[0]?.issue ?? null,
      profitabilityComplete: analytics.current.profitabilityComplete,
    },
  });
  const copilotContext = copilotContextFor(all);
  const feesAnswer = await copilot.ask('Explain my marketplace fees.', copilotContext);
  const cogsAnswer = await copilot.ask('How much is missing COGS affecting this view?', copilotContext);
  expect(feesAnswer.includes('Marketplace fees are') && !feesAnswer.includes('products have incomplete COGS'), 'Copilot fee answer must respond to the selected question with grounded fee data');
  expect(cogsAnswer.includes('products have incomplete COGS') && cogsAnswer.includes('affecting'), 'Copilot COGS answer must be question-specific and disclose affected revenue');
  const mismatchCopilotContext = copilotContextFor(coverageMismatch);
  const mismatchOverview = await copilot.overview(mismatchCopilotContext, 'healthy');
  const mismatchAnswer = await copilot.ask('Why did profit change this period?', mismatchCopilotContext);
  expect(mismatchOverview.summary.includes(sharedCalculations.formatMoney(coverageMismatch.current.knownNetProfitMinor)), 'Copilot must use the Dashboard covered-profit value');
  expect(mismatchOverview.summary.includes(sharedCalculations.formatPercentage(coverageMismatch.current.profitabilityCoverageBps)), 'Copilot must use the Dashboard profitability coverage');
  expect(mismatchOverview.summary.toLowerCase().includes('comparison is unavailable'), 'Copilot overview must disclose unavailable profit comparison');
  expect(mismatchAnswer.toLowerCase().includes('comparison is unavailable'), 'Copilot answer must disclose unavailable profit comparison');
  expect(!/\b(improved|increased|up)\b/i.test(mismatchOverview.summary), 'Copilot must not describe incomparable partial profit as an improvement');
  const negligibleCopilotContext = copilotContextFor(all);
  negligibleCopilotContext.dashboardSnapshot.revenuePence = 999_600;
  negligibleCopilotContext.dashboardSnapshot.previousRevenuePence = 1_000_000;
  const negligibleOverview = await copilot.overview(negligibleCopilotContext, 'healthy');
  const negligibleRevenueFinding = negligibleOverview.findings.find((finding) => finding.id === 'revenue-change');
  expect(negligibleRevenueFinding?.title.includes('unchanged') && negligibleRevenueFinding.tone === 'neutral', 'Copilot must treat a rounded 0.0% change as neutral');
  expect(!JSON.stringify(negligibleOverview).includes('-0.0%'), 'Copilot must never render a negligible decline as -0.0%');

  const keyInput = { context: { ...baseContext, marketplaceAccountIds: [dataModule.marketplaceAccounts[1].id, dataModule.marketplaceAccounts[0].id] }, scenarioId: 'healthy', realmKey: 'admin:healthy', authorisedCompanyIds: input.authorisedCompanyIds, authorisedAccountIds: [...input.authorisedAccountIds].reverse() };
  const canonicalKey = queryKeys.dashboard(keyInput);
  const reorderedKey = queryKeys.dashboard({ ...keyInput, context: { ...keyInput.context, marketplaceAccountIds: [...keyInput.context.marketplaceAccountIds].reverse() }, authorisedCompanyIds: [...keyInput.authorisedCompanyIds].reverse(), authorisedAccountIds: [...keyInput.authorisedAccountIds].reverse() });
  expect(JSON.stringify(canonicalKey) === JSON.stringify(reorderedKey), 'Dashboard query keys must canonicalise account and authorisation arrays');
  const changedKey = queryKeys.dashboard({ ...keyInput, context: { ...keyInput.context, marketplace: 'amazon' } });
  expect(JSON.stringify(canonicalKey) !== JSON.stringify(changedKey), 'Dashboard query key must change with analytical scope');
} catch (error) {
  failures.push(`analytics validator crashed: ${error?.stack ?? error}`);
}

if (failures.length) {
  console.error('\nPhase 3 analytics validation failed:\n');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Phase 3 analytics validation passed: covered-cohort profit, revenue-weighted coverage, comparable periods, Copilot parity, neutral zero deltas, and minor-unit reconciliation.');
