import type { AnalyticsDataset, AnalyticsListing, AnalyticsProduct, CurrencyCode, HistoricalCogsRate, ProfitabilityRecord } from '@/src/domain/analytics';
import type { Company, Expense, MarketplaceAccount, Organisation } from '@/src/domain/models';
import { normaliseMinor, resolveHistoricalUnitCogs, shiftIsoDate } from '@/src/domain/financial-calculations';

export const ANALYTICS_RANGE = { from: '2026-02-01', to: '2026-08-27' } as const;
export const VISIBLE_PRODUCT_CATALOGUE_SIZE = 180;

const PRODUCT_NAMES = [
  'Blue Nitrile Gloves XL',
  'Heavy Duty Refuse Sacks 120L',
  'Microfibre Cleaning Cloths',
  'C-Fold Hand Towels',
  'Industrial Floor Cleaner 5L',
  'Packing Tape 48mm',
  'Bubble Wrap Rolls',
  'Safety Glasses',
  'Disposable Aprons',
  'Black Nitrile Gloves Large',
  'Centre Feed Blue Roll',
  'Compostable Bin Liners',
  'Foaming Hand Soap',
  'Kitchen Degreaser',
  'Stretch Film 400mm',
  'Cardboard Postal Boxes',
  'Pallet Wrap Clear',
  'Recycled Paper Towels',
] as const;

const PRODUCT_CATEGORIES = ['Cleaning & Hygiene', 'Packaging', 'PPE & Safety', 'Paper Products', 'Warehouse Supplies', 'Janitorial Chemicals'] as const;
const PRODUCT_BRANDS = ['StockPro', 'ProServe', 'Northline', 'EcoTrade', 'WorkGuard'] as const;

export function stableHash(value: string) {
  let result = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16_777_619);
  }
  return result >>> 0;
}

function isoDates(from: string, to: string) {
  const values: string[] = [];
  for (let value = from; value <= to; value = shiftIsoDate(value, 1)) values.push(value);
  return values;
}

function sourceCurrencyFor(account: MarketplaceAccount): { currency: CurrencyCode; rateBps: number } {
  if (account.marketplace === 'temu') return { currency: 'EUR', rateBps: 8_600 };
  return { currency: 'GBP', rateBps: 10_000 };
}

function productSku(name: string, companyIndex: number, productIndex: number) {
  const prefix = name.split(' ').map((word) => word[0]).join('').slice(0, 5).toUpperCase();
  return `${prefix}-${companyIndex + 1}${String(productIndex + 1).padStart(3, '0')}`;
}

function productName(index: number) {
  const base = PRODUCT_NAMES[index % PRODUCT_NAMES.length];
  if (index < PRODUCT_NAMES.length) return base;
  return `${base} · ${['Trade Pack', 'Case', 'Eco', 'Bulk'][Math.floor(index / PRODUCT_NAMES.length) % 4]}`;
}

