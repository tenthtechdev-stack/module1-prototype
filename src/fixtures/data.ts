import { deriveProfitability } from '@/src/domain/calculations';
import type { Company, MarketplaceAccount, Organisation, ProductListItem, ProductPerformance, Transaction } from '@/src/domain/models';

export const organisation: Organisation = {
  id: 'org-stock-supplies',
  slug: 'stock-supplies',
  name: 'Stock Supplies',
  reportingCurrency: 'GBP',
  timeZone: 'Europe/London',
};

export const companies: Company[] = [
  { id: 'cmp-stock', organisationId: organisation.id, name: 'Stock Supplies Ltd' },
  { id: 'cmp-hygiene', organisationId: organisation.id, name: 'Hygiene Direct Ltd' },
  { id: 'cmp-packaging', organisationId: organisation.id, name: 'Packaging Essentials Ltd' },
];

export const marketplaceAccounts: MarketplaceAccount[] = [
  { id: 'acct-amazon-uk', companyId: 'cmp-stock', marketplace: 'amazon', displayName: 'Stock Supplies UK', status: 'connected', lastSuccessfulSyncAt: '2026-08-27T18:49:00Z' },
  { id: 'acct-ebay-main', companyId: 'cmp-stock', marketplace: 'ebay', displayName: 'Stock Supplies eBay', status: 'connected', lastSuccessfulSyncAt: '2026-08-27T18:42:00Z' },
  { id: 'acct-amazon-hygiene', companyId: 'cmp-hygiene', marketplace: 'amazon', displayName: 'Hygiene Direct Amazon', status: 'connected', lastSuccessfulSyncAt: '2026-08-27T18:46:00Z' },
  { id: 'acct-temu-hygiene', companyId: 'cmp-hygiene', marketplace: 'temu', displayName: 'Hygiene Direct Temu', status: 'connected', lastSuccessfulSyncAt: '2026-08-27T18:28:00Z' },
  { id: 'acct-ebay-packaging', companyId: 'cmp-packaging', marketplace: 'ebay', displayName: 'Packaging Essentials eBay', status: 'connected', lastSuccessfulSyncAt: '2026-08-27T18:41:00Z' },
  { id: 'acct-temu-packaging', companyId: 'cmp-packaging', marketplace: 'temu', displayName: 'Packaging Essentials Temu', status: 'connected', lastSuccessfulSyncAt: '2026-08-27T18:33:00Z' },
];

const names = [
  'Blue Nitrile Gloves XL', 'Heavy Duty Refuse Sacks 120L', 'Microfibre Cleaning Cloths',
  'C-Fold Hand Towels', 'Industrial Floor Cleaner', 'Packing Tape 48mm', 'Bubble Wrap Rolls',
  'Safety Glasses', 'Disposable Aprons', 'Black Nitrile Gloves Large', 'Centre Feed Blue Roll',
  'Compostable Bin Liners', 'Foaming Hand Soap', 'Kitchen Degreaser', 'Stretch Film 400mm',
  'Cardboard Postal Boxes', 'Pallet Wrap Clear', 'Disposable Face Masks', 'Floor Warning Signs',
  'Recycled Paper Towels',
];

function productFor(index: number): ProductPerformance {
  const baseName = names[index % names.length];
  const company = companies[index % companies.length];
  const companyAccounts = marketplaceAccounts.filter((account) => account.companyId === company.id);
  const account = companyAccounts[index % companyAccounts.length];
  const grossRevenuePence = 285_000 + ((index * 173_291) % 2_250_000);
  const refundsPence = Math.round(grossRevenuePence * (0.018 + (index % 5) * 0.006));
  const cogsPence = Math.round(grossRevenuePence * (0.31 + (index % 7) * 0.012));
  const marketplaceFeesPence = Math.round(grossRevenuePence * (0.105 + (index % 3) * 0.008));
  const advertisingPence = Math.round(grossRevenuePence * (0.035 + (index % 4) * 0.006));
  const shippingPence = Math.round(grossRevenuePence * 0.054);
  const otherDirectCostsPence = Math.round(grossRevenuePence * 0.012);
  const allocatedExpensesPence = Math.round(grossRevenuePence * 0.028);
  return {
    id: `prd-${String(index + 1).padStart(4, '0')}`,
    companyId: company.id,
    marketplaceAccountIds: [account.id],
    marketplaces: [account.marketplace],
    sku: `${baseName.split(' ').map((part) => part[0]).join('').slice(0, 5).toUpperCase()}-${String(index + 1).padStart(3, '0')}`,
    name: index < names.length ? baseName : `${baseName} · ${['Case', 'Trade Pack', 'Bulk', 'Eco'][Math.floor(index / names.length) % 4]}`,
    grossRevenuePence,
    refundsPence,
    cogsPence,
    marketplaceFeesPence,
    advertisingPence,
    shippingPence,
    otherDirectCostsPence,
    allocatedExpensesPence,
    priorProfitPence: Math.round(grossRevenuePence * (0.13 + (index % 5) * 0.01)),
  };
}

export const baseProducts: ProductPerformance[] = Array.from({ length: 100 }, (_, index) => productFor(index));

export function materializeProduct(product: ProductPerformance, cogsMissing: boolean): ProductListItem {
  const adjusted = { ...product, cogsPence: cogsMissing ? null : product.cogsPence };
  const profitability = deriveProfitability(adjusted);
  const deltaBps = profitability.netProfitPence === null || product.priorProfitPence === null || product.priorProfitPence === 0
    ? null
    : Math.round(((profitability.netProfitPence - product.priorProfitPence) * 10_000) / product.priorProfitPence);
  return {
    ...adjusted,
    netRevenuePence: profitability.netRevenuePence,
    netProfitPence: profitability.netProfitPence,
    marginBps: profitability.marginBps,
    deltaBps,
    cogsStatus: profitability.status === 'complete' ? 'complete' : 'missing',
  };
}

export const transactions: Transaction[] = Array.from({ length: 2_700 }, (_, index) => {
  const product = baseProducts[index % baseProducts.length];
  const dayOffset = index % 94;
  const grossRevenuePence = 2_400 + ((index * 7919) % 42_000);
  return {
    id: `txn-${String(index + 1).padStart(6, '0')}`,
    companyId: product.companyId,
    marketplaceAccountId: product.marketplaceAccountIds[0],
    productId: product.id,
    occurredAt: new Date(Date.UTC(2026, 7, 27 - dayOffset, 9 + (index % 12), index % 60)).toISOString(),
    quantity: 1 + (index % 5),
    grossRevenuePence,
    refundsPence: index % 17 === 0 ? Math.round(grossRevenuePence * 0.35) : 0,
    cogsPence: Math.round(grossRevenuePence * 0.34),
    marketplaceFeesPence: Math.round(grossRevenuePence * 0.12),
    advertisingPence: Math.round(grossRevenuePence * 0.04),
    shippingPence: Math.round(grossRevenuePence * 0.055),
    otherDirectCostsPence: Math.round(grossRevenuePence * 0.01),
    allocatedExpensesPence: Math.round(grossRevenuePence * 0.025),
  };
});
