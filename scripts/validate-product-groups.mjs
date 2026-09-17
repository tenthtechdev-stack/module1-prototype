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

function costRecord(id, groupId, baseCostMinor, baseQuantity, effectiveFrom, effectiveTo = null) {
  return {
    id, organisationId: 'org-test', companyId: 'cmp-test', groupId, baseCostMinor, baseQuantity,
    currency: 'GBP', effectiveFrom, effectiveTo, status: 'active', source: 'Supplier price list', reason: 'Validator',
    createdByUserId: 'usr-editor', createdByName: 'Editor', createdAt: `${effectiveFrom}T09:00:00.000Z`,
    approvedByUserId: 'usr-finance', approvedByName: 'Finance', approvedAt: `${effectiveFrom}T10:00:00.000Z`, approvalStatus: 'approved',
  };
}

function membershipRecord(id, groupId, productId, packQuantity, effectiveFrom, effectiveTo = null) {
  return {
    id, organisationId: 'org-test', companyId: 'cmp-test', groupId, productId, packQuantity,
    effectiveFrom, effectiveTo, status: 'active', reason: 'Validator', createdByUserId: 'usr-editor',
    createdByName: 'Editor', createdAt: `${effectiveFrom}T09:00:00.000Z`, approvedByUserId: 'usr-finance',
    approvedByName: 'Finance', approvedAt: `${effectiveFrom}T10:00:00.000Z`, approvalStatus: 'approved',
  };
}