function productThumbnail(name: string, seed: number) {
  const palette = ['#234c72', '#1f6b5c', '#7a4e21', '#5d477a', '#735e24'];
  const initials = name.split(' ').slice(0, 2).map((word) => word[0]).join('').toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="${palette[seed % palette.length]}"/><path d="M14 20h36v30H14z" fill="white" opacity=".16"/><text x="32" y="39" text-anchor="middle" font-family="Arial,sans-serif" font-size="17" font-weight="700" fill="white">${initials}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function listingIdentity(product: AnalyticsProduct, account: MarketplaceAccount, seed: number) {
  const numeric = String(100_000_000 + (stableHash(`${product.id}:${account.id}`) % 899_999_999));
  const asin = account.marketplace === 'amazon' ? `B0${stableHash(product.id).toString(36).toUpperCase().padStart(8, '0').slice(-8)}` : undefined;
  const ebayItemId = account.marketplace === 'ebay' ? numeric.padStart(12, '1').slice(-12) : undefined;
  const temuListingId = account.marketplace === 'temu' ? `TM-${numeric}` : undefined;
  const statusSignal = stableHash(`listing-status:${product.id}:${account.id}`) % 29;
  const listingStatus = statusSignal === 0 ? 'suppressed' as const
    : statusSignal === 1 ? 'issue' as const
      : statusSignal === 2 ? 'inactive' as const
        : statusSignal === 3 ? 'ended' as const
          : 'active' as const;
  const currentCost = cogsRates(product, seed).at(-1)?.unitCostMinor ?? 500;
  const reportingPrice = Math.round(currentCost * (1.82 + (seed % 6) * 0.06));
  const isTemu = account.marketplace === 'temu';
  const priceMinor = isTemu ? Math.round(reportingPrice / 0.86) : reportingPrice;
  return {
    marketplaceSku: `${product.internalSku}-${account.marketplace === 'amazon' ? 'AMZ' : account.marketplace === 'ebay' ? 'EB' : 'TM'}`,
    marketplaceProductId: asin ?? ebayItemId ?? temuListingId,
    asin,
    ean: `50${numeric.padStart(11, '0').slice(-11)}`,
    ebayItemId,
    temuListingId,
    title: `${product.title}${account.marketplace === 'amazon' ? ' | Business Pack' : account.marketplace === 'ebay' ? ' - UK Stock' : ' Value Pack'}`,
    price: { amountMinor: priceMinor, currency: isTemu ? 'EUR' : 'GBP' },
    listingStatus,
    fulfilmentType: account.marketplace === 'amazon' ? (seed % 3 === 0 ? 'MFN' : 'FBA') : account.marketplace === 'ebay' ? 'Seller fulfilled' : 'Marketplace fulfilment',
    lastSyncedAt: account.lastSuccessfulSyncAt ?? undefined,
    issue: listingStatus === 'suppressed' ? 'listing_suppressed' as const : listingStatus === 'issue' ? 'price_unavailable' as const : undefined,
    sourceReference: `${account.marketplace}:${asin ?? ebayItemId ?? temuListingId}`,
  };
}

function cogsRates(product: AnalyticsProduct, productIndex: number): HistoricalCogsRate[] {
  const isReferenceProduct = product.name === 'Blue Nitrile Gloves XL';
  const base = isReferenceProduct ? 650 : 260 + (stableHash(product.id) % 1_540);
  const april = isReferenceProduct ? 690 : base + 18 + (productIndex % 5) * 7;
  const august = isReferenceProduct ? 720 : april + 21 + (productIndex % 7) * 6;
  return [
    { id: `${product.id}:cogs-1`, productId: product.id, unitCostMinor: base, currency: 'GBP', effectiveFrom: '2026-01-01', effectiveTo: '2026-04-01' },
    { id: `${product.id}:cogs-2`, productId: product.id, unitCostMinor: april, currency: 'GBP', effectiveFrom: '2026-04-01', effectiveTo: '2026-08-01' },
    { id: `${product.id}:cogs-3`, productId: product.id, unitCostMinor: august, currency: 'GBP', effectiveFrom: '2026-08-01', effectiveTo: null },
  ];
}

function createProductsAndListings(
  organisation: Organisation,
  companies: Company[],
  accounts: MarketplaceAccount[],
) {
  const products: AnalyticsProduct[] = [];
  const listings: AnalyticsListing[] = [];
  const cogsHistory: HistoricalCogsRate[] = [];
  const activeCompanies = companies.filter((company) => accounts.some((account) => account.companyId === company.id));
  const perCompany = Math.floor(VISIBLE_PRODUCT_CATALOGUE_SIZE / Math.max(1, activeCompanies.length));
  const remainder = VISIBLE_PRODUCT_CATALOGUE_SIZE % Math.max(1, activeCompanies.length);

  companies.forEach((company, companyIndex) => {
    const companyAccounts = accounts.filter((account) => account.companyId === company.id);
    const activeIndex = activeCompanies.findIndex((candidate) => candidate.id === company.id);
    const productCount = companyAccounts.length ? perCompany + (activeIndex >= 0 && activeIndex < remainder ? 1 : 0) : 0;
    for (let productIndex = 0; productIndex < productCount; productIndex += 1) {
      const name = productName(productIndex);
      const internalSku = productSku(name, companyIndex, productIndex);
      const product: AnalyticsProduct = {
        id: `${organisation.id}:product-${companyIndex + 1}-${String(productIndex + 1).padStart(3, '0')}`,
        organisationId: organisation.id,
        ownerCompanyId: company.id,
        internalSku,
        title: name,
        imageUrl: productThumbnail(name, productIndex + companyIndex),
        category: PRODUCT_CATEGORIES[(productIndex + companyIndex) % PRODUCT_CATEGORIES.length],
        brand: PRODUCT_BRANDS[(productIndex * 3 + companyIndex) % PRODUCT_BRANDS.length],
        status: productIndex % 41 === 0 ? 'archived' : productIndex % 17 === 0 ? 'inactive' : 'active',
        createdAt: `2025-${String(1 + ((productIndex + companyIndex) % 12)).padStart(2, '0')}-${String(1 + (productIndex % 27)).padStart(2, '0')}T09:00:00.000Z`,
        updatedAt: `2026-08-${String(1 + ((productIndex * 3 + companyIndex) % 27)).padStart(2, '0')}T14:30:00.000Z`,
        // Locked Phase 1-3 aliases.
        companyId: company.id,
        sku: internalSku,
        name,
      };
      products.push(product);
      cogsHistory.push(...cogsRates(product, productIndex));

      companyAccounts.forEach((account, accountIndex) => {
        const primaryIndex = productIndex % companyAccounts.length;
        const present = productIndex % 15 === 0
          || accountIndex === primaryIndex
          || (productIndex % 5 === 0 && accountIndex === (primaryIndex + 1) % companyAccounts.length);
        if (!present) return;
        listings.push({
          id: `${product.id}:listing:${account.id}`,
          productId: product.id,
          companyId: company.id,
          marketplaceAccountId: account.id,
          marketplace: account.marketplace,
          ...listingIdentity(product, account, productIndex + accountIndex),
        });
      });
    }
  });
  return { products, listings, cogsHistory };
}

function createRecords(
  organisation: Organisation,
  products: AnalyticsProduct[],
  listings: AnalyticsListing[],
  cogsHistory: HistoricalCogsRate[],
  accounts: MarketplaceAccount[],
) {
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const productById = new Map(products.map((product) => [product.id, product]));
  const records: ProfitabilityRecord[] = [];
  const dates = isoDates(ANALYTICS_RANGE.from, ANALYTICS_RANGE.to);

  listings.forEach((listing, listingIndex) => {
    const account = accountById.get(listing.marketplaceAccountId);
    const product = productById.get(listing.productId);
    if (!account || !product) return;
    const { currency, rateBps } = sourceCurrencyFor(account);
    const cadence = 2 + (stableHash(listing.id) % 4);
    const isLossLeader = product.name.startsWith('Industrial Floor Cleaner');
    const isLowMargin = product.name.startsWith('Packing Tape');
    const isDormantLate = product.name.startsWith('Recycled Paper Towels');

    dates.forEach((occurredOn, dayIndex) => {
      if ((dayIndex + listingIndex * 3) % cadence !== 0) return;
      if (isDormantLate && dayIndex > 150) return;
      const unitCogsGbp = resolveHistoricalUnitCogs(cogsHistory, product.id, occurredOn);
      if (unitCogsGbp === null) return;
      const signal = stableHash(`${listing.id}:${occurredOn}`);
      const orders = 1 + (signal % 7);
      const units = orders + ((signal >>> 3) % Math.max(2, Math.ceil(orders / 2)));
      // Keep one deterministic catalogue family in the 0–10% margin band so
      // Products can demonstrate low-margin review separately from loss.
      const markupBps = isLossLeader ? 13_400 : isLowMargin ? 19_000 : 18_000 + ((signal >>> 7) % 7_000);
      const priceGbpMinor = Math.max(unitCogsGbp + 90, Math.round((unitCogsGbp * markupBps) / 10_000));
      const unitPriceSource = Math.max(1, Math.round((priceGbpMinor * 10_000) / rateBps));
      const grossSalesMinor = unitPriceSource * units;
      const discountsMinor = signal % 9 === 0 ? Math.round(grossSalesMinor * 0.035) : signal % 17 === 0 ? Math.round(grossSalesMinor * 0.06) : 0;
      const refundHeavy = isLossLeader && signal % 3 === 0;
      const refundedOrders = refundHeavy ? Math.max(1, Math.ceil(orders / 2)) : signal % 19 === 0 ? 1 : 0;
      const refundsMinor = refundedOrders ? Math.round((grossSalesMinor * refundedOrders) / orders * (refundHeavy ? 0.82 : 0.68)) : 0;
      const referralRate = account.marketplace === 'amazon' ? 0.105 : account.marketplace === 'ebay' ? 0.118 : 0.09;
      const fulfilmentRate = account.marketplace === 'amazon' ? 0.045 : account.marketplace === 'temu' ? 0.028 : 0.012;
      const promotedRate = account.marketplace === 'ebay' ? 0.022 : 0;
      const advertisingRate = isLossLeader ? 0.34 : isLowMargin ? 0.12 : account.marketplace === 'amazon' ? 0.052 : account.marketplace === 'ebay' ? 0.031 : 0.018;
      const shippingRate = account.marketplace === 'amazon' ? 0.041 : 0.057;
      const cogsMinor = unitCogsGbp * units;
      const id = `${organisation.id}:financial:${String(listingIndex + 1).padStart(3, '0')}:${occurredOn}`;
      records.push({
        id,
        transactionId: id.replace(':financial:', ':transaction:'),
        occurredOn,
        organisationId: organisation.id,
        companyId: product.companyId,
        marketplace: account.marketplace,
        marketplaceAccountId: account.id,
        productId: product.id,
        listingId: listing.id,
        orders,
        refundedOrders,
        units,
        sourceCurrency: currency,
        reportingCurrency: 'GBP',
        sourceToReportingRateBps: rateBps,
        grossSalesMinor,
        discountsMinor,
        refundsMinor,
        cogsMinor,
        marketplaceFeeComponents: {
          referralMinor: Math.round(grossSalesMinor * referralRate),
          fulfilmentMinor: Math.round(grossSalesMinor * fulfilmentRate),
          storageMinor: account.marketplace === 'amazon' ? Math.round(grossSalesMinor * 0.006) : 0,
          promotedListingMinor: Math.round(grossSalesMinor * promotedRate),
          otherMinor: Math.round(grossSalesMinor * 0.004),
        },
        advertisingMinor: Math.round(grossSalesMinor * advertisingRate),
        advertisingDataState: 'complete',
        shippingMinor: Math.round(grossSalesMinor * shippingRate),
        otherDirectCostsMinor: Math.round(grossSalesMinor * (0.009 + ((signal >>> 11) % 5) / 1_000)),
      });
    });
  });
  return records;
}

function createExpenses(organisation: Organisation, companies: Company[], accounts: MarketplaceAccount[], products: AnalyticsProduct[]) {
  const expenses: Expense[] = [];
  const dates = isoDates(ANALYTICS_RANGE.from, ANALYTICS_RANGE.to);
  dates.forEach((occurredAt, dayIndex) => {
    if (dayIndex % 7 === 0) {
      expenses.push({
        id: `${organisation.id}:expense:org:${occurredAt}`,
        organisationId: organisation.id,
        scope: { type: 'organisation' },
        occurredAt,
        category: 'Commerce operations allocation',
        amountMinor: 18_000 + (dayIndex % 5) * 1_250,
        currency: 'GBP',
        sensitive: true,
      });
    }
    companies.forEach((company, companyIndex) => {
      if ((dayIndex + companyIndex) % 14 !== 0) return;
      expenses.push({
        id: `${organisation.id}:expense:${company.id}:${occurredAt}`,
        organisationId: organisation.id,
        scope: { type: 'company', companyId: company.id },
        occurredAt,
        category: 'Company fulfilment operations',
        amountMinor: 7_500 + companyIndex * 1_100,
        currency: 'GBP',
        sensitive: false,
      });
    });
    if (dayIndex % 30 === 3) {
      accounts.forEach((account, accountIndex) => {
        expenses.push({
          id: `${organisation.id}:expense:${account.id}:${occurredAt}`,
          organisationId: organisation.id,
          scope: { type: 'marketplace_account', marketplaceAccountId: account.id },
          occurredAt,
          category: 'Account tooling',
          amountMinor: 3_200 + accountIndex * 175,
          currency: 'GBP',
          sensitive: false,
        });
      });
    }
  });
  if (accounts.some((account) => account.marketplace === 'amazon')) expenses.push({
    id: `${organisation.id}:expense:amazon:one-off:2026-05-19`,
    organisationId: organisation.id,
    scope: { type: 'marketplace', marketplace: 'amazon' },
    occurredAt: '2026-05-19',
    category: 'One-off Amazon compliance review',
    amountMinor: 48_500,
    currency: 'GBP',
    sensitive: false,
  });
  if (products[0]) expenses.push({
    id: `${organisation.id}:expense:${products[0].id}:one-off:2026-07-11`,
    organisationId: organisation.id,
    scope: { type: 'product', productId: products[0].id },
    occurredAt: '2026-07-11',
    category: 'One-off product photography',
    amountMinor: 21_750,
    currency: 'GBP',
    sensitive: false,
  });
  return expenses;
}

export function generateAnalyticsDataset(input: {
  organisation: Organisation;
  companies: Company[];
  marketplaceAccounts: MarketplaceAccount[];
}): AnalyticsDataset {
  const { organisation, companies, marketplaceAccounts } = input;
  const structural = createProductsAndListings(organisation, companies, marketplaceAccounts);
  const records = createRecords(
    organisation,
    structural.products,
    structural.listings,
    structural.cogsHistory,
    marketplaceAccounts,
  );
  const expenses = createExpenses(organisation, companies, marketplaceAccounts, structural.products);
  // Read once here as an executable invariant: every source amount can be
  // normalised deterministically into the organisation reporting currency.
  records.forEach((record) => {
    void normaliseMinor(record.grossSalesMinor, record.sourceToReportingRateBps);
  });
  return { ...structural, records, expenses, generatedRange: { ...ANALYTICS_RANGE } };
}
