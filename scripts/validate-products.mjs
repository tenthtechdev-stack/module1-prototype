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
  const data = await load('src/fixtures/data.ts');
  const fixtures = await load('src/fixtures/analytics-data.ts');
  const productDomain = await load('src/domain/products.ts');
  const products = await load('src/services/analytics/product-aggregation.ts');
  const dashboard = await load('src/services/analytics/analytics-aggregation.ts');
  const savedViews = await load('src/domain/product-saved-views.ts');
  const calculations = await load('src/domain/financial-calculations.ts');
  const { queryKeys } = await load('src/services/query-keys.ts');

  const productsPageSource = readFileSync(pathFor('src/features/products/products-page.tsx'), 'utf8');
  const enterpriseGridSource = readFileSync(pathFor('src/components/tables/enterprise-data-grid.tsx'), 'utf8');
  const overlaySource = readFileSync(pathFor('src/components/ui/overlays.tsx'), 'utf8');
  const globalStyles = readFileSync(pathFor('app/globals.css'), 'utf8');
  expect(productsPageSource.includes("initialPinnedColumns={['select', 'product']}"), 'Products grid must pin selection and Product identity columns at the start');
  expect(productsPageSource.includes('renderRowActions={rowActions}'), 'Products grid must retain per-row actions');
  expect(enterpriseGridSource.includes('id: GRID_ROW_ACTIONS_COLUMN_ID')
    && enterpriseGridSource.includes('enableHiding: false')
    && enterpriseGridSource.includes('return [...columns, actionsColumn]'), 'Enterprise grid must append a non-hideable row-actions column');
  expect(enterpriseGridSource.includes('<table style={{ width: table.getTotalSize() }}>')
    && globalStyles.includes('.table-scroll { overflow-x: auto; }'), 'Wide Products columns must retain their total width inside a horizontal scroll container');
  expect(enterpriseGridSource.includes("position: pinned ? 'sticky' : undefined")
    && globalStyles.includes('.enterprise-grid .pinned-column'), 'Pinned Products columns must remain sticky while the grid scrolls');
  expect(enterpriseGridSource.includes("cell.column.id === GRID_ROW_ACTIONS_COLUMN_ID")
    && overlaySource.includes('<DropdownMenuPrimitive.Portal>'), 'Row actions must remain reachable on mobile and render outside the scroll clipping boundary');

  const dataset = fixtures.generateAnalyticsDataset({
    organisation: data.organisation,
    companies: data.companies,
    marketplaceAccounts: data.marketplaceAccounts,
  });
  const repeated = fixtures.generateAnalyticsDataset({
    organisation: data.organisation,
    companies: data.companies,
    marketplaceAccounts: data.marketplaceAccounts,
  });
  expect(JSON.stringify(dataset) === JSON.stringify(repeated), 'Product fixtures must be deterministic');
  equal(dataset.products.length, fixtures.VISIBLE_PRODUCT_CATALOGUE_SIZE, 'Visible internal catalogue size must use the Phase 4 deterministic fixture constant');
  expect(dataset.products.length >= 150 && dataset.products.length <= 300, 'Visible product fixtures must contain 150-300 internal products');
  equal(new Set(dataset.products.map((product) => product.id)).size, dataset.products.length, 'Internal product IDs must be unique');
  equal(new Set(dataset.products.map((product) => productDomain.companyScopedInternalSkuKey(product.ownerCompanyId, product.internalSku))).size, dataset.products.length, 'Internal SKU must be unique inside its owning Company');

  const ownershipSnapshotFor = (candidateDataset) => ({
    organisationId: data.organisation.id,
    companies: data.companies,
    marketplaceAccounts: data.marketplaceAccounts,
    products: candidateDataset.products,
    listings: candidateDataset.listings,
  });
  const ownershipViolationsFor = (candidateDataset) => productDomain.findCatalogueOwnershipViolations(ownershipSnapshotFor(candidateDataset));
  const ownershipViolations = ownershipViolationsFor(dataset);
  equal(ownershipViolations.length, 0, 'Canonical catalogue fixture must satisfy every ownership invariant');
  expect(dataset.products.every((product) => data.companies.filter((company) => company.id === product.ownerCompanyId
    && company.organisationId === product.organisationId).length === 1
    && product.companyId === product.ownerCompanyId), 'Every internal Product must belong to exactly one Company in its Organisation');

  const productById = new Map(dataset.products.map((product) => [product.id, product]));
  const accountById = new Map(data.marketplaceAccounts.map((account) => [account.id, account]));
  expect(dataset.listings.every((listing) => {
    const product = productById.get(listing.productId);
    const account = accountById.get(listing.marketplaceAccountId);
    return product
      && account
      && listing.companyId === product.ownerCompanyId
      && account.companyId === product.ownerCompanyId
      && account.marketplace === listing.marketplace;
  }), 'Every Marketplace Listing and account must belong to its Product owning Company');

  const listingsByProduct = new Map();
  dataset.listings.forEach((listing) => listingsByProduct.set(listing.productId, [...(listingsByProduct.get(listing.productId) ?? []), listing]));
  expect([...listingsByProduct.values()].some((listings) => listings.length > 1), 'One internal product must link to multiple marketplace listings');
  expect([...listingsByProduct.values()].some((listings) => new Set(listings.map((listing) => listing.marketplace)).size === 3), 'A deterministic product must demonstrate Amazon, eBay and Temu listings');
  expect([...listingsByProduct.values()].some((listings) => listings.length === 1 && listings[0].marketplace === 'amazon'), 'A deterministic Amazon-only Product must exist');
  expect(dataset.listings.some((listing) => listing.listingStatus !== 'active'), 'A deterministic inactive, ended, suppressed or issue listing must exist');
  expect(dataset.listings.every((listing) => listing.marketplaceSku && listing.title && listing.price.amountMinor > 0), 'Every listing must retain marketplace-specific identity, title and positive source price');
  expect(dataset.listings.filter((listing) => listing.marketplace === 'amazon').every((listing) => listing.asin && !listing.ebayItemId && !listing.temuListingId), 'Amazon listings must expose ASIN without mislabelling eBay/Temu IDs');
  expect(dataset.listings.filter((listing) => listing.marketplace === 'ebay').every((listing) => listing.ebayItemId && !listing.asin && !listing.temuListingId), 'eBay listings must expose eBay Item ID without ASIN/Temu IDs');
  expect(dataset.listings.filter((listing) => listing.marketplace === 'temu').every((listing) => listing.temuListingId && !listing.asin && !listing.ebayItemId), 'Temu listings must expose Temu Listing ID without Amazon/eBay IDs');
  expect(dataset.products.every((product) => !Object.hasOwn(product, 'asin') && !Object.hasOwn(product, 'marketplaceSku')), 'Marketplace identifiers must not be merged into internal Product');

  const sourceProduct = dataset.products[0];
  const sameCompanyPeer = dataset.products.find((product) => product.ownerCompanyId === sourceProduct.ownerCompanyId && product.id !== sourceProduct.id);
  const foreignProduct = dataset.products.find((product) => product.ownerCompanyId !== sourceProduct.ownerCompanyId);
  expect(Boolean(sameCompanyPeer && foreignProduct), 'Ownership fixtures must include same-Company and cross-Company Product peers');
  if (sameCompanyPeer && foreignProduct) {
    const crossCompanySkuDataset = {
      ...dataset,
      products: dataset.products.map((product) => product.id === foreignProduct.id
        ? { ...product, internalSku: sourceProduct.internalSku, sku: sourceProduct.internalSku }
        : product),
    };
    expect(!ownershipViolationsFor(crossCompanySkuDataset).some((violation) => violation.code === 'duplicate_company_internal_sku'), 'The same internal SKU must be accepted in different Companies');
    equal(crossCompanySkuDataset.products.find((product) => product.id === foreignProduct.id)?.id, foreignProduct.id, 'Cross-Company SKU reuse must preserve the company-owned operational Product ID');

    const cosmeticallyDifferentDuplicateSku = `  ${sourceProduct.internalSku.toLowerCase()}  `;
    const duplicateWithinCompanyDataset = {
      ...dataset,
      products: dataset.products.map((product) => product.id === sameCompanyPeer.id
        ? { ...product, internalSku: cosmeticallyDifferentDuplicateSku, sku: cosmeticallyDifferentDuplicateSku }
        : product),
    };
    expect(ownershipViolationsFor(duplicateWithinCompanyDataset).some((violation) => violation.code === 'duplicate_company_internal_sku' && violation.entityId === sameCompanyPeer.id), 'Internal SKU duplication inside one Company must be rejected');
  }

  const orphanOwnerId = `${data.organisation.id}:company-missing`;
  const orphanProductDataset = {
    ...dataset,
    products: dataset.products.map((product) => product.id === sourceProduct.id
      ? { ...product, ownerCompanyId: orphanOwnerId, companyId: orphanOwnerId }
      : product),
  };
  expect(ownershipViolationsFor(orphanProductDataset).some((violation) => violation.code === 'product_owner_cardinality' && violation.entityId === sourceProduct.id), 'A Product without exactly one owning Company must be rejected');

  const sourceListing = dataset.listings.find((listing) => listing.productId === sourceProduct.id) ?? dataset.listings[0];
  const listingProduct = sourceListing ? productById.get(sourceListing.productId) : undefined;
  const foreignAccount = listingProduct
    ? data.marketplaceAccounts.find((account) => account.companyId !== listingProduct.ownerCompanyId)
    : undefined;
  expect(Boolean(sourceListing && listingProduct && foreignAccount), 'Ownership fixtures must include a Listing and a foreign Marketplace Account');
  if (sourceListing && listingProduct && foreignAccount) {
    const crossedListingCompanyDataset = {
      ...dataset,
      listings: dataset.listings.map((listing) => listing.id === sourceListing.id
        ? { ...listing, companyId: foreignAccount.companyId }
        : listing),
    };
    expect(ownershipViolationsFor(crossedListingCompanyDataset).some((violation) => violation.code === 'listing_product_company_mismatch' && violation.entityId === sourceListing.id), 'A Listing company cannot cross its Product owning Company');

    const crossedListingAccountDataset = {
      ...dataset,
      listings: dataset.listings.map((listing) => listing.id === sourceListing.id
        ? { ...listing, marketplaceAccountId: foreignAccount.id, marketplace: foreignAccount.marketplace }
        : listing),
    };
    expect(ownershipViolationsFor(crossedListingAccountDataset).some((violation) => violation.code === 'listing_account_company_mismatch' && violation.entityId === sourceListing.id), 'A Listing account cannot cross its Product owning Company');
  }

  const baseContext = {
    organisationId: data.organisation.id,
    companyId: 'all',
    marketplace: 'all',
    marketplaceAccountIds: [],
    dateRange: { from: '2026-07-29', to: '2026-08-27' },
  };
  const baseInput = {
    context: baseContext,
    organisation: data.organisation,
    scenarioId: 'healthy',
    companies: data.companies,
    marketplaceAccounts: data.marketplaceAccounts,
    authorisedCompanyIds: data.companies.map((company) => company.id),
    authorisedAccountIds: data.marketplaceAccounts.map((account) => account.id),
    reportingCurrency: 'GBP',
    canViewSensitiveExpenses: true,
    cogsReadiness: null,
  };
  const queryFor = (overrides = {}) => ({
    ...baseInput,
    search: '',
    cogsStatus: 'all',
    listingStatus: 'all',
    profitabilityStatus: 'all',
    categories: [],
    sorting: [{ field: 'revenue', direction: 'desc' }],
    page: 0,
    pageSize: 100,
    ...overrides,
  });
  const rowsFor = (query) => {
    const first = products.aggregateProductPage(dataset, { ...query, page: 0, pageSize: 100 });
    const rows = [...first.rows];
    for (let page = 1; page < first.pageCount; page += 1) rows.push(...products.aggregateProductPage(dataset, { ...query, page, pageSize: 100 }).rows);
    return { first, rows };
  };

  const allDashboard = dashboard.aggregateDashboardAnalytics(dataset, baseInput);
  const allProducts = rowsFor(queryFor());
  equal(allProducts.rows.length, allProducts.first.total, 'Controlled pagination must return every matching product exactly once');
  equal(allProducts.first.pageSize, 100, 'Product pagination must preserve requested page size');
  equal(allProducts.first.summary.revenueMinor, allDashboard.current.revenueMinor, 'Product summary Revenue must reconcile to Dashboard Revenue');
  equal(allProducts.rows.reduce((sum, row) => sum + row.revenueMinor, 0), allDashboard.current.revenueMinor, 'Sum(Product Revenue) must equal Dashboard Revenue');
  equal(allProducts.rows.reduce((sum, row) => sum + (row.knownNetProfitMinor ?? 0), 0), allDashboard.current.knownNetProfitMinor, 'Sum(Product Known Net Profit) must equal Dashboard Known Net Profit');
  equal(allProducts.first.summary.activeListings, new Set(allProducts.rows.flatMap((row) => row.listings.filter((listing) => listing.listingStatus === 'active').map((listing) => listing.id))).size, 'Active listing summary must count scoped active listings once');
  equal(allProducts.first.summary.cogsCoverageBps, Math.round((allProducts.rows.filter((row) => row.cogsStatus === 'complete').length * 10_000) / allProducts.rows.length), 'Product-count COGS coverage must use products as its denominator');
  equal(allProducts.first.summary.profitabilityCoverageBps, allDashboard.current.profitabilityCoverageBps, 'Revenue-weighted profitability coverage must reconcile to Dashboard coverage');
  expect(allProducts.rows.some((row) => row.profitabilityStatus === 'loss_making'), 'Healthy fixtures must expose a loss-making Product');
  expect(allProducts.rows.some((row) => row.profitabilityStatus === 'low_margin'), 'Healthy fixtures must expose a distinct low-margin Product');
  expect(allProducts.rows.some((row) => row.orders === 0), 'A deterministic Product with no sales in the selected period must exist');
  expect(allProducts.rows.filter((row) => row.orders === 0).every((row) => row.profitabilityStatus === 'incomplete'), 'Zero-sales Products must not be classified as profitable');

  const firstSync = rowsFor(queryFor({ scenarioId: 'first-sync' }));
  expect(firstSync.rows.length > 0 && firstSync.rows.length < allProducts.rows.length, 'First Sync must expose a deterministic partial catalogue while listings are still arriving');
  expect(firstSync.rows.every((row) => row.dataFreshness.state === 'syncing'), 'First Sync Product rows must communicate that import freshness is still in progress');

  const amazonDelayed = rowsFor(queryFor({ scenarioId: 'amazon-delayed' })).rows;
  expect(amazonDelayed.some((row) => row.marketplaces.includes('amazon') && row.dataFreshness.state === 'warning'), 'Amazon delayed scenario must mark Amazon-linked Products stale');
  expect(amazonDelayed.filter((row) => !row.marketplaces.includes('amazon')).every((row) => row.dataFreshness.state === 'fresh'), 'Amazon delay must not mark Products without an Amazon listing stale');

  for (const marketplace of ['amazon', 'ebay', 'temu']) {
    const context = { ...baseContext, marketplace };
    const input = { ...baseInput, context };
    const productRows = rowsFor(queryFor({ context })).rows;
    const analytics = dashboard.aggregateDashboardAnalytics(dataset, input);
    equal(productRows.reduce((sum, row) => sum + row.revenueMinor, 0), analytics.current.revenueMinor, `${marketplace} Product revenue must use only ${marketplace} records`);
    expect(productRows.every((row) => row.listings.every((listing) => listing.marketplace === marketplace)), `${marketplace} scope must expose only matching listing projections`);
  }

  const account = data.marketplaceAccounts.find((candidate) => candidate.id === 'acct-stock-amazon') ?? data.marketplaceAccounts[0];
  const accountContext = { ...baseContext, companyId: account.companyId, marketplace: account.marketplace, marketplaceAccountIds: [account.id] };
  const accountInput = { ...baseInput, context: accountContext };
  const accountRows = rowsFor(queryFor({ context: accountContext })).rows;
  const accountDashboard = dashboard.aggregateDashboardAnalytics(dataset, accountInput);
  equal(accountRows.reduce((sum, row) => sum + row.revenueMinor, 0), accountDashboard.current.revenueMinor, 'Specific-account Product revenue must reconcile to that account only');
  expect(accountRows.every((row) => row.marketplaceAccountIds.length === 1 && row.marketplaceAccountIds[0] === account.id), 'Specific-account rows must exclude every other account listing');

  const representative = allProducts.rows.find((row) => row.listingCount > 1 && row.revenueMinor > 0) ?? allProducts.rows[0];
  const detailQuery = { ...baseInput, productId: representative.id };
  const preparedRecords = dashboard.prepareProfitabilityRecords(dataset, baseInput);
  const representativeTotals = dashboard.calculateDashboardTotals(
    dashboard.filterProfitabilityRecords(preparedRecords, baseContext).filter((record) => record.productId === representative.id),
  );
  equal(representative.revenueMinor, representativeTotals.revenueMinor, 'Product Revenue must reconcile directly to its scoped underlying financial records');
  equal(representative.knownNetProfitMinor, representativeTotals.knownNetProfitMinor, 'Product Known Net Profit must reconcile directly to the shared Phase 3 engine');
  const overview = products.aggregateProductOverview(dataset, detailQuery);
  expect(overview.status === 'found', 'Accessible product detail must resolve as found');
  if (overview.status === 'found') {
    equal(overview.data.selectedPeriod.revenueMinor, representative.revenueMinor, 'Product Detail Revenue must match its Product list row');
    equal(overview.data.selectedPeriod.units, representative.units, 'Product Detail Units must match its Product list row');
    equal(overview.data.selectedPeriod.knownNetProfitMinor, representative.knownNetProfitMinor, 'Product Detail Known Net Profit must match its Product list row');
    equal(overview.data.selectedPeriod.knownMarginBps, representative.marginBps, 'Product Detail Margin must match its Product list row');
  }
  const profitability = products.aggregateProductProfitability(dataset, detailQuery);
  equal(profitability.byMarketplace.reduce((sum, row) => sum + row.totals.revenueMinor, 0), profitability.totals.revenueMinor, 'Product marketplace Revenue must reconcile to combined Product Revenue');
  equal(profitability.byAccount.reduce((sum, row) => sum + row.totals.revenueMinor, 0), profitability.totals.revenueMinor, 'Product account Revenue must reconcile to combined Product Revenue');
  expect(profitability.roiBps === null || Number.isFinite(profitability.roiBps), 'ROI must never be Infinity or NaN');

  const referenceProduct = dataset.products.find((product) => product.title === 'Blue Nitrile Gloves XL');
  expect(Boolean(referenceProduct), 'Historical COGS reference product must exist');
  if (referenceProduct) {
    const referenceQuery = { ...baseInput, productId: referenceProduct.id };
    const costs = products.aggregateProductCosts(dataset, referenceQuery);
    equal(costs.history.length, 3, 'Reference Product Cost History must retain all effective-date periods');
    equal(costs.current?.unitCost.amountMinor, 720, 'Current COGS must use the August-current £7.20 record');
    equal(calculations.resolveHistoricalUnitCogs(dataset.cogsHistory, referenceProduct.id, '2026-02-15'), 650, 'February transactions must resolve £6.50 COGS');
    equal(calculations.resolveHistoricalUnitCogs(dataset.cogsHistory, referenceProduct.id, '2026-06-15'), 690, 'June transactions must resolve £6.90 COGS');
    equal(calculations.resolveHistoricalUnitCogs(dataset.cogsHistory, referenceProduct.id, '2026-08-15'), 720, 'August transactions must resolve £7.20 COGS');
  }

  for (const field of ['internalSku', 'marketplaceSku', 'asin', 'ebayItemId', 'temuListingId']) {
    const listing = dataset.listings.find((candidate) => candidate[field]);
    const value = field === 'internalSku'
      ? dataset.products[0].internalSku
      : listing?.[field];
    if (!value) continue;
    const expectedProductId = field === 'internalSku' ? dataset.products[0].id : listing.productId;
    const searched = products.aggregateProductPage(dataset, queryFor({ search: value }));
    expect(searched.rows.some((row) => row.id === expectedProductId), `Product search must match ${field}`);
  }

  const noCogsInput = { ...baseInput, scenarioId: 'cogs-none' };
  const noCogsRows = rowsFor(queryFor({ scenarioId: 'cogs-none' })).rows;
  expect(noCogsRows.length > 0 && noCogsRows.every((row) => row.currentCogsMinor === null && row.knownNetProfitMinor === null && row.cogsStatus === 'missing' && row.profitabilityStatus === 'incomplete'), 'Missing COGS must remain null and profitability incomplete for every affected Product');
  expect(!noCogsRows.some((row) => row.profitabilityStatus === 'profitable' || row.profitabilityStatus === 'loss_making' || row.profitabilityStatus === 'low_margin'), 'Incomplete Products must not enter normal profit rankings');
  const noCogsProduct = noCogsRows.find((row) => row.revenueMinor > 0) ?? noCogsRows[0];
  const noCogsTransactions = products.aggregateProductTransactions(dataset, { ...noCogsInput, productId: noCogsProduct.id }, 25);
  expect(noCogsTransactions.rows.every((row) => row.cogsMinor === null && row.netProfitMinor === null && !row.profitabilityComplete), 'Missing-COGS transaction previews must show incomplete profitability, never positive profit');
  const noCogsProfit = products.aggregateProductProfitability(dataset, { ...noCogsInput, productId: noCogsProduct.id });
  equal(noCogsProfit.roiBps, null, 'ROI must be unavailable when Product COGS is incomplete');

  const partialInput = { ...baseInput, scenarioId: 'partial-cogs' };
  const partialProducts = rowsFor(queryFor({ scenarioId: 'partial-cogs' }));
  expect(partialProducts.rows.some((row) => row.cogsStatus === 'partial_history'), 'Partial COGS scenario must expose a Partial History product');
  expect(partialProducts.rows.filter((row) => row.profitabilityStatus === 'loss_making').every((row) => row.profitabilityCoverageBps === 10_000), 'Only cost-complete products may be labelled loss-making');
  equal(partialProducts.first.summary.cogsCoverageBps, Math.round((partialProducts.rows.filter((row) => row.cogsStatus === 'complete').length * 10_000) / partialProducts.rows.length), 'Partial scenario must keep product-count COGS coverage separate');
  const partialDashboard = dashboard.aggregateDashboardAnalytics(dataset, partialInput);
  equal(partialProducts.first.summary.profitabilityCoverageBps, partialDashboard.current.profitabilityCoverageBps, 'Partial scenario profitability coverage must remain revenue weighted');
  expect(partialProducts.first.summary.cogsCoverageBps !== partialProducts.first.summary.profitabilityCoverageBps, 'Product-count COGS coverage and revenue-weighted profitability coverage must not collapse into one metric');

  const restrictedCompany = data.companies[0];
  const restrictedAccounts = data.marketplaceAccounts.filter((candidate) => candidate.companyId === restrictedCompany.id);
  const outsideProduct = dataset.products.find((product) => product.ownerCompanyId !== restrictedCompany.id);
  const restrictedInput = {
    ...baseInput,
    authorisedCompanyIds: [restrictedCompany.id],
    authorisedAccountIds: restrictedAccounts.map((candidate) => candidate.id),
  };
  const restrictedQuery = queryFor(restrictedInput);
  const restrictedRows = rowsFor(restrictedQuery).rows;
  const restrictedExports = products.aggregateProductExportRows(dataset, restrictedQuery);
  expect(restrictedRows.length > 0, 'Restricted Company assignment must retain its own Products');
  expect(restrictedRows.every((row) => row.product.ownerCompanyId === restrictedCompany.id
    && row.listings.every((listing) => listing.companyId === restrictedCompany.id
      && accountById.get(listing.marketplaceAccountId)?.companyId === restrictedCompany.id)), 'Company/account assignment filtering must expose only Products and Listings owned by that Company');
  expect(restrictedExports.every((row) => row.ownerCompanyId === restrictedCompany.id), 'Restricted Product export must not expose another Company Product');
  if (outsideProduct) {
    expect(!restrictedRows.some((row) => row.product.id === outsideProduct.id), 'Restricted Product list must not expose another Company Product');
    const restrictedSearchRows = rowsFor(queryFor({ ...restrictedInput, search: outsideProduct.internalSku })).rows;
    expect(!restrictedSearchRows.some((row) => row.product.id === outsideProduct.id), 'Restricted Product search must not expose another Company Product');
    const result = products.aggregateProductOverview(dataset, { ...restrictedInput, productId: outsideProduct.id });
    equal(result.status, 'assignment_denied', 'Direct Product URL outside assignment must return assignment_denied without Product data');
  }
  if (sourceListing && listingProduct && foreignAccount) {
    const crossedAssignmentDataset = {
      ...dataset,
      listings: dataset.listings.map((listing) => listing.id === sourceListing.id
        ? { ...listing, marketplaceAccountId: foreignAccount.id, marketplace: foreignAccount.marketplace }
        : listing),
    };
    const crossedAssignmentQuery = queryFor({
      authorisedCompanyIds: [listingProduct.ownerCompanyId],
      authorisedAccountIds: [foreignAccount.id],
    });
    equal(products.aggregateProductPage(crossedAssignmentDataset, { ...crossedAssignmentQuery, page: 0, pageSize: 100 }).total, 0, 'A foreign-account Listing must not make its Product visible through company/account filtering');
    equal(products.aggregateProductExportRows(crossedAssignmentDataset, crossedAssignmentQuery).length, 0, 'A foreign-account Listing must not expose its Product through export');
    equal(products.aggregateProductOverview(crossedAssignmentDataset, { ...crossedAssignmentQuery, productId: listingProduct.id }).status, 'assignment_denied', 'A foreign-account Listing must not expose its Product through direct lookup');
  }
  equal(products.aggregateProductOverview(dataset, { ...baseInput, productId: 'unknown-product-id' }).status, 'not_found', 'Unknown Product ID must return a clean not_found result');

  const activity = products.aggregateProductActivity(dataset, detailQuery);
  const costEvent = activity.events.find((event) => event.action === 'cogs_changed');
  expect(Boolean(costEvent?.previousValue) && Boolean(costEvent?.newValue) && Boolean(costEvent?.actor) && Boolean(costEvent?.timestamp) && Boolean(costEvent?.reason), 'COGS Activity must expose previous/new value, actor, timestamp and reason');

  const view = {
    id: 'view-cost-review',
    name: 'Weekly cost review',
    builtIn: false,
    configuration: {
      search: 'gloves',
      filters: { cogsStatus: 'missing', listingStatus: 'active', profitabilityStatus: 'incomplete', category: 'PPE & Safety' },
      sorting: [{ id: 'netProfit', desc: false }],
      columnVisibility: { marketplaceSku: true, account: true, margin: false },
      pageSize: 50,
      marketplace: 'amazon',
    },
  };
  const restored = savedViews.decodePersonalProductViews(savedViews.encodePersonalProductViews([view]));
  expect(JSON.stringify(restored[0]) === JSON.stringify(view), 'Saved Product view must restore search, filters, sorting, columns, page size and marketplace');
  equal(savedViews.decodePersonalProductViews('{invalid').length, 0, 'Invalid saved-view storage must fail safely');

  const keyA = queryKeys.products.list({ context: baseContext, scenarioId: 'healthy', realmKey: 'admin:healthy', authorisedCompanyIds: baseInput.authorisedCompanyIds, authorisedAccountIds: baseInput.authorisedAccountIds, search: '', cogsStatus: 'all', listingStatus: 'all', profitabilityStatus: 'all', categories: [], sorting: [], page: 0, pageSize: 25 });
  const keyB = queryKeys.products.list({ context: { ...baseContext, marketplace: 'amazon' }, scenarioId: 'healthy', realmKey: 'admin:healthy', authorisedCompanyIds: baseInput.authorisedCompanyIds, authorisedAccountIds: baseInput.authorisedAccountIds, search: '', cogsStatus: 'all', listingStatus: 'all', profitabilityStatus: 'all', categories: [], sorting: [], page: 0, pageSize: 25 });
  expect(JSON.stringify(keyA) !== JSON.stringify(keyB), 'Product query keys must vary with analytical marketplace context');

  if (failures.length) {
    console.error(`Phase 4 Product validation failed (${failures.length}):`);
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exitCode = 1;
  } else {
    console.log(`Phase 4 Product validation passed: ${dataset.products.length} company-owned internal products, ${dataset.listings.length} ownership-safe listings, company-scoped SKU uniqueness, assignment isolation, wide-grid reachability, Dashboard reconciliation, historical COGS, RBAC, saved views and incomplete-profit semantics.`);
  }
} catch (error) {
  console.error('Phase 4 Product validator could not execute.');
  console.error(error);
  process.exitCode = 1;
}