try {
  const groups = await load('src/domain/product-groups.ts');
  const cogs = await load('src/domain/cogs.ts');
  const calculations = await load('src/domain/calculations.ts');
  const data = await load('src/fixtures/data.ts');
  const fixtures = await load('src/fixtures/analytics-data.ts');
  const analytics = await load('src/services/analytics/analytics-aggregation.ts');
  const products = await load('src/services/analytics/product-aggregation.ts');
  const { materializeApprovedCogsDataset } = await load('src/services/mock/cogs-dataset.ts');
  const { MockProductGroupsRepository } = await load('src/services/mock/product-groups-repository.ts');
  const { mockProductGroupsStore, organisationProductGroupsState } = await load('src/services/mock/product-groups-store.ts');
  const { MockCogsManagementRepository } = await load('src/services/mock/cogs-management-repository.ts');
  const { mockCogsManagementStore } = await load('src/services/mock/cogs-management-store.ts');

  equal(groups.deriveInheritedCogsMinor(10_005, 333, 1_000), 3_332, 'Inherited COGS must round only after multiplying the exact base-cost ratio by Pack Quantity');
  await rejects(Promise.resolve().then(() => groups.deriveInheritedCogsMinor(10_000, 0, 1_000)), /greater than zero/i, 'Pack Quantity must be greater than zero');
  await rejects(Promise.resolve().then(() => groups.deriveInheritedCogsMinor(10_000, 100, 0)), /greater than zero/i, 'Base Quantity must be greater than zero');

  const historicalCosts = [
    costRecord('cost-jan', 'grp-test', 10_000, 1_000, '2026-01-01', '2026-04-01'),
    costRecord('cost-apr', 'grp-test', 11_000, 1_000, '2026-04-01'),
  ];
  const hundredPack = membershipRecord('member-100', 'grp-test', 'product-100', 100, '2026-01-01');
  equal(groups.resolveProductCogs({ directHistory: [], groupCostHistory: historicalCosts, membershipHistory: [hundredPack], productId: 'product-100', date: '2026-03-31' }).unitCostMinor, 1_000, '£100 / 1,000 must resolve a 100-pack to £10 before April');
  equal(groups.resolveProductCogs({ directHistory: [], groupCostHistory: historicalCosts, membershipHistory: [hundredPack], productId: 'product-100', date: '2026-04-01' }).unitCostMinor, 1_100, '£110 / 1,000 must resolve a 100-pack to £11 from April');
  equal(groups.validateProductGroupCostHistory(historicalCosts).length, 0, 'Historical Group cost ranges must be non-overlapping');

  const membershipHistory = [
    membershipRecord('member-jan', 'grp-test', 'product-pack-history', 80, '2026-01-01', '2026-04-01'),
    membershipRecord('member-apr', 'grp-test', 'product-pack-history', 100, '2026-04-01', '2026-07-01'),
  ];
  equal(groups.resolveProductGroupMembership(membershipHistory, '2026-03-15', 'product-pack-history')?.packQuantity, 80, 'Historical membership must retain the Pack Quantity effective before a change');
  equal(groups.resolveProductGroupMembership(membershipHistory, '2026-05-15', 'product-pack-history')?.packQuantity, 100, 'Pack Quantity changes must create a new effective membership range');
  equal(groups.resolveProductGroupMembership(membershipHistory, '2026-08-01', 'product-pack-history'), null, 'A Product leaving a Group must have no later inherited membership');
  expect(groups.validateProductGroupMemberships([
    membershipRecord('one-group', 'grp-one', 'one-product', 1, '2026-01-01'),
    membershipRecord('second-group', 'grp-two', 'one-product', 1, '2026-02-01'),
  ]).some((message) => message.includes('only one active Group')), 'One Product must not belong to overlapping active Groups');

  const directOverride = {
    id: 'direct-apr', organisationId: 'org-test', companyId: 'cmp-test', productId: 'product-100', unitCostMinor: 1_275,
    currency: 'GBP', effectiveFrom: '2026-04-15', effectiveTo: null, status: 'active', source: 'single-edit', reason: 'Direct negotiated exception',
    createdByUserId: 'usr-editor', createdByName: 'Editor', createdAt: '2026-04-14T09:00:00.000Z', changedByUserId: 'usr-editor',
    approvedByUserId: 'usr-finance', approvedByName: 'Finance', approvedAt: '2026-04-14T10:00:00.000Z', approvalStatus: 'approved',
  };
  equal(groups.resolveProductCogs({ directHistory: [directOverride], groupCostHistory: historicalCosts, membershipHistory: [hundredPack], productId: 'product-100', date: '2026-04-14' }).source, 'inherited', 'A direct Product override must not supersede Group inheritance before its effective date');
  const overridden = groups.resolveProductCogs({ directHistory: [directOverride], groupCostHistory: historicalCosts, membershipHistory: [hundredPack], productId: 'product-100', date: '2026-04-15' });
  equal(overridden.source, 'direct', 'A valid direct Product COGS record must win from its effective date');
  equal(overridden.unitCostMinor, 1_275, 'Direct Product override amount must be preserved');
  const missingGroupCost = groups.resolveProductCogs({ directHistory: [], groupCostHistory: [], membershipHistory: [hundredPack], productId: 'product-100', date: '2026-05-01' });
  equal(missingGroupCost.source, 'missing', 'Membership without an effective Group cost must resolve to Missing COGS');
  equal(missingGroupCost.unitCostMinor, null, 'Missing Group cost must remain unknown, never zero');

  mockProductGroupsStore.reset();
  mockCogsManagementStore.reset();
  const dataset = fixtures.generateAnalyticsDataset({ organisation: data.organisation, companies: data.companies, marketplaceAccounts: data.marketplaceAccounts });
  const baseContext = {
    organisationId: data.organisation.id, companyId: 'all', marketplace: 'all', marketplaceAccountIds: [],
    dateRange: { from: '2026-07-29', to: '2026-08-27' },
  };
  const baseInput = {
    context: baseContext, organisation: data.organisation, scenarioId: 'healthy', companies: data.companies,
    marketplaceAccounts: data.marketplaceAccounts, authorisedCompanyIds: data.companies.map((company) => company.id),
    authorisedAccountIds: data.marketplaceAccounts.map((account) => account.id), reportingCurrency: 'GBP',
    canViewSensitiveExpenses: true, cogsReadiness: null,
  };
  const listInput = {
    ...baseInput, organisationId: data.organisation.id, search: '', companyId: 'all', marketplace: 'all',
    marketplaceAccountId: 'all', status: 'all', asOf: '2026-09-02', page: 0, pageSize: 100,
  };
  const groupRepository = new MockProductGroupsRepository();
  const seededList = await groupRepository.list(listInput);
  expect(seededList.rows.length >= 3, 'Product Groups list must return deterministic Company-scoped groups');
  expect(seededList.rows.every((row) => row.group.companyId && row.group.baseProduct.id && row.memberCount > 0 && row.listingCount >= 0), 'Product Group rows must expose Company, Base Product, member and listing counts');
  const seededGroup = seededList.rows.find((row) => row.group.id === 'grp-disposable-gloves') ?? seededList.rows[0];
  const seededDetail = await groupRepository.getById({ ...baseInput, groupId: seededGroup.group.id, asOf: '2026-09-02' });
  expect(Boolean(seededDetail) && seededDetail.members.every((member) => member.product.ownerCompanyId === seededDetail.group.companyId), 'Every Product Group member must be owned by the Group Company');

  const companyId = seededGroup.group.companyId;
  const productOptions = await groupRepository.searchCompanyProducts({ ...baseInput, companyId, search: '', asOf: '2026-09-02', limit: 100 });
  expect(productOptions.length >= 3 && productOptions.every((option) => option.product.ownerCompanyId === companyId), 'Member search must expose only ungrouped Products owned by the selected Company');
  const actor = { id: 'usr-validator-finance', name: 'Validator Finance', companyIds: 'all', permissions: { edit: true, approve: true } };
  const created = await groupRepository.create({
    ...baseInput, organisationId: data.organisation.id, companyId, actor, name: 'Validator Packaging Set',
    description: 'Validator-owned same-Company Group', baseProductId: productOptions[0].product.id, baseQuantity: 100,
    unitOfMeasure: 'units', currency: 'GBP', baseCostMinor: 10_000, effectiveFrom: '2026-09-01',
    source: 'Validator supplier list', reason: 'Validate Product Group governance',
    members: productOptions.slice(0, 2).map((option, index) => ({ productId: option.product.id, packQuantity: (index + 1) * 10, effectiveFrom: '2026-09-01' })),
  });
  equal(created.group.companyId, companyId, 'A created Product Group must be Company-owned');
  expect(created.members.every((member) => member.product.ownerCompanyId === companyId), 'Create must retain same-Company membership only');
  const createdMembershipSnapshot = Object.values(organisationProductGroupsState(mockProductGroupsStore.read(), data.organisation.id).membershipsByGroup)
    .flat().filter((membership) => membership.productId === productOptions[0].product.id);
  expect(createdMembershipSnapshot.some((membership) => membership.groupId === created.group.id && membership.effectiveFrom === '2026-09-01'), 'Created membership must persist as an effective-dated Group record');
  const foreignProduct = dataset.products.find((product) => product.ownerCompanyId !== companyId);
  if (foreignProduct) {
    await rejects(groupRepository.create({
      ...baseInput, organisationId: data.organisation.id, companyId, actor, name: 'Invalid Cross Company Group', description: '',
      baseProductId: productOptions[0].product.id, baseQuantity: 100, unitOfMeasure: 'units', currency: 'GBP', baseCostMinor: 10_000,
      effectiveFrom: '2026-09-01', source: 'Validator', reason: 'Must fail', members: [{ productId: foreignProduct.id, packQuantity: 1 }],
    }), /selected Company/i, 'Cross-Company Group membership must be rejected');
  }
  await rejects(groupRepository.create({
    ...baseInput, organisationId: data.organisation.id, companyId, actor, name: 'Duplicate Membership Group', description: '',
    baseProductId: productOptions[2].product.id, baseQuantity: 100, unitOfMeasure: 'units', currency: 'GBP', baseCostMinor: 10_000,
    effectiveFrom: '2026-09-02', source: 'Validator', reason: 'Must fail', members: [{ productId: productOptions[0].product.id, packQuantity: 1 }],
  }), /only one active Group|overlaps/i, 'Repository mutation must enforce one active Group per Product');
  await rejects(groupRepository.create({
    ...baseInput, organisationId: data.organisation.id, companyId, actor, name: 'Zero Base Group', description: '',
    baseProductId: productOptions[2].product.id, baseQuantity: 0, unitOfMeasure: 'units', currency: 'GBP', baseCostMinor: 10_000,
    effectiveFrom: '2026-09-02', source: 'Validator', reason: 'Must fail', members: [{ productId: productOptions[2].product.id, packQuantity: 1 }],
  }), /Base quantity.*greater than zero/i, 'Repository must reject Base Quantity <= 0');
  await rejects(groupRepository.create({
    ...baseInput, organisationId: data.organisation.id, companyId, actor, name: 'Zero Pack Group', description: '',
    baseProductId: productOptions[2].product.id, baseQuantity: 100, unitOfMeasure: 'units', currency: 'GBP', baseCostMinor: 10_000,
    effectiveFrom: '2026-09-02', source: 'Validator', reason: 'Must fail', members: [{ productId: productOptions[2].product.id, packQuantity: 0 }],
  }), /Pack quantity.*greater than zero/i, 'Repository must reject Pack Quantity <= 0');

  await groupRepository.changeMembership({ ...baseInput, organisationId: data.organisation.id, companyId, groupId: created.group.id, productId: productOptions[0].product.id, action: 'change-pack-quantity', packQuantity: 12, effectiveFrom: '2026-09-03', reason: 'Validator pack correction', actor });
  await groupRepository.changeMembership({ ...baseInput, organisationId: data.organisation.id, companyId, groupId: created.group.id, productId: productOptions[1].product.id, action: 'remove', effectiveFrom: '2026-09-04', reason: 'Validator member removal', actor });
  await groupRepository.changeMembership({ ...baseInput, organisationId: data.organisation.id, companyId, groupId: created.group.id, productId: productOptions[2].product.id, action: 'add', packQuantity: 24, effectiveFrom: '2026-09-05', reason: 'Validator member addition', actor });
  const proposal = await groupRepository.createCostProposal({ ...baseInput, organisationId: data.organisation.id, companyId, groupId: created.group.id, baseCostMinor: 11_000, baseQuantity: 120, currency: 'GBP', effectiveFrom: '2026-09-06', source: 'Validator supplier list', reason: 'Validator Group cost update', financiallyConfirmed: true, actor });
  equal(proposal.status, 'awaiting-approval', 'Group cost changes must remain proposals until explicit approval');
  const applied = await groupRepository.applyCostProposal(baseInput, proposal.id, actor, true);
  equal(applied.status, 'applied', 'A cogs.approve actor must explicitly apply a confirmed Group cost proposal');
  await rejects(groupRepository.applyCostProposal(baseInput, proposal.id, { ...actor, permissions: { edit: true, approve: false } }, false), /cogs\.approve/i, 'A role without cogs.approve must not approve Group financial changes');

  const directAuditRecord = {
    id: 'validator-direct-override', organisationId: data.organisation.id, companyId, productId: productOptions[0].product.id,
    unitCostMinor: 975, currency: 'GBP', effectiveFrom: '2026-09-07', effectiveTo: null, status: 'active', source: 'single-edit',
    reason: 'Validator direct exception', createdByUserId: actor.id, createdByName: actor.name, createdAt: '2026-09-07T09:00:00.000Z',
    changedByUserId: actor.id, approvedByUserId: actor.id, approvedByName: actor.name, approvedAt: '2026-09-07T09:01:00.000Z', approvalStatus: 'approved',
  };
  expect(Boolean(await groupRepository.recordDirectOverride(baseInput, directAuditRecord, actor)), 'A direct Product override inside an effective Group membership must create Group audit activity');
  const auditedActions = new Set((await groupRepository.getAuditEvents(baseInput, created.group.id)).map((event) => event.action));
  for (const action of ['product-group.created', 'product-group.member-added', 'product-group.member-removed', 'product-group.pack-quantity-changed', 'product-group.base-quantity-changed', 'product-group.base-cost-changed', 'product-group.direct-override-created']) {
    expect(auditedActions.has(action), `Audit must retain ${action}`);
  }

  const restrictedCompany = data.companies.find((company) => company.id === companyId);
  const foreignGroup = seededList.rows.find((row) => row.group.companyId !== companyId);
  const restrictedInput = {
    ...baseInput, context: { ...baseContext, companyId }, authorisedCompanyIds: [companyId],
    authorisedAccountIds: data.marketplaceAccounts.filter((account) => account.companyId === companyId).map((account) => account.id),
  };
  const restrictedList = await groupRepository.list({ ...listInput, ...restrictedInput, organisationId: data.organisation.id, companyId: 'all' });
  expect(Boolean(restrictedCompany) && restrictedList.rows.every((row) => row.group.companyId === companyId), 'Product Group list and export source rows must remain inside Company assignment');
  if (foreignGroup) {
    const searchLeak = await groupRepository.list({ ...listInput, ...restrictedInput, organisationId: data.organisation.id, companyId: 'all', search: foreignGroup.group.name });
    equal(searchLeak.total, 0, 'Product Group search must not disclose a foreign Company Group');
    equal(await groupRepository.getById({ ...restrictedInput, groupId: foreignGroup.group.id, asOf: '2026-09-02' }), null, 'Direct Product Group URL must not disclose a foreign Company Group');
    await rejects(groupRepository.searchCompanyProducts({ ...restrictedInput, companyId: foreignGroup.group.companyId, search: '', asOf: '2026-09-02' }), /outside your .*assignment/i, 'Member search must reject a foreign Company');
    await rejects(groupRepository.changeMembership({ ...restrictedInput, organisationId: data.organisation.id, companyId: foreignGroup.group.companyId, groupId: foreignGroup.group.id, productId: foreignGroup.group.baseProduct.id, action: 'remove', effectiveFrom: '2026-09-07', reason: 'Must fail', actor: { ...actor, companyIds: [companyId] } }), /outside your .*assignment/i, 'Membership mutation must reject a foreign Company Group');
  }

  const materialized = materializeApprovedCogsDataset(dataset, data.organisation.id);
  const productQuery = { ...baseInput, search: '', cogsStatus: 'all', listingStatus: 'all', profitabilityStatus: 'all', categories: [], sorting: [{ field: 'revenue', direction: 'desc' }], page: 0, pageSize: 100 };
  const productPage = products.aggregateProductPage(materialized, productQuery);
  const dashboard = analytics.aggregateDashboardAnalytics(materialized, baseInput);
  equal(productPage.summary.revenueMinor, dashboard.current.revenueMinor, 'Product revenue must reconcile to Dashboard after inherited COGS materialisation');
  equal(productPage.summary.cogsMinor, dashboard.current.cogsMinor, 'Product known COGS must reconcile to Dashboard after inherited COGS materialisation');
  equal(productPage.summary.knownNetProfitMinor, dashboard.current.knownNetProfitMinor, 'Product known Net Profit must reconcile to Dashboard after inherited COGS materialisation');
  const inheritedMember = seededDetail?.members.find((member) => member.resolvedCogs.source === 'inherited');
  const inheritedProductRow = productPage.rows.find((row) => row.product.id === inheritedMember?.product.id);
  expect(Boolean(inheritedProductRow?.inheritedCogs) && inheritedProductRow?.productGroup?.id === seededDetail?.group.id && inheritedProductRow.cogsSource === 'Inherited from Product Group', 'Products list must reconcile Group, Pack Quantity, source label and inherited indicator');
  if (inheritedMember) {
    const productCosts = products.aggregateProductCosts(materialized, { ...baseInput, productId: inheritedMember.product.id });
    equal(productCosts.inheritance?.productGroupId, seededDetail.group.id, 'Product Costs detail must retain the canonical Product Group reference');
    equal(productCosts.current?.unitCost.amountMinor, inheritedMember.resolvedCogs.unitCostMinor, 'Product detail inherited COGS must reconcile to Group resolution');
  }
  if (seededDetail) {
    equal(seededDetail.profitability.revenueMinor, seededDetail.members.reduce((sum, member) => sum + member.profitability.revenueMinor, 0), 'Group profitability Revenue must equal the sum of canonical member profitability');
    equal(seededDetail.profitability.cogsMinor, seededDetail.members.reduce((sum, member) => sum + member.profitability.cogsMinor, 0), 'Group profitability COGS must equal the sum of canonical member profitability');
    equal(seededDetail.profitability.knownNetProfitMinor, seededDetail.members.reduce((sum, member) => sum + member.profitability.knownNetProfitMinor, 0), 'Group profitability Net Profit must equal the sum of canonical member profitability');
  }

  mockCogsManagementStore.reset();
  const cogsRepository = new MockCogsManagementRepository();
  const importActor = { id: 'usr-validator-importer', name: 'Validator Importer', permissions: { edit: false, import: true, approve: false } };
  if (inheritedMember && seededDetail) {
    const headers = ['SKU', 'Product', 'Cost', 'Currency', 'Effective Date'];
    const imported = await cogsRepository.createImport({
      ...baseInput, actor: importActor, companyId: seededDetail.group.companyId, fileName: 'group-override.csv', fileType: 'csv',
      fileSize: 256, sheetNames: [], selectedSheet: null, headers,
      rawRows: [{ SKU: inheritedMember.product.internalSku, Product: inheritedMember.product.title, Cost: '12.50', Currency: 'GBP', 'Effective Date': '2026-09-02' }],
      mapping: cogs.detectCogsColumnMapping(headers), reason: 'Validator grouped Product import', note: '',
    });
    const warningRow = imported.rows[0];
    expect(warningRow.anomalies.some((item) => item.code === 'group_inheritance_override' && item.detail.includes('Applying an individual Product cost will override Group inheritance from the selected effective date.')), 'Importing a grouped Product must show the explicit inheritance-override warning');
    expect(!warningRow.groupOverrideAcknowledged && !cogs.importRowReady(warningRow), 'A grouped Product import row must not be financially ready before explicit acknowledgement');
    const acknowledged = await cogsRepository.reviewRow(baseInput, imported.id, warningRow.id, 'accepted', importActor);
    const acknowledgedRow = acknowledged.rows[0];
    expect(acknowledgedRow.groupOverrideAcknowledged && cogs.importRowReady(acknowledgedRow), 'Explicit review must persist Group override acknowledgement before financial approval');
  }

  const groupsListSource = readFileSync(pathFor('src/features/cogs/product-groups/product-groups-page.tsx'), 'utf8');
  const createSource = readFileSync(pathFor('src/features/cogs/product-groups/create-product-group-page.tsx'), 'utf8');
  const detailSource = readFileSync(pathFor('src/features/cogs/product-groups/product-group-detail-page.tsx'), 'utf8');
  const productsSource = readFileSync(pathFor('src/features/products/products-page.tsx'), 'utf8');
  const productDetailSource = readFileSync(pathFor('src/features/products/product-detail-sections.tsx'), 'utf8');
  const editFlowsSource = readFileSync(pathFor('src/features/cogs/cogs-edit-flows.tsx'), 'utf8');
  const importReviewSource = readFileSync(pathFor('src/features/cogs/cogs-import-review-page.tsx'), 'utf8');
  const formsSource = readFileSync(pathFor('src/components/ui/forms.tsx'), 'utf8');
  const subNavigationSource = readFileSync(pathFor('src/features/cogs/product-groups/cogs-sub-navigation.tsx'), 'utf8');
  const globalStyles = readFileSync(pathFor('app/globals.css'), 'utf8');
  for (const route of ['app/o/[orgSlug]/cogs/groups/page.tsx', 'app/o/[orgSlug]/cogs/groups/new/page.tsx', 'app/o/[orgSlug]/cogs/groups/[groupId]/page.tsx']) {
    expect(existsSync(pathFor(route)), `Product Groups route must exist: ${route}`);
  }
  const navPositions = ['Current Costs', 'Product Groups', 'Imports', 'Pending Approval'].map((label) => subNavigationSource.indexOf(label));
  expect(navPositions.every((position) => position >= 0) && navPositions.every((position, index) => index === 0 || position > navPositions[index - 1]), 'COGS sub-navigation must use the approved four-item order');
  for (const label of ['Group Name', 'Company', 'Base Product', 'Base Quantity', 'Current Base Cost', 'Base Unit Cost', 'Products / SKUs', 'Listings', 'Marketplaces', 'Effective From', 'COGS Status', 'Last Updated', 'Updated By']) {
    expect(groupsListSource.includes(label), `Product Groups list must include ${label}`);
  }
  expect(groupsListSource.includes('authorisedAccounts') && groupsListSource.includes('Copilot suggestion · no changes applied'), 'Group filters and Copilot suggestion must remain assignment-safe and non-mutating');
  for (const label of ['Group Name', 'Company', 'Description', 'Base Product', 'Base Quantity', 'Unit of Measure', 'Currency', 'Base Cost', 'Effective From', 'Source', 'Reason', 'Pack Quantity', 'Conversion %', 'Inherited COGS']) {
    expect(createSource.includes(label), `Create Product Group must include ${label}`);
  }
  expect(createSource.includes('deriveInheritedCogsMinor') && createSource.includes('round(Base Cost Minor × Pack Quantity ÷ Base Quantity)'), 'Create Product Group must use the exact minor-unit inherited-cost function and explain the single rounding boundary');
  for (const label of ['Overview', 'Members', 'Profitability', 'Cost History', 'Activity', 'Update Group Cost', 'Current and new member impact']) {
    expect(detailSource.includes(label), `Product Group detail must include ${label}`);
  }
  expect(productsSource.includes("id: 'productGroup'") && productsSource.includes("id: 'packQuantity'") && productsSource.includes("id: 'cogsSource'") && productsSource.includes('inheritedCogs'), 'Products list must offer Product Group, Pack Quantity, source and inherited indicator metadata');
  for (const label of ['COGS Source', 'Product Group', 'Group', 'Pack Quantity', 'Base Quantity', 'Base Cost', 'Base Unit Cost', 'Calculated COGS', 'View Product Group']) {
    expect(productDetailSource.includes(label), `Product Costs detail must include ${label}`);
  }
  expect(importReviewSource.includes('This Product currently inherits COGS from') || readFileSync(pathFor('src/services/mock/cogs-management-repository.ts'), 'utf8').includes('This Product currently inherits COGS from'), 'Import review must expose the exact Group inheritance warning');
  expect(importReviewSource.includes('Acknowledge override and accept') && importReviewSource.includes('groupOverrideAcknowledged'), 'Import review must require explicit override acknowledgement');
  expect(globalStyles.includes('.product-group-detail-hero') && globalStyles.includes('.product-inherited-cost-card') && globalStyles.includes('.cogs-group-override-review') && globalStyles.includes('@media (max-width: 760px)'), 'Product Group, inherited Product detail, import warning and mobile detail surfaces must be styled');
  const applyingIndex = importReviewSource.indexOf("setApplyStage('Applying')");
  const recalculatingIndex = importReviewSource.indexOf("setApplyStage('Recalculating')");
  const appliedIndex = importReviewSource.indexOf("setApplyStage('Applied')");
  const toastIndex = importReviewSource.indexOf("showToast('Import approved and applied atomically.'");
  expect(applyingIndex >= 0 && recalculatingIndex > applyingIndex && appliedIndex > recalculatingIndex && toastIndex > appliedIndex, 'Atomic apply UI must visibly sequence Applying → Recalculating → Applied → success toast');
  const displayedDate = calculations.formatDate('2026-09-02');
  expect(/^02 Sep(?:t)? 2026$/.test(displayedDate), `Effective-date formatter must be unambiguous; received ${displayedDate}`);
  expect(formsSource.includes('UnambiguousDateInput') && formsSource.includes("month: 'short'") && formsSource.includes('type="date"'), 'The shared date control must show an unambiguous short-month date while retaining a native ISO date picker');
  expect(createSource.includes('UnambiguousDateInput') && detailSource.includes('UnambiguousDateInput') && editFlowsSource.includes('UnambiguousDateInput') && importReviewSource.includes('UnambiguousDateInput as Input'), 'Single, bulk, percentage, Product Group and import effective dates must use the unambiguous ISO-backed date control');

  mockCogsManagementStore.reset();
  mockProductGroupsStore.reset();
  if (failures.length) {
    console.error(`Phase 5 Product Groups validation failed (${failures.length}):`);
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exitCode = 1;
  } else {
    console.log('Phase 5 Product Groups validation passed: Company ownership, same-Company membership, one-active-Group cardinality, positive quantities, exact rational arithmetic, effective-dated costs and membership, direct precedence, missing-cost semantics, Dashboard/Product reconciliation, canonical Group profitability, import acknowledgement, RBAC, audit coverage, unambiguous dates and apply sequencing.');
  }
} catch (error) {
  console.error('Phase 5 Product Groups validator could not execute.');
  console.error(error);
  process.exitCode = 1;
}
