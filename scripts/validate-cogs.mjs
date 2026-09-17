import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

function pathFor(file) { return resolve(root, file); }
function expect(condition, message) { if (!condition) failures.push(message); }
function equal(actual, expected, message) { if (actual !== expected) failures.push(`${message}: expected ${expected}, received ${actual}`); }
async function rejects(operation, pattern, message) {
  try { await operation; failures.push(`${message}: expected rejection`); }
  catch (error) { if (!pattern.test(String(error instanceof Error ? error.message : error))) failures.push(`${message}: unexpected error ${String(error)}`); }
}

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
  const cogs = await load('src/domain/cogs.ts');
  const data = await load('src/fixtures/data.ts');
  const fixtures = await load('src/fixtures/analytics-data.ts');
  const { MockCogsManagementRepository } = await load('src/services/mock/cogs-management-repository.ts');
  const { MockDashboardAnalyticsRepository } = await load('src/services/mock/dashboard-analytics-repository.ts');
  const { mockCogsManagementStore, organisationCogsState } = await load('src/services/mock/cogs-management-store.ts');
  const { materializeApprovedCogsDataset } = await load('src/services/mock/cogs-dataset.ts');
  const analytics = await load('src/services/analytics/analytics-aggregation.ts');
  const products = await load('src/services/analytics/product-aggregation.ts');
  const { queryKeys } = await load('src/services/query-keys.ts');

  equal(cogs.parseCostMinor('£6.90'), 690, 'Money parser must store £6.90 in integer minor units');
  equal(cogs.parseCostMinor('1,234.56'), 123456, 'Money parser must support thousands separators');
  equal(cogs.parseCostMinor('-4.20'), -420, 'Money parser must preserve a negative value for anomaly validation');
  equal(cogs.parseCostMinor('6.999'), null, 'Money parser must reject more than two decimal places');
  equal(cogs.percentageAdjustedMinor(690, 500), 725, '£6.90 plus 5% must round deterministically to £7.25');
  equal(cogs.percentageAdjustedMinor(690, -500), 656, '£6.90 minus 5% must round deterministically to £6.56');
  equal(cogs.cogsChangeBps(690, 720), 435, 'COGS change must use deterministic basis points');
  expect(cogs.isIsoCogsDate('2026-09-02') && !cogs.isIsoCogsDate('02/09/26') && !cogs.isIsoCogsDate('2026-02-30'), 'Effective dates must be valid unambiguous ISO dates');
  equal(cogs.normaliseCogsCurrency(' gbp '), 'GBP', 'Currency normalisation must accept supported ISO codes');
  equal(cogs.normaliseCogsCurrency('AUD'), null, 'Unsupported currencies must not be silently converted');

  const parsedCsv = cogs.parseDelimitedText('SKU,Product,Cost,Currency,Effective Date\nABC,"Blue Gloves, XL",7.20,GBP,2026-09-01');
  equal(parsedCsv.headers.length, 5, 'CSV parser must retain detected headers');
  equal(parsedCsv.rows[0].Product, 'Blue Gloves, XL', 'CSV parser must preserve quoted comma values');
  const parsedTsv = cogs.parseDelimitedText('SKU\tCost\tCurrency\tEffective Date\nABC\t7.20\tGBP\t2026-09-01');
  equal(parsedTsv.rows[0].Cost, '7.20', 'Paste parser must support tab-separated spreadsheet data');
  const mapping = cogs.detectCogsColumnMapping(['Our SKU', 'Buy Price', 'CCY', 'Effective From', 'Barcode']);
  expect(mapping.some((item) => item.field === 'unitCost' && item.sourceColumn === 'Buy Price')
    && mapping.some((item) => item.field === 'ean' && item.sourceColumn === 'Barcode'), 'Column analysis must detect cost and EAN without inventing a source column');
  equal(cogs.detectCogsColumnMapping(['Quantity', 'Retail Price']).find((item) => item.field === 'unitCost')?.sourceColumn, null, 'Column analysis must not choose an unrelated numeric column as unit cost');

  const record = (id, from, to, amount) => ({
    id, organisationId: data.organisation.id, companyId: data.companies[0].id, productId: 'range-product',
    unitCostMinor: amount, currency: 'GBP', effectiveFrom: from, effectiveTo: to, status: 'active',
    source: 'initial-import', reason: 'Validator record', createdByUserId: 'usr-editor', createdByName: 'Editor',
    createdAt: `${from}T09:00:00.000Z`, changedByUserId: 'usr-editor', approvedByUserId: 'usr-finance',
    approvedByName: 'Finance', approvedAt: `${from}T09:00:00.000Z`, approvalStatus: 'approved',
  });
  const baseHistory = [record('old', '2026-01-01', null, 650)];
  const inserted = cogs.insertApprovedCogsRecord(baseHistory, record('new', '2026-04-01', null, 690));
  equal(inserted.history.find((item) => item.id === 'old')?.effectiveTo, '2026-04-01', 'New approved costs must close the covering historical range');
  equal(cogs.resolveCurrentCogsRecord(inserted.history, '2026-03-01')?.unitCostMinor, 650, 'Historical lookup must use the rate effective on the transaction date');
  equal(cogs.resolveCurrentCogsRecord(inserted.history, '2026-08-01')?.unitCostMinor, 690, 'Current lookup must use the latest effective rate');
  equal(cogs.validateCogsHistory(inserted.history).length, 0, 'Effective-dated insertion must not create overlapping active ranges');
  expect(cogs.validateCogsHistory([record('overlap-a', '2026-01-01', null, 100), record('overlap-b', '2026-02-01', null, 200)]).length > 0, 'Overlapping active COGS ranges must be rejected');

  const dataset = fixtures.generateAnalyticsDataset({ organisation: data.organisation, companies: data.companies, marketplaceAccounts: data.marketplaceAccounts });
  const selectedCompany = data.companies.find((company) => dataset.products.some((product) => product.ownerCompanyId === company.id));
  const companyProducts = dataset.products.filter((product) => product.ownerCompanyId === selectedCompany.id);
  const companyListings = dataset.listings.filter((listing) => listing.companyId === selectedCompany.id);
  const sourceProduct = companyProducts.find((product) => companyListings.some((listing) => listing.productId === product.id && listing.ean)) ?? companyProducts[0];
  const sourceListing = companyListings.find((listing) => listing.productId === sourceProduct.id);
  const histories = new Map(companyProducts.map((product) => [product.id, cogs.canonicalRecordsFromHistory({
    organisationId: data.organisation.id,
    companyId: selectedCompany.id,
    productId: product.id,
    history: dataset.cogsHistory.filter((rate) => rate.productId === product.id),
  })]));
  const importHeaders = ['SKU', 'Marketplace SKU', 'ASIN', 'EAN', 'Product', 'Cost', 'Currency', 'Effective Date', 'Company'];
  const importMapping = cogs.detectCogsColumnMapping(importHeaders);
  const rows = cogs.buildCogsImportRows({
    batchId: 'validator-match',
    mapping: importMapping,
    products: dataset.products,
    listings: dataset.listings,
    selectedCompanyId: selectedCompany.id,
    companyName: selectedCompany.name,
    histories,
    rawRows: [
      { SKU: sourceProduct.internalSku, 'Marketplace SKU': '', ASIN: '', EAN: '', Product: sourceProduct.title, Cost: '7.20', Currency: 'GBP', 'Effective Date': '2026-09-01', Company: selectedCompany.name },
      { SKU: '', 'Marketplace SKU': sourceListing.marketplaceSku, ASIN: '', EAN: '', Product: sourceProduct.title, Cost: '7.20', Currency: 'GBP', 'Effective Date': '2026-09-02', Company: selectedCompany.name },
      { SKU: '', 'Marketplace SKU': '', ASIN: sourceListing.asin ?? '', EAN: '', Product: sourceProduct.title, Cost: '7.20', Currency: 'GBP', 'Effective Date': '2026-09-03', Company: selectedCompany.name },
      { SKU: '', 'Marketplace SKU': '', ASIN: '', EAN: sourceListing.ean ?? '', Product: sourceProduct.title, Cost: '7.20', Currency: 'GBP', 'Effective Date': '2026-09-04', Company: selectedCompany.name },
      { SKU: 'UNKNOWN-SKU', 'Marketplace SKU': '', ASIN: '', EAN: '', Product: 'Unlisted supplier sample', Cost: '7.20', Currency: 'GBP', 'Effective Date': '2026-09-05', Company: selectedCompany.name },
      { SKU: sourceProduct.internalSku, 'Marketplace SKU': '', ASIN: '', EAN: '', Product: 'Completely unrelated title', Cost: '0.00', Currency: 'USD', 'Effective Date': '2026-10-01', Company: 'Another Company' },
    ],
  });
  expect(rows[0].matchType === 'exact' && rows[0].matchEvidence[0]?.kind === 'internal-sku', 'Internal SKU must be the strongest deterministic Product match');
  expect(rows[1].matchType === 'exact' && rows[1].matchEvidence[0]?.kind === 'marketplace-sku', 'Marketplace SKU must resolve through a company-owned listing');
  if (sourceListing.asin) expect(rows[2].matchEvidence[0]?.kind === 'asin', 'ASIN must resolve through a company-owned listing');
  if (sourceListing.ean) expect(rows[3].matchEvidence[0]?.kind === 'ean', 'EAN must resolve through a company-owned listing');
  expect(rows[4].matchType === 'unmatched' && rows[4].anomalies.some((item) => item.code === 'unmatched_product' && item.blocking), 'Unknown identifiers must remain unmatched and blocking');
  for (const code of ['zero_cost', 'currency_change', 'future_date', 'title_mismatch', 'company_mismatch']) {
    expect(rows[5].anomalies.some((item) => item.code === code), `Anomaly analysis must surface ${code}`);
  }
  expect(rows[5].reviewStatus === 'pending', 'Exact identifier matches with anomalies must never be silently accepted');

  const duplicateRows = cogs.buildCogsImportRows({
    batchId: 'validator-duplicates', mapping: importMapping, products: dataset.products, listings: dataset.listings,
    selectedCompanyId: selectedCompany.id, companyName: selectedCompany.name, histories,
    rawRows: [
      { SKU: sourceProduct.internalSku, 'Marketplace SKU': '', ASIN: '', EAN: '', Product: sourceProduct.title, Cost: '7.20', Currency: 'GBP', 'Effective Date': '2026-09-01', Company: selectedCompany.name },
      { SKU: sourceProduct.internalSku, 'Marketplace SKU': '', ASIN: '', EAN: '', Product: sourceProduct.title, Cost: '8.20', Currency: 'GBP', 'Effective Date': '2026-09-01', Company: selectedCompany.name },
    ],
  });
  expect(duplicateRows.every((row) => row.anomalies.some((item) => item.code === 'conflicting_duplicate' && item.blocking)), 'Conflicting duplicate Product/date rows must block approval');
  expect(duplicateRows.every((row) => !cogs.importRowReady(row)), 'Blocking conflicts must never be ready to apply');
  const timelineRows = cogs.buildCogsImportRows({
    batchId: 'validator-timeline', mapping: importMapping, products: dataset.products, listings: dataset.listings,
    selectedCompanyId: selectedCompany.id, companyName: selectedCompany.name, histories,
    // Intentionally reverse source order: final ranges must follow effective dates, not file order.
    rawRows: [
      { SKU: sourceProduct.internalSku, 'Marketplace SKU': '', ASIN: '', EAN: '', Product: sourceProduct.title, Cost: '8.40', Currency: 'GBP', 'Effective Date': '2026-07-01', Company: selectedCompany.name },
      { SKU: sourceProduct.internalSku, 'Marketplace SKU': '', ASIN: '', EAN: '', Product: sourceProduct.title, Cost: '8.10', Currency: 'GBP', 'Effective Date': '2026-06-01', Company: selectedCompany.name },
    ],
  });
  const julyTimelineRow = timelineRows[0];
  const juneTimelineRow = timelineRows[1];
  equal(juneTimelineRow.projectedEffectiveTo, '2026-07-01', 'Earlier same-Product batch rows must preview the exact boundary created by a later row');
  equal(julyTimelineRow.currentUnitCostMinor, juneTimelineRow.proposedUnitCostMinor, 'Later same-Product batch rows must compare with the preceding proposed period');
  equal(julyTimelineRow.comparisonRecordId, `${juneTimelineRow.batchId}:cogs:${juneTimelineRow.id.split(':').at(-1)}`, 'Multi-date comparison identity must match the canonical record that apply will create');
  const summary = cogs.summariseImportRows(rows);
  equal(summary.rowCount, rows.length, 'Import summary row count must derive from persisted source rows');
  expect(cogs.deterministicImportSignature(importHeaders, [rows[0].rawValues]) === cogs.deterministicImportSignature(importHeaders, [rows[0].rawValues]), 'Import duplicate signature must be deterministic');

  mockCogsManagementStore.reset();
  const repository = new MockCogsManagementRepository();
  const baseInput = {
    context: { organisationId: data.organisation.id, companyId: 'all', marketplace: 'all', marketplaceAccountIds: [], dateRange: { from: '2026-08-01', to: '2026-08-31' } },
    organisation: data.organisation,
    scenarioId: 'healthy',
    companies: data.companies,
    marketplaceAccounts: data.marketplaceAccounts,
    authorisedCompanyIds: data.companies.map((company) => company.id),
    authorisedAccountIds: data.marketplaceAccounts.map((account) => account.id),
    reportingCurrency: data.organisation.reportingCurrency,
    canViewSensitiveExpenses: true,
    cogsReadiness: null,
  };
  const workspaceQuery = { ...baseInput, search: '', status: 'all', source: 'all', effectiveDate: 'all', changedBy: 'all', needsReview: false, page: 0, pageSize: 100 };
  const workspaceBefore = await repository.getWorkspace(workspaceQuery);
  const target = workspaceBefore.allRows.find((row) => row.current && row.product.ownerCompanyId === selectedCompany.id) ?? workspaceBefore.allRows[0];
  const nextCost = (target.current?.unitCostMinor ?? 700) + 7;
  const editor = { id: 'usr-editor', name: 'Cost editor', permissions: { edit: true, import: false, approve: false } };
  const importer = { id: 'usr-importer', name: 'Cost importer', permissions: { edit: false, import: true, approve: false } };
  const approver = { id: 'usr-approver', name: 'Finance approver', permissions: { edit: false, import: false, approve: true } };
  const denied = { id: 'usr-denied', name: 'Analyst', permissions: { edit: false, import: false, approve: false } };

  await rejects(repository.createImport({ ...baseInput, actor: editor, companyId: target.product.ownerCompanyId, fileName: 'denied.csv', fileType: 'csv', fileSize: 10, sheetNames: [], selectedSheet: null, headers: ['SKU', 'Cost', 'Currency', 'Effective Date'], rawRows: [{ SKU: target.product.internalSku, Cost: '7.20', Currency: 'GBP', 'Effective Date': '2026-09-01' }], mapping: cogs.detectCogsColumnMapping(['SKU', 'Cost', 'Currency', 'Effective Date']) }), /cannot import/i, 'cogs.edit must not grant file-import permission');
  await rejects(repository.createProposalBatch({ ...baseInput, actor: importer, companyId: target.product.ownerCompanyId, kind: 'single', label: 'Import-only edit bypass', proposals: [{ productId: target.id, unitCostMinor: nextCost, currency: target.current?.currency ?? 'GBP', effectiveFrom: '2026-09-01', reason: 'Must require edit' }] }), /cannot edit/i, 'cogs.import must not grant direct single, bulk or percentage-edit permission');
  await rejects(repository.createProposalBatch({ ...baseInput, actor: denied, companyId: target.product.ownerCompanyId, kind: 'single', label: 'Denied edit', proposals: [{ productId: target.id, unitCostMinor: nextCost, currency: target.current?.currency ?? 'GBP', effectiveFrom: '2026-09-01', reason: 'Validator' }] }), /cannot edit/i, 'A role without cogs.edit must not prepare direct COGS changes');

  const mixedHeaders = ['SKU', 'Product', 'Cost', 'Currency', 'Effective Date'];
  const partiallyReviewed = await repository.createImport({
    ...baseInput,
    actor: importer,
    companyId: target.product.ownerCompanyId,
    fileName: 'partially-reviewed.csv',
    fileType: 'csv',
    fileSize: 128,
    sheetNames: [],
    selectedSheet: null,
    headers: mixedHeaders,
    rawRows: [
      { SKU: target.product.internalSku, Product: target.product.title, Cost: (nextCost / 100).toFixed(2), Currency: target.current?.currency ?? 'GBP', 'Effective Date': '2026-09-01' },
      { SKU: 'NOT-IN-CATALOGUE', Product: 'Unresolved supplier item', Cost: '9.40', Currency: 'GBP', 'Effective Date': '2026-09-01' },
    ],
    mapping: cogs.detectCogsColumnMapping(mixedHeaders),
  });
  const safeMixedRow = partiallyReviewed.rows.find((row) => row.proposedProductId === target.id && !row.anomalies.some((item) => item.blocking));
  if (safeMixedRow) await repository.reviewRow(baseInput, partiallyReviewed.id, safeMixedRow.id, 'accepted', importer);
  await rejects(repository.submitForApproval(baseInput, partiallyReviewed.id, importer), /resolve or reject every/i, 'A partially unresolved import must not enter financial approval');
  mockCogsManagementStore.transaction((draft) => {
    const organisation = mockCogsManagementStore.ensureOrganisation(draft, data.organisation.id);
    organisation.batches[partiallyReviewed.id] = { ...organisation.batches[partiallyReviewed.id], status: 'awaiting-approval', stage: 'approval' };
  });
  await rejects(repository.applyBatch(baseInput, partiallyReviewed.id, approver, true), /resolve or reject every/i, 'Apply must independently reject an unresolved active row even if batch status is forged');

  const proposal = await repository.createProposalBatch({
    ...baseInput, actor: editor, companyId: target.product.ownerCompanyId, kind: 'single', label: 'Validator direct proposal',
    proposals: [{ productId: target.id, unitCostMinor: nextCost, currency: target.current?.currency ?? 'GBP', effectiveFrom: '2026-08-01', reason: 'Validator supplier update' }],
  });
  expect(['ready-for-approval', 'needs-review'].includes(proposal.status), 'Direct edit must create a governed proposal batch for a cogs.edit user');
  const pendingWorkspace = await repository.getWorkspace(workspaceQuery);
  equal(pendingWorkspace.allRows.find((row) => row.id === target.id)?.current?.unitCostMinor, target.current?.unitCostMinor, 'Draft/proposed COGS must not change the canonical current cost');
  expect(pendingWorkspace.allRows.find((row) => row.id === target.id)?.pendingBatchId === proposal.id, 'Pending proposal must reconcile into the COGS workspace');
  const pendingProjection = materializeApprovedCogsDataset(dataset, data.organisation.id);
  const pendingMissingRecords = analytics.prepareProfitabilityRecords(pendingProjection, { ...baseInput, scenarioId: 'cogs-none' });
  expect(pendingMissingRecords.filter((record) => record.productId === target.id).every((record) => record.cogsMinor === null), 'A draft COGS proposal must remain excluded from missing-scenario profitability');
  await rejects(repository.applyBatch(baseInput, proposal.id, editor, false), /cogs\.approve/i, 'Preparation permission must not grant financial approval');
  if (proposal.status === 'needs-review') {
    const row = proposal.rows[0];
    if (!row.anomalies.some((item) => item.blocking)) await repository.reviewRow(baseInput, proposal.id, row.id, 'accepted', editor);
  }
  await repository.submitForApproval(baseInput, proposal.id, editor);
  const applied = await repository.applyBatch(baseInput, proposal.id, approver, true);
  equal(applied.status, 'applied', 'An authorised approver must atomically apply a reviewed proposal');
  equal(applied.approvedByUserId, approver.id, 'Approver identity must be persisted separately from preparer identity');
  equal(applied.createdByUserId, editor.id, 'Preparer identity must survive approval');
  expect(Boolean(applied.result) && applied.result.recordsCreated === 1, 'Apply result must report canonical records created');
  const workspaceAfter = await repository.getWorkspace(workspaceQuery);
  equal(workspaceAfter.allRows.find((row) => row.id === target.id)?.current?.unitCostMinor, nextCost, 'Approved effective-dated cost must immediately reconcile into the workspace');
  await rejects(repository.reviewRow(baseInput, proposal.id, proposal.rows[0].id, 'rejected', editor), /immutable/i, 'Applied batches must be immutable');
  const audit = await repository.getAuditEvents(data.organisation.id);
  expect(audit.some((event) => event.action === 'cogs.import.approved' && event.actor.type === 'user' && event.actor.userId === approver.id), 'Audit must attribute approval to the authorised approver');
  expect(audit.some((event) => event.action === 'cogs.changed' && event.target.id === target.id && event.reason === 'Validator supplier update'), 'Audit must retain Product target, before/after context and reason');
  const persisted = organisationCogsState(mockCogsManagementStore.read(), data.organisation.id);
  expect(Boolean(persisted.batches[proposal.id]) && persisted.recordsByProduct[target.id]?.some((item) => item.unitCostMinor === nextCost), 'Approved batches and canonical history must persist in the shared prototype store');

  const productQuery = (scenarioId) => ({
    ...baseInput,
    scenarioId,
    search: '',
    cogsStatus: 'all',
    listingStatus: 'all',
    profitabilityStatus: 'all',
    categories: [],
    sorting: [{ field: 'product', direction: 'asc' }],
    page: 0,
    pageSize: 5_000,
  });
  const projectedDataset = materializeApprovedCogsDataset(dataset, data.organisation.id);
  const missingBaseline = products.aggregateProductPage(dataset, productQuery('cogs-none'));
  const missingReconciled = products.aggregateProductPage(projectedDataset, productQuery('cogs-none'));
  equal(missingBaseline.rows.find((row) => row.id === target.id)?.cogsStatus, 'missing', 'Missing-COGS scenario must mask the untouched baseline Product');
  equal(missingReconciled.rows.find((row) => row.id === target.id)?.cogsStatus, 'complete', 'An approved backdated COGS record must close the matching Product gap in the missing-COGS scenario');
  const partialReconciled = products.aggregateProductPage(projectedDataset, productQuery('partial-cogs'));
  equal(partialReconciled.rows.find((row) => row.id === target.id)?.cogsStatus, 'complete', 'An approved effective-dated COGS record must supersede the partial-history scenario mask for its covered period');
  const missingDashboardBefore = analytics.aggregateDashboardAnalytics(dataset, { ...baseInput, scenarioId: 'cogs-none' });
  const missingDashboardAfter = analytics.aggregateDashboardAnalytics(projectedDataset, { ...baseInput, scenarioId: 'cogs-none' });
  expect(missingDashboardAfter.current.profitabilityCoverageBps > missingDashboardBefore.current.profitabilityCoverageBps, 'Approved persisted COGS must visibly increase Dashboard profitability coverage in a missing-COGS scenario');

  const targetAfterInitialApply = workspaceAfter.allRows.find((row) => row.id === target.id);
  const backdatedEffectiveFrom = '2026-03-15';
  const historicalComparison = targetAfterInitialApply ? cogs.resolveCurrentCogsRecord(targetAfterInitialApply.history, backdatedEffectiveFrom) : null;
  const historicalNext = targetAfterInitialApply?.history.filter((record) => record.status === 'active' && record.effectiveFrom > backdatedEffectiveFrom).sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom))[0] ?? null;
  if (targetAfterInitialApply && historicalComparison) {
    const backdatedCost = historicalComparison.unitCostMinor + 9;
    const backdatedReason = 'Backdated validator correction';
    const backdatedProposal = await repository.createProposalBatch({
      ...baseInput,
      actor: editor,
      companyId: targetAfterInitialApply.product.ownerCompanyId,
      kind: 'single',
      label: 'Backdated validator correction',
      proposals: [{ productId: targetAfterInitialApply.id, unitCostMinor: backdatedCost, currency: historicalComparison.currency, effectiveFrom: backdatedEffectiveFrom, reason: backdatedReason }],
    });
    equal(backdatedProposal.rows[0].currentUnitCostMinor, historicalComparison.unitCostMinor, 'Backdated review must compare with the cost effective on the proposed date, not today’s current cost');
    equal(backdatedProposal.rows[0].comparisonRecordId, historicalComparison.id, 'Backdated review must persist the exact predecessor record identity');
    equal(backdatedProposal.rows[0].projectedEffectiveTo, historicalNext?.effectiveFrom ?? null, 'Backdated review must preview the exact exclusive end of the new range');
    await repository.submitForApproval(baseInput, backdatedProposal.id, editor);
    await repository.applyBatch(baseInput, backdatedProposal.id, approver, true);
    const backdatedAudit = (await repository.getAuditEvents(data.organisation.id)).find((event) => event.target.id === targetAfterInitialApply.id && event.reason === backdatedReason);
    equal(backdatedAudit?.previousValue?.unitCostMinor, historicalComparison.unitCostMinor, 'Backdated audit previousValue must come from the actual effective-date predecessor');
    equal(backdatedAudit?.previousValue?.effectiveFrom, historicalComparison.effectiveFrom, 'Backdated audit must retain the predecessor effective range');
    equal(backdatedAudit?.newValue?.effectiveTo, historicalNext?.effectiveFrom ?? null, 'Backdated audit must retain the exact resulting effective range');

    const historyBeforeMultiDate = organisationCogsState(mockCogsManagementStore.read(), data.organisation.id).recordsByProduct[targetAfterInitialApply.id] ?? [];
    const nextExistingAfterJuly = historyBeforeMultiDate
      .filter((record) => record.status === 'active' && record.effectiveFrom > '2026-07-01')
      .sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom))[0] ?? null;
    const multiDateProposal = await repository.createProposalBatch({
      ...baseInput,
      actor: editor,
      companyId: targetAfterInitialApply.product.ownerCompanyId,
      kind: 'bulk',
      label: 'Multi-date validator proposal',
      proposals: [
        { productId: targetAfterInitialApply.id, unitCostMinor: backdatedCost + 20, currency: historicalComparison.currency, effectiveFrom: '2026-07-01', reason: 'July validator period' },
        { productId: targetAfterInitialApply.id, unitCostMinor: backdatedCost + 10, currency: historicalComparison.currency, effectiveFrom: '2026-06-01', reason: 'June validator period' },
      ],
    });
    const juneProposalRow = multiDateProposal.rows.find((row) => row.proposedEffectiveDate === '2026-06-01');
    const julyProposalRow = multiDateProposal.rows.find((row) => row.proposedEffectiveDate === '2026-07-01');
    equal(juneProposalRow?.projectedEffectiveTo, '2026-07-01', 'Governed review must preview the final boundary across multiple dates for one Product');
    equal(julyProposalRow?.currentUnitCostMinor, juneProposalRow?.proposedUnitCostMinor, 'Governed review must compare a later row with the preceding proposed Product period');
    await repository.submitForApproval(baseInput, multiDateProposal.id, editor);
    await repository.applyBatch(baseInput, multiDateProposal.id, approver, true);
    const multiDateHistory = organisationCogsState(mockCogsManagementStore.read(), data.organisation.id).recordsByProduct[targetAfterInitialApply.id] ?? [];
    const appliedJune = multiDateHistory.find((record) => record.id === `${multiDateProposal.id}:cogs:${juneProposalRow?.id.split(':').at(-1)}`);
    const appliedJuly = multiDateHistory.find((record) => record.id === `${multiDateProposal.id}:cogs:${julyProposalRow?.id.split(':').at(-1)}`);
    equal(appliedJune?.effectiveTo, '2026-07-01', 'Atomic apply must commit the same multi-date boundary shown in review');
    equal(appliedJuly?.effectiveTo, nextExistingAfterJuly?.effectiveFrom ?? null, 'The final same-Product proposal must stop at the next pre-existing approved period');
    const juneAudit = (await repository.getAuditEvents(data.organisation.id)).find((event) => event.reason === 'June validator period');
    equal(juneAudit?.newValue?.effectiveTo, '2026-07-01', 'Audit must retain the final, not intermediate, range for an earlier row in a multi-date batch');
  }

  const secondTarget = workspaceBefore.allRows.find((row) => row.id !== target.id && row.current && row.product.ownerCompanyId === target.product.ownerCompanyId);
  if (secondTarget) {
    const failedProposal = await repository.createProposalBatch({
      ...baseInput, actor: editor, companyId: secondTarget.product.ownerCompanyId, kind: 'single', label: 'Validator atomic rollback',
      proposals: [{ productId: secondTarget.id, unitCostMinor: secondTarget.current.unitCostMinor + 5, currency: secondTarget.current.currency, effectiveFrom: '2026-09-01', reason: 'Rollback validator' }],
    });
    if (failedProposal.status === 'needs-review' && !failedProposal.rows[0].anomalies.some((item) => item.blocking)) await repository.reviewRow(baseInput, failedProposal.id, failedProposal.rows[0].id, 'accepted', editor);
    const failed = await repository.applyBatch(baseInput, failedProposal.id, approver, true, true);
    equal(failed.status, 'failed', 'Simulated apply failure must expose a failed retryable batch');
    const afterFailure = await repository.getWorkspace(workspaceQuery);
    equal(afterFailure.allRows.find((row) => row.id === secondTarget.id)?.current?.unitCostMinor, secondTarget.current.unitCostMinor, 'Atomic failure must commit zero COGS records');
    const originalImpact = repository.impact.bind(repository);
    let impactCalls = 0;
    repository.impact = (...args) => {
      impactCalls += 1;
      if (impactCalls === 2) throw new Error('Validator recalculation failure');
      return originalImpact(...args);
    };
    const recalculationFailure = await repository.applyBatch(baseInput, failedProposal.id, approver, true);
    repository.impact = originalImpact;
    equal(recalculationFailure.status, 'failed', 'A runtime failure during projected profitability recalculation must leave a retryable failed batch');
    const afterRecalculationFailure = await repository.getWorkspace(workspaceQuery);
    equal(afterRecalculationFailure.allRows.find((row) => row.id === secondTarget.id)?.current?.unitCostMinor, secondTarget.current.unitCostMinor, 'A recalculation failure after record projection must still commit zero COGS records');
  }

  const restrictedInput = { ...baseInput, authorisedCompanyIds: [target.product.ownerCompanyId], authorisedAccountIds: data.marketplaceAccounts.filter((account) => account.companyId === target.product.ownerCompanyId).map((account) => account.id) };
  const restrictedHistory = await repository.getWorkspace({ ...workspaceQuery, ...restrictedInput });
  expect(restrictedHistory.recentImports.every((batch) => batch.companyId === target.product.ownerCompanyId), 'Import history must not disclose batches outside the viewer’s Company assignment');
  const foreignCompany = data.companies.find((company) => company.id !== target.product.ownerCompanyId);
  if (foreignCompany) await rejects(repository.createImport({ ...restrictedInput, actor: importer, companyId: foreignCompany.id, fileName: 'foreign.csv', fileType: 'csv', fileSize: 1, sheetNames: [], selectedSheet: null, headers: ['SKU'], rawRows: [{ SKU: 'FOREIGN' }], mapping: cogs.detectCogsColumnMapping(['SKU']) }), /outside your assignment/i, 'Company assignment must be enforced inside repository mutations');

  const dashboardRepository = new MockDashboardAnalyticsRepository();
  mockCogsManagementStore.reset();
  const approvalScenarioInput = { ...baseInput, scenarioId: 'cogs-awaiting-approval' };
  await repository.getWorkspace({ ...workspaceQuery, scenarioId: 'cogs-awaiting-approval' });
  const seededApprovalBatch = Object.values(organisationCogsState(mockCogsManagementStore.read(), data.organisation.id).batches).find((batch) => batch.note === 'scenario:cogs-awaiting-approval');
  expect(Boolean(seededApprovalBatch), 'Awaiting-approval scenario must persist its governed COGS batch');
  if (seededApprovalBatch) await repository.updateBatchDetails(approvalScenarioInput, seededApprovalBatch.id, { note: 'Finance reviewed scenario proposal' }, editor);
  await repository.getWorkspace({ ...workspaceQuery, scenarioId: 'cogs-awaiting-approval' });
  const editedScenarioBatch = seededApprovalBatch ? organisationCogsState(mockCogsManagementStore.read(), data.organisation.id).batches[seededApprovalBatch.id] : null;
  equal(editedScenarioBatch?.note, 'Finance reviewed scenario proposal', 'A user-edited scenario note must not cause the persisted batch to be reseeded or overwritten');
  const pendingDashboard = await dashboardRepository.getDashboard(approvalScenarioInput);
  const pendingAttention = pendingDashboard.attention.find((item) => item.id === 'cogs-approval');
  expect(Boolean(pendingAttention) && pendingAttention.title.includes(String(seededApprovalBatch?.rowCount ?? 0)), 'Dashboard approval attention must derive its change count from the active persisted batch');
  if (seededApprovalBatch) await repository.applyBatch(approvalScenarioInput, seededApprovalBatch.id, approver, true);
  const reconciledDashboard = await dashboardRepository.getDashboard(approvalScenarioInput);
  expect(!reconciledDashboard.attention.some((item) => item.id === 'cogs-approval'), 'Applying the matching scenario batch must remove stale approval attention from Dashboard');

  mockCogsManagementStore.reset();
  const errorScenarioInput = { ...baseInput, scenarioId: 'import-errors' };
  await repository.getWorkspace({ ...workspaceQuery, scenarioId: 'import-errors' });
  const seededErrorBatch = Object.values(organisationCogsState(mockCogsManagementStore.read(), data.organisation.id).batches).find((batch) => batch.note === 'scenario:import-errors');
  const errorRows = seededErrorBatch?.rows.filter((row) => row.reviewStatus !== 'rejected' && (row.reviewStatus !== 'accepted' || row.anomalies.some((anomaly) => anomaly.blocking))).length ?? 0;
  const errorDashboard = await dashboardRepository.getDashboard(errorScenarioInput);
  const errorAttention = errorDashboard.attention.find((item) => item.id === 'import-errors');
  expect(Boolean(errorAttention) && errorRows > 0 && errorAttention.title.includes(String(errorRows)), 'Dashboard import-error attention must derive its review-row count from the active persisted batch');
  expect(!errorAttention?.title.includes('14 '), 'Dashboard import-error attention must not retain the legacy hardcoded row count');
  if (seededErrorBatch) await repository.cancelBatch(errorScenarioInput, seededErrorBatch.id, editor);
  const cancelledOnce = seededErrorBatch ? organisationCogsState(mockCogsManagementStore.read(), data.organisation.id).batches[seededErrorBatch.id] : null;
  const cancellationAuditCount = (await repository.getAuditEvents(data.organisation.id)).filter((event) => event.action === 'cogs.import.cancelled' && event.target.id === seededErrorBatch?.id).length;
  if (seededErrorBatch) await repository.cancelBatch(errorScenarioInput, seededErrorBatch.id, editor);
  const cancelledTwice = seededErrorBatch ? organisationCogsState(mockCogsManagementStore.read(), data.organisation.id).batches[seededErrorBatch.id] : null;
  equal(cancelledTwice?.cancelledAt, cancelledOnce?.cancelledAt, 'Cancelling an already-cancelled batch must be idempotent and preserve its immutable timestamp');
  equal((await repository.getAuditEvents(data.organisation.id)).filter((event) => event.action === 'cogs.import.cancelled' && event.target.id === seededErrorBatch?.id).length, cancellationAuditCount, 'Repeated cancellation must not append duplicate audit events');
  await repository.getWorkspace({ ...workspaceQuery, scenarioId: 'import-errors' });
  const cancelledScenarioBatches = Object.values(organisationCogsState(mockCogsManagementStore.read(), data.organisation.id).batches).filter((batch) => batch.id === seededErrorBatch?.id);
  equal(cancelledScenarioBatches.length, seededErrorBatch ? 1 : 0, 'A cancelled scenario import must not be reseeded under the same deterministic batch id');
  equal(cancelledScenarioBatches[0]?.status, seededErrorBatch ? 'cancelled' : undefined, 'A cancelled scenario import must remain immutable after the scenario is revisited');
  const cancelledDashboard = await dashboardRepository.getDashboard(errorScenarioInput);
  expect(!cancelledDashboard.attention.some((item) => item.id === 'import-errors'), 'Cancelling the matching scenario batch must remove stale import-error attention from Dashboard');

  mockCogsManagementStore.reset();
  const concurrencyRepository = new MockCogsManagementRepository();
  const concurrencyWorkspace = await concurrencyRepository.getWorkspace(workspaceQuery);
  const concurrencyTarget = concurrencyWorkspace.allRows.find((row) => row.id === target.id) ?? concurrencyWorkspace.allRows.find((row) => row.current);
  if (concurrencyTarget) {
    const baseCost = concurrencyTarget.current?.unitCostMinor ?? 700;
    const earlierBatch = await concurrencyRepository.createProposalBatch({
      ...baseInput, actor: editor, companyId: concurrencyTarget.product.ownerCompanyId, kind: 'single', label: 'Stale review earlier period',
      proposals: [{ productId: concurrencyTarget.id, unitCostMinor: baseCost + 11, currency: concurrencyTarget.current?.currency ?? 'GBP', effectiveFrom: '2027-01-01', reason: 'Concurrency validator earlier' }],
    });
    const laterBatch = await concurrencyRepository.createProposalBatch({
      ...baseInput, actor: editor, companyId: concurrencyTarget.product.ownerCompanyId, kind: 'single', label: 'Stale review later period',
      proposals: [{ productId: concurrencyTarget.id, unitCostMinor: baseCost + 22, currency: concurrencyTarget.current?.currency ?? 'GBP', effectiveFrom: '2027-02-01', reason: 'Concurrency validator later' }],
    });
    await concurrencyRepository.submitForApproval(baseInput, earlierBatch.id, editor);
    await concurrencyRepository.submitForApproval(baseInput, laterBatch.id, editor);
    await concurrencyRepository.applyBatch(baseInput, laterBatch.id, approver, true);
    const auditsBeforeStaleApply = (await concurrencyRepository.getAuditEvents(data.organisation.id)).length;
    await rejects(concurrencyRepository.applyBatch(baseInput, earlierBatch.id, approver, true), /re-review/i, 'An approved preview must be rejected when another batch changes its live Product timeline');
    const stateAfterStaleApply = organisationCogsState(mockCogsManagementStore.read(), data.organisation.id);
    const staleBatch = stateAfterStaleApply.batches[earlierBatch.id];
    equal(staleBatch?.status, 'needs-review', 'A stale approval must return to governed review');
    equal(staleBatch?.rows[0]?.reviewStatus, 'pending', 'Only a newly refreshed stale row may require reviewer acknowledgement again');
    expect(!(stateAfterStaleApply.recordsByProduct[concurrencyTarget.id] ?? []).some((record) => record.sourceReferenceId === earlierBatch.id), 'A stale approval attempt must commit zero COGS records');
    equal((await concurrencyRepository.getAuditEvents(data.organisation.id)).length, auditsBeforeStaleApply, 'A stale approval attempt must not append applied-change audit events');
    await concurrencyRepository.reviewRow(baseInput, earlierBatch.id, staleBatch.rows[0].id, 'accepted', editor);
    await concurrencyRepository.submitForApproval(baseInput, earlierBatch.id, editor);
    await concurrencyRepository.applyBatch(baseInput, earlierBatch.id, approver, true);
    const recoveredHistory = organisationCogsState(mockCogsManagementStore.read(), data.organisation.id).recordsByProduct[concurrencyTarget.id] ?? [];
    equal(recoveredHistory.find((record) => record.sourceReferenceId === earlierBatch.id)?.effectiveTo, '2027-02-01', 'Re-reviewed stale changes must commit the refreshed effective-date boundary');
  }

  const keyA = queryKeys.cogs.workspace({ context: baseInput.context, scenarioId: 'healthy', realmKey: 'admin:healthy', authorisedCompanyIds: baseInput.authorisedCompanyIds, authorisedAccountIds: baseInput.authorisedAccountIds, search: '', status: 'all', source: 'all', effectiveDate: 'all', changedBy: 'all', needsReview: false, page: 0, pageSize: 25 });
  const keyB = queryKeys.cogs.workspace({ context: { ...baseInput.context, companyId: target.product.ownerCompanyId }, scenarioId: 'healthy', realmKey: 'admin:healthy', authorisedCompanyIds: baseInput.authorisedCompanyIds, authorisedAccountIds: baseInput.authorisedAccountIds, search: '', status: 'all', source: 'all', effectiveDate: 'all', changedBy: 'all', needsReview: false, page: 0, pageSize: 25 });
  expect(JSON.stringify(keyA) !== JSON.stringify(keyB), 'COGS query keys must vary with authorised analytical context');

  const workspaceSource = readFileSync(pathFor('src/features/cogs/cogs-workspace-page.tsx'), 'utf8');
  const importStartSource = readFileSync(pathFor('src/features/cogs/cogs-import-start-page.tsx'), 'utf8');
  const importReviewSource = readFileSync(pathFor('src/features/cogs/cogs-import-review-page.tsx'), 'utf8');
  const editFlowsSource = readFileSync(pathFor('src/features/cogs/cogs-edit-flows.tsx'), 'utf8');
  const cogsRepositorySource = readFileSync(pathFor('src/services/mock/cogs-management-repository.ts'), 'utf8');
  const cogsHooksSource = readFileSync(pathFor('src/services/hooks/use-cogs.ts'), 'utf8');
  const copilotSource = readFileSync(pathFor('src/services/mock/copilot-repository.ts'), 'utf8');
  const dashboardSources = [
    'src/features/dashboard/dashboard-page.tsx',
    'src/features/dashboard/dashboard-health.tsx',
    'src/features/dashboard/product-performance.tsx',
    'src/features/dashboard/attention-sync-summary.tsx',
  ].map((file) => readFileSync(pathFor(file), 'utf8')).join('\n');
  for (const route of ['app/o/[orgSlug]/cogs/page.tsx', 'app/o/[orgSlug]/cogs/import/page.tsx', 'app/o/[orgSlug]/cogs/import/[importId]/page.tsx']) {
    const source = readFileSync(pathFor(route), 'utf8');
    expect(!source.includes('FeaturePage'), `${route} must render a real Phase 5 feature, not a placeholder`);
  }
  expect(workspaceSource.includes('EnterpriseDataGrid') && workspaceSource.includes('pendingUnitCostMinor'), 'Main COGS workspace must use the approved grid and separate pending proposals from current cost');
  expect(importStartSource.includes("read-excel-file/browser") && importStartSource.includes('5_000') && importStartSource.includes('5 * 1_048_576'), 'Import entry must locally parse XLSX and enforce documented file/row limits');
  expect(importStartSource.includes("marketplaceState === 'none-connected'") && importStartSource.includes('No Products available for COGS setup.'), 'Direct import entry must preserve the no-marketplace/no-Products empty state');
  expect(importStartSource.includes('!viewHistory && !actions.permissions.canImport') && importStartSource.includes("!viewHistory && actions.marketplaceState === 'none-connected'") && importStartSource.includes("allowUnavailableMarketplace: viewHistory"), 'Read-only import history must remain available without import permission or a currently connected marketplace');
  expect(!importStartSource.includes('dangerouslySetInnerHTML') && !importReviewSource.includes('dangerouslySetInnerHTML') && !editFlowsSource.includes('dangerouslySetInnerHTML'), 'Imported and pasted source values must never be rendered as HTML');
  expect(importReviewSource.includes('Atomic all-or-nothing apply') && importReviewSource.includes('Accept exact with no anomalies') && importReviewSource.includes('Human financial approval'), 'Review UI must make safe acceptance, atomicity and explicit human approval visible');
  expect(importReviewSource.includes('renderRowActions={canPrepare ?') && importReviewSource.includes("<Badge tone=\"neutral\">Read only</Badge>"), 'Auditor/read-only review must omit mutation menus and cancel controls');
  expect(importReviewSource.includes('if (canPrepare) await actions.updateDetails') && importReviewSource.includes('canPrepare || actions.permissions.canApprove'), 'Approver-only users must reach and apply financial approval without requiring preparation permission');
  expect(workspaceSource.includes("...(cogs.permissions.canEdit ? [columnHelper.display") && workspaceSource.includes("action === 'edit' && cogs.permissions.canEdit") && workspaceSource.includes("action === 'paste' && cogs.permissions.canImport"), 'Read-only workspace roles must not receive selection or direct-URL mutation controls');
  expect(cogsHooksSource.includes('client.setQueryData(batchQueryKey, result)'), 'Successful batch mutations must synchronously publish their persisted result to the active review cache');
  expect(cogsHooksSource.includes('Some governed failures intentionally persist a refreshed review state'), 'Rejected governed mutations must invalidate stale review caches');
  expect(editFlowsSource.includes('Escape') && editFlowsSource.includes('Shift') && editFlowsSource.includes('Tab'), 'Desktop bulk editor must document keyboard spreadsheet controls');
  expect(editFlowsSource.includes('previewApprovedCogsInsertion') && editFlowsSource.includes('Exact effective-date range preview') && !editFlowsSource.includes('adjusted at approval'), 'Single-edit review must preview exact predecessor and resulting effective-date ranges');
  expect(editFlowsSource.includes('const periods = [...row.history]'), 'The cost-history drawer must render the complete canonical timeline rather than only current and previous records');
  const applySource = cogsRepositorySource.slice(cogsRepositorySource.indexOf('async applyBatch'), cogsRepositorySource.indexOf('async cancelBatch'));
  expect(applySource.includes('reviewTimelineFingerprint') && applySource.indexOf('staleRowIds.size') < applySource.indexOf('mockCogsManagementStore.transaction((draft)'), 'Apply must reject a stale approved timeline before the canonical transaction');
  expect(applySource.indexOf('this.impact(projectedDataset, input)') < applySource.indexOf('mockCogsManagementStore.transaction((draft)'), 'Profitability impact must be calculated before the single canonical commit so runtime failures remain atomic');
  expect(copilotSource.includes('No costs have been applied by Copilot') && copilotSource.includes('does not invent missing costs'), 'Contextual Copilot must state non-mutation and no-invention guardrails');
  expect(dashboardSources.includes('/cogs?status=missing'), 'Dashboard Needs Attention must deep-link to the matching COGS definition');
  expect(!readFileSync(pathFor('package.json'), 'utf8').includes('"xlsx"'), 'The high-risk xlsx parser package must not be installed');

  if (failures.length) {
    console.error(`Phase 5 COGS validation failed (${failures.length}):`);
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exitCode = 1;
  } else {
    console.log(`Phase 5 COGS validation passed: integer-money rules, effective-dated history, deterministic company-safe matching, EAN/ASIN/SKU evidence, anomaly and duplicate blocking, edit/import/approve separation, atomic rollback, persistence, auditability, reconciliation, contextual Copilot guardrails, and real responsive routes.`);
  }
} catch (error) {
  console.error('Phase 5 COGS validator could not execute.');
  console.error(error);
  process.exitCode = 1;
}
