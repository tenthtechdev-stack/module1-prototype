import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, load, root } from './lib/validation-runtime.mjs';

const failures = [];
let assertions = 0;
const expect = (condition, message) => { assertions++; if (!condition) failures.push(message); };
const equal = (actual, expected, message) => expect(actual === expected, `${message}: expected ${expected}, got ${actual}`);
const sum = (rows, key) => rows.reduce((total, row) => total + (row[key] ?? 0), 0);
const reject = async (action, message) => { try { await action(); expect(false, message); } catch { expect(true, message); } };
const report = { checks: [], examples: {}, scenarios: [], assertions: 0, failures };

try {
  const data = await load('src/fixtures/data.ts');
  const { ROLE_PRESETS, PREVIEW_ASSIGNMENTS } = await load('src/domain/permissions.ts');
  const { generateAnalyticsDataset } = await load('src/fixtures/analytics-data.ts');
  const { materializeApprovedCogsDataset } = await load('src/services/mock/cogs-dataset.ts');
  const tx = await load('src/services/analytics/transaction-aggregation.ts');
  const dashboard = await load('src/services/analytics/analytics-aggregation.ts');
  const products = await load('src/services/analytics/product-aggregation.ts');
  const { MockTransactionsRepository } = await load('src/services/mock/transactions-repository.ts');
  const { MockProductGroupsRepository } = await load('src/services/mock/product-groups-repository.ts');
  const { mockProductGroupsStore, organisationProductGroupsState } = await load('src/services/mock/product-groups-store.ts');
  const { normaliseMinor, resolveHistoricalUnitCogs } = await load('src/domain/financial-calculations.ts');
  const { transactionCopilotSnapshot } = await load('src/services/mappers/transaction-copilot-snapshot.ts');
  const { MockCopilotRepository } = await load('src/services/mock/copilot-repository.ts');
  const { formatMoney } = await load('src/domain/calculations.ts');
  const { resolveDateRange } = await load('src/domain/date-ranges.ts');
  const makeInput = (roleId = 'admin', scenarioId = 'healthy') => ({
    context: { organisationId: data.organisation.id, companyId: 'all', marketplace: 'all', marketplaceAccountIds: [], dateRange: { from: '2026-08-09', to: '2026-09-07' } },
    organisation: data.organisation, companies: data.companies, marketplaceAccounts: data.marketplaceAccounts,
    scenarioId, authorisedCompanyIds: data.companies.map((c) => c.id), authorisedAccountIds: data.marketplaceAccounts.map((a) => a.id), reportingCurrency: 'GBP',
    canViewSensitiveExpenses: true, cogsReadiness: null,
    principal: { role: ROLE_PRESETS.find((r) => r.id === roleId), assignment: PREVIEW_ASSIGNMENTS[roleId], subscriptionStatus: 'active', entitlements: ['marketplace-profitability'] },
  });
  const input = makeInput();
  const base = generateAnalyticsDataset(input);
  const dataset = materializeApprovedCogsDataset(base, data.organisation.id);
  const repository = new MockTransactionsRepository();
  const snapshot = tx.createTransactionAnalyticsSnapshot(dataset, input);
  const rows = snapshot.transactions;
  report.transactionsInDefaultPeriod = rows.length;
  expect(rows.length >= 2000, 'At least 2,000 deterministic canonical sale lines');
  equal(new Set(rows.map((r) => r.id)).size, rows.length, 'Stable transaction IDs are unique');
  expect(rows.every((r) => r.quantity > 0 && Number.isInteger(r.quantity)), 'Sold quantities are positive integers');
  const fields = { revenueMinor: 'revenueMinor', refundsMinor: 'refundsMinor', cogsMinor: 'cogsKnownMinor', marketplaceFeesMinor: 'marketplaceFeesMinor', advertisingMinor: 'advertisingKnownMinor', shippingMinor: 'shippingMinor', otherDirectCostsMinor: 'otherDirectCostsMinor', allocatedExpensesMinor: 'allocatedExpensesMinor', knownNetProfitMinor: 'knownNetProfitMinor' };
  function reconcile(candidateRows, totals, label) {
    for (const [rowKey, totalKey] of Object.entries(fields)) equal(sum(candidateRows, rowKey), totals[totalKey] ?? 0, `${label}: ${totalKey}`);
    equal(sum(candidateRows, 'quantity'), totals.units, `${label}: units`);
  }
  const parents = dashboard.filterProfitabilityRecords(dashboard.prepareProfitabilityRecords(dataset, input), input.context);
  reconcile(rows, dashboard.calculateDashboardTotals(parents), 'Dashboard exact minor-unit reconciliation');
  const summary = tx.transactionSummary(snapshot, rows);
  equal(summary.profitabilityCoverageBps, dashboard.calculateDashboardTotals(parents).profitabilityCoverageBps, 'Dashboard coverage reconciliation');
  for (const line of snapshot.lines) {
    const events = tx.transactionSourceEvents(line);
    expect(Object.values(line.reportingFeeComponents).every((amount) => amount >= 0), `No invented fee credit ${line.id}`);
    for (const event of events) {
      if (event.currency === 'GBP') equal(event.amountMinor, event.reportingAmountMinor, `Same-currency source evidence ${event.id}`);
      if (event.eventType === 'marketplace-fee') expect(event.reportingAmountMinor <= 0, `Fee direction remains deduction ${event.id}`);
    }
  }
  for (const row of rows) {
    equal(row.revenueMinor - row.refundsMinor, row.netRevenueMinor, `Net Revenue ${row.id}`);
    if (row.cogsMinor !== null) equal(row.unitCogsMinor * row.quantity, row.cogsMinor, `Quantity COGS ${row.id}`);
    else { equal(row.knownNetProfitMinor, null, `Missing COGS profit ${row.id}`); equal(row.unitCogsMinor, null, `Missing COGS unit ${row.id}`); }
    if (row.knownNetProfitMinor !== null) equal(row.revenueMinor - row.refundsMinor - row.cogsMinor - row.marketplaceFeesMinor - row.advertisingMinor - row.shippingMinor - row.otherDirectCostsMinor - row.allocatedExpensesMinor, row.knownNetProfitMinor, `Waterfall ${row.id}`);
  }
  for (const marketplace of ['amazon', 'ebay', 'temu']) {
    const scoped = { ...input, context: { ...input.context, marketplace } };
    const slice = tx.createTransactionAnalyticsSnapshot(dataset, scoped).transactions;
    reconcile(slice, dashboard.calculateDashboardTotals(dashboard.filterProfitabilityRecords(dashboard.prepareProfitabilityRecords(dataset, scoped), scoped.context)), `${marketplace} Dashboard`);
    expect(slice.length > 0 && slice.every((r) => r.marketplace === marketplace), `${marketplace} filter`);
    report.examples[marketplace] = slice.find((r) => r.knownNetProfitMinor > 0)?.id;
  }
  const productId = rows[0].productId;
  const productTotals = products.aggregateProductProfitability(dataset, { ...input, productId }).totals;
  reconcile(rows.filter((r) => r.productId === productId), productTotals, 'Product Detail');
  const groups = new MockProductGroupsRepository();
  const groupState = organisationProductGroupsState(mockProductGroupsStore.read(), data.organisation.id);
  for (const groupId of Object.keys(groupState.groups)) {
    const detail = await groups.getById({ ...input, groupId, asOf: '2026-09-07' });
    const selected = tx.filterTransactionSnapshot(snapshot, { ...input, productGroupId: groupId });
    equal(sum(selected, 'revenueMinor'), detail.profitability.revenueMinor, `${groupId}: Group Revenue`);
    equal(sum(selected, 'cogsMinor'), detail.profitability.cogsMinor, `${groupId}: Group COGS`);
    equal(sum(selected, 'knownNetProfitMinor'), detail.profitability.knownNetProfitMinor ?? 0, `${groupId}: Group Net Profit`);
  }
  const historicalInput = { ...input, context: { ...input.context, dateRange: { from: '2026-01-01', to: '2026-09-07' } } };
  const historical = tx.createTransactionAnalyticsSnapshot(dataset, historicalInput).transactions;
  report.transactionsInFixturePeriod = historical.length;
  // Stock Supplies' gloves inherit Phase 5 Group COGS; the Company-owned
  // direct-cost reference Product retains the original Phase 3 history.
  const blue = dataset.products.find((p) => p.title === 'Blue Nitrile Gloves XL'
    && !dataset.cogsHistory.some((rate) => rate.productId === p.id && rate.inheritance));
  expect(Boolean(blue), 'Blue Nitrile Gloves historical fixture exists');
  if (blue) for (const [from, to, amount] of [['2026-01-01', '2026-03-31', 650], ['2026-04-01', '2026-07-31', 690], ['2026-08-01', '2026-09-07', 720]]) {
    const sample = historical.filter((r) => r.productId === blue.id && r.transactionDate >= from && r.transactionDate <= to);
    expect(sample.length > 0 && sample.every((r) => r.unitCogsMinor === amount), `Blue Gloves direct COGS ${from}: ${amount}`);
  }
  const inherited = historical.filter((r) => r.cogsSource === 'inherited');
  expect(inherited.length > 0, 'Inherited transaction fixtures exist');
  for (const row of inherited) equal(row.unitCogsMinor, resolveHistoricalUnitCogs(dataset.cogsHistory, row.productId, row.transactionDate), `Historical Group COGS ${row.id}`);
  const gloveMembers = groupState.membershipsByGroup['grp-disposable-gloves'] ?? [];
  for (const pack of [25, 50]) {
    const member = gloveMembers.find((m) => m.packQuantity === pack);
    const early = historical.find((r) => r.productId === member?.productId && r.transactionDate < '2026-04-01' && r.cogsSource === 'inherited');
    const later = historical.find((r) => r.productId === member?.productId && r.transactionDate >= '2026-04-01' && r.cogsSource === 'inherited');
    equal(early?.unitCogsMinor, pack * 10, `${pack} pack pre-April`);
    equal(later?.unitCogsMinor, pack * 11, `${pack} pack post-April`);
  }
  const historicalMember = gloveMembers.find((m) => m.packQuantity === 80);
  if (historicalMember) {
    equal(historical.find((r) => r.productId === historicalMember.productId && r.transactionDate < '2026-04-01')?.unitCogsMinor, 800, 'Historical 80-pack membership remains 80');
    equal(historical.find((r) => r.productId === historicalMember.productId && r.transactionDate >= '2026-04-01')?.unitCogsMinor, 1100, 'New 100-pack membership applies from April');
  }
  // Direct override projection uses the same approved records as Phase 5, with no store mutation.
  const member = gloveMembers.find((m) => m.packQuantity === 25);
  const override = { id: 'phase6-validator-override', organisationId: data.organisation.id, companyId: member.companyId, productId: member.productId, unitCostMinor: 749, currency: 'GBP', effectiveFrom: '2026-09-01', effectiveTo: null, status: 'active', source: 'spreadsheet-import', sourceReferenceId: 'supplier-costs-sep-2026.xlsx', reason: 'Historical override validation', createdByUserId: 'usr-finance', createdByName: 'Finance', createdAt: '2026-09-01T09:00:00Z', changedByUserId: 'usr-finance', approvedByUserId: 'usr-finance', approvedByName: 'Finance', approvedAt: '2026-09-01T10:00:00Z', approvalStatus: 'approved' };
  const overriddenDataset = materializeApprovedCogsDataset(base, data.organisation.id, { [member.productId]: [override] });
  const overriddenRows = tx.createTransactionAnalyticsSnapshot(overriddenDataset, input).transactions.filter((r) => r.productId === member.productId);
  expect(overriddenRows.filter((r) => r.transactionDate < '2026-09-01').every((r) => r.cogsSource === 'inherited' && r.unitCogsMinor === 275), 'Direct override does not affect earlier Group COGS');
  expect(overriddenRows.filter((r) => r.transactionDate >= '2026-09-01').every((r) => r.cogsSource === 'direct' && r.unitCogsMinor === 749), 'Direct override wins only from effective date');
  const categories = {
    loss: (r) => r.knownNetProfitMinor < 0, lowMargin: (r) => r.profitabilityStatus === 'low_margin',
    refund: (r) => r.refundState === 'full', partialRefund: (r) => r.refundState === 'partial',
    inherited: (r) => r.cogsSource === 'inherited', direct: (r) => r.cogsSource === 'direct',
    missing: (r) => r.cogsMinor === null, eur: (r) => r.sourceCurrency === 'EUR', highFees: (r) => r.highFees,
  };
  for (const [name, predicate] of Object.entries(categories)) {
    const sampleInput = name === 'missing' ? makeInput('admin', 'partial-cogs') : input;
    const candidates = name === 'missing' ? tx.createTransactionAnalyticsSnapshot(dataset, sampleInput).transactions : rows;
    const sample = candidates.find(predicate);
    expect(Boolean(sample), `${name} fixture available`);
    if (!sample) continue;
    report.examples[name] = sample.id;
    const detail = await repository.getTransaction({ ...sampleInput, transactionId: sample.id });
    expect(Boolean(detail), `${name} repository lookup`);
    for (const [component, key] of Object.entries({ revenue: 'revenueMinor', refunds: 'refundsMinor', marketplaceFees: 'marketplaceFeesMinor', advertising: 'advertisingMinor', shipping: 'shippingMinor', otherDirectCosts: 'otherDirectCostsMinor' })) {
      if (sample[key] === null) continue;
      equal(sum(detail.sourceEvents.filter((e) => e.component === component), 'reportingAmountMinor'), component === 'revenue' ? sample[key] : -sample[key], `${name} events ${component}`);
    }
    equal(sum(detail.fees, 'amountMinor'), sample.marketplaceFeesMinor, `${name} fee breakdown exact`);
    expect(detail.sourceEvents.every((e) => e.profitabilityTransactionId === sample.id && e.organisationId === data.organisation.id), `${name} source event identity`);
    const snap = transactionCopilotSnapshot(detail, `/o/stock-supplies/transactions/${encodeURIComponent(sample.id)}?from=2026-08-09&to=2026-09-07`, true);
    const copilot = new MockCopilotRepository();
    const answer = await copilot.ask('Explain this transaction profit', { organisationId: data.organisation.id, module: 'marketplace-profitability', page: 'transaction detail', transactionSnapshot: snap });
    expect(answer.includes(sample.id), `${name} Copilot grounded transaction ID`);
    if (sample.knownNetProfitMinor !== null) expect(answer.includes(formatMoney(Math.abs(sample.knownNetProfitMinor))), `${name} Copilot exact repository profit`);
    else expect(answer.toLowerCase().includes('incomplete'), `${name} Copilot missing data`);
    if (name === 'eur') equal(sample.sourceToReportingRateBps, 8600, 'EUR rate matches canonical FX');
  }
  equal(normaliseMinor(10000, 8600), 8600, 'Deterministic EUR to GBP');
  const duplicateOrder = rows.find((r, i) => rows.findIndex((p) => p.marketplaceOrderId === r.marketplaceOrderId && p.marketplaceAccountId === r.marketplaceAccountId) !== i);
  expect(Boolean(duplicateOrder), 'Multi-item shared Order ID fixture');
  const paged = await repository.listTransactions({ ...input, pageSize: 25, page: 0 });
  const second = await repository.listTransactions({ ...input, pageSize: 25, page: 1 });
  equal(paged.items.length, 25, 'Pagination size');
  expect(!second.items.some((r) => paged.items.some((p) => p.id === r.id)), 'Deterministic disjoint pages');
  equal(JSON.stringify(paged.items), JSON.stringify((await repository.listTransactions({ ...input, pageSize: 25, page: 0 })).items), 'Repeated pagination deterministic');
  const dates = resolveDateRange({ range: '90d', from: '2026-08-17', to: '2026-08-19' }).dateRange;
  equal(dates.from, '2026-08-17', 'Exact custom from beats preset'); equal(dates.to, '2026-08-19', 'Exact custom to beats preset');
  const custom = await repository.listTransactions({ ...input, context: { ...input.context, dateRange: dates } });
  equal(custom.total, rows.filter((r) => r.transactionDate >= dates.from && r.transactionDate <= dates.to).length, 'Exact custom date record count');
  const filterQuery = { ...input, productId, refundState: 'refunded' };
  const filteredPage = await repository.listTransactions(filterQuery);
  const exported = await repository.exportTransactions(filterQuery);
  equal(exported.recordCount, filteredPage.total, 'Export count equals authorised filtered view');
  const selected = await repository.exportTransactions({ ...input, selectedIds: paged.items.slice(0, 3).map((r) => r.id) });
  equal(selected.recordCount, 3, 'Selected export');
  for (const roleId of ['company-manager', 'marketplace-manager', 'auditor', 'cost-user']) {
    const restricted = makeInput(roleId);
    if (roleId === 'cost-user') { await reject(() => repository.listTransactions(restricted), 'Cost user cannot access transaction Revenue/profit'); continue; }
    const page = await repository.listTransactions(restricted);
    const assignment = PREVIEW_ASSIGNMENTS[roleId];
    expect(page.items.every((r) => (assignment.companyIds === 'all' || assignment.companyIds.includes(r.companyId)) && (assignment.accountIds === 'all' || assignment.accountIds.includes(r.marketplaceAccountId))), `${roleId} enforced assignments`);
    if (roleId === 'marketplace-manager') {
      equal(page.summary.allocatedExpensesMinor, null, 'Sensitive allocated expense summary redacted');
      const allowedDetail = await repository.getTransaction({ ...restricted, transactionId: page.items[0].id });
      equal(allowedDetail.transaction.allocatedExpensesMinor, null, 'Sensitive transaction expense redacted');
      equal(allowedDetail.transaction.knownNetProfitMinor, null, 'Phase 7 prevents deriving hidden expenses from canonical profit');
      equal(allowedDetail.transaction.knownMarginBps, null, 'Phase 7 also withholds derivable margin');
      equal(page.summary.knownNetProfitMinor, null, 'Restricted aggregate profit cannot disclose hidden expense totals');
      const managerExport = await repository.exportTransactions(restricted);
      expect(!managerExport.fields.some((f) => /allocated|sensitive/i.test(f)), 'Sensitive CSV fields absent');
      const foreign = rows.find((r) => !assignment.companyIds.includes(r.companyId));
      report.examples.restricted = foreign.id;
      equal(await repository.getTransaction({ ...restricted, transactionId: foreign.id }), null, 'Foreign direct lookup non-enumerating');
      equal((await repository.listTransactions({ ...restricted, search: foreign.id })).total, 0, 'Foreign search absent');
      equal((await repository.exportTransactions({ ...restricted, search: foreign.id })).recordCount, 0, 'Foreign export absent');
      equal((await repository.listSourceEvents({ ...restricted, transactionId: foreign.id })).length, 0, 'Foreign source events absent');
      equal((await repository.listTransactions({ ...restricted, productId: foreign.productId })).total, 0, 'Foreign Product filter absent');
    }
  }
  equal(await repository.getTransaction({ ...input, transactionId: 'unknown-transaction' }), null, 'Unknown direct lookup');
  const foreignOrg = { ...input, context: { ...input.context, organisationId: 'org-foreign' } };
  await reject(() => repository.listTransactions(foreignOrg), 'Cross-tenant context rejected');
  for (const scenarioId of ['healthy', 'cogs-none', 'partial-cogs', 'amazon-delayed', 'ebay-auth-failed', 'temu-import-running', 'no-marketplace', 'first-sync', 'no-results', 'repository-error']) {
    const scenario = makeInput('admin', scenarioId);
    if (scenarioId === 'repository-error') { await reject(() => repository.listTransactions(scenario), 'Repository error scenario'); report.scenarios.push({ scenarioId, result: 'retryable error' }); continue; }
    const page = await repository.listTransactions(scenario);
    report.scenarios.push({ scenarioId, transactions: page.total, coverage: page.summary.profitabilityCoverageBps, freshness: page.freshness.state });
    if (scenarioId === 'no-results' || scenarioId === 'no-marketplace') equal(page.total, 0, `${scenarioId} empty state`);
    if (scenarioId === 'cogs-none') { expect(page.summary.profitabilityCoverageBps < 10000, 'Missing-cost scenario remains incomplete'); expect(page.items.filter((r) => r.cogsMinor === null).every((r) => r.knownNetProfitMinor === null), 'Missing-cost scenario never displays zero profit'); }
    if (page.total > 0) { const scenarioRows = tx.createTransactionAnalyticsSnapshot(dataset, scenario).transactions; const parentTotals = dashboard.calculateDashboardTotals(dashboard.filterProfitabilityRecords(dashboard.prepareProfitabilityRecords(dataset, scenario), scenario.context)); reconcile(scenarioRows, parentTotals, `${scenarioId} Dashboard reconciliation`); }
  }
  const denied = makeInput(); denied.principal.subscriptionStatus = 'suspended';
  await reject(() => repository.listTransactions(denied), 'Subscription repository denial');
  const unavailable = makeInput(); unavailable.principal.entitlements = [];
  await reject(() => repository.listTransactions(unavailable), 'Module unavailable repository denial');
  report.checks.push('exact waterfall', 'quantity COGS', 'historical direct/Group COGS', 'effective membership', 'direct override precedence', 'Dashboard/Product/Group reconciliation', 'source events', 'FX', 'Copilot grounding', 'RBAC', 'export', 'dates', 'scenarios');
} catch (error) { failures.push(error.stack ?? String(error)); }
finally {
  report.assertions = assertions;
  mkdirSync(join(root, 'artifacts/phase-6-transactions'), { recursive: true });
  writeFileSync(join(root, 'artifacts/phase-6-transactions/validation.json'), JSON.stringify(report, null, 2));
  cleanup();
}
if (failures.length) { console.error(`Phase 6 Transactions: ${failures.length} failures (${assertions} assertions)\n${failures.slice(0, 35).join('\n')}`); process.exitCode = 1; }
else console.log(`Phase 6 Transactions validation passed: ${assertions} assertions; ${report.transactionsInFixturePeriod} canonical transactions.`);
