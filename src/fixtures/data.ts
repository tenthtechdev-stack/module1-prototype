import type {
  Company,
  MarketplaceAccount,
  ModuleEntitlement,
  Organisation,
  ProductPerformance,
  Subscription,
  Transaction,
  User,
} from '@/src/domain/models';

export const organisation: Organisation = {
  id: 'org-stock-supplies',
  slug: 'stock-supplies',
  name: 'Stock Supplies Group',
  reportingCurrency: 'GBP',
  timeZone: 'Europe/London',
};

export const companies: Company[] = [
  { id: 'cmp-stock', organisationId: organisation.id, name: 'Stock Supplies Ltd' },
  { id: 'cmp-proserve', organisationId: organisation.id, name: 'ProServe Packaging Ltd' },
  { id: 'cmp-northbridge', organisationId: organisation.id, name: 'Northbridge Trade Supplies Ltd' },
];

export const marketplaceAccounts: MarketplaceAccount[] = [
  { id: 'acct-stock-amazon', companyId: 'cmp-stock', marketplace: 'amazon', displayName: 'Stock Supplies Amazon UK', status: 'synced', lastSuccessfulSyncAt: '2026-08-27T18:49:00Z' },
  { id: 'acct-stock-ebay', companyId: 'cmp-stock', marketplace: 'ebay', displayName: 'Stock Supplies eBay UK', status: 'synced', lastSuccessfulSyncAt: '2026-08-27T18:42:00Z' },
  { id: 'acct-stock-temu', companyId: 'cmp-stock', marketplace: 'temu', displayName: 'Stock Supplies Temu UK', status: 'synced', lastSuccessfulSyncAt: '2026-08-27T18:36:00Z' },
  { id: 'acct-proserve-amazon', companyId: 'cmp-proserve', marketplace: 'amazon', displayName: 'ProServe Amazon UK', status: 'synced', lastSuccessfulSyncAt: '2026-08-27T18:46:00Z' },
  { id: 'acct-proserve-temu', companyId: 'cmp-proserve', marketplace: 'temu', displayName: 'ProServe Temu UK', status: 'synced', lastSuccessfulSyncAt: '2026-08-27T18:28:00Z' },
  { id: 'acct-northbridge-amazon', companyId: 'cmp-northbridge', marketplace: 'amazon', displayName: 'Northbridge Amazon UK', status: 'synced', lastSuccessfulSyncAt: '2026-08-27T18:41:00Z' },
];

export const subscription: Subscription = {
  id: 'sub-stock-supplies-test-plan',
  organisationId: organisation.id,
  status: 'active',
  planName: 'Test Plan',
  renewsAt: '2026-09-27',
};

export const moduleEntitlements: ModuleEntitlement[] = [
  { organisationId: organisation.id, moduleKey: 'marketplace-profitability', enabled: true },
];

export const users: User[] = [
  { id: 'usr-zara', organisationId: organisation.id, name: 'Zara Rahman', email: 'zara.rahman@stocksupplies.co.uk', jobTitle: 'Head of Commerce', roleId: 'admin', companyIds: 'all', marketplaceAccountIds: 'all' },
  { id: 'usr-elliot', organisationId: organisation.id, name: 'Elliot Carter', email: 'elliot.carter@stocksupplies.co.uk', jobTitle: 'Group Finance Manager', roleId: 'finance', companyIds: 'all', marketplaceAccountIds: 'all' },
  { id: 'usr-aisha', organisationId: organisation.id, name: 'Aisha Mahmood', email: 'aisha.mahmood@proserve.co.uk', jobTitle: 'Marketplace Manager', roleId: 'marketplace-manager', companyIds: ['cmp-proserve'], marketplaceAccountIds: ['acct-proserve-amazon', 'acct-proserve-temu'] },
  { id: 'usr-daniel', organisationId: organisation.id, name: 'Daniel Price', email: 'daniel.price@northbridge.co.uk', jobTitle: 'Purchasing Lead', roleId: 'cost-user', companyIds: ['cmp-northbridge'], marketplaceAccountIds: ['acct-northbridge-amazon'] },
  { id: 'usr-priya', organisationId: organisation.id, name: 'Priya Shah', email: 'priya.shah@stocksupplies.co.uk', jobTitle: 'Commercial Analyst', roleId: 'analyst', companyIds: 'all', marketplaceAccountIds: 'all' },
];

export interface WorkspaceFixture {
  organisation: Organisation;
  subscription: Subscription;
  moduleEntitlements: ModuleEntitlement[];
  companies: Company[];
  marketplaceAccounts: MarketplaceAccount[];
  users: User[];
}

const harbourHomewares: Organisation = {
  id: 'org-harbour-homewares',
  slug: 'harbour-homewares',
  name: 'Harbour Homewares Group',
  reportingCurrency: 'GBP',
  timeZone: 'Europe/London',
};

const harbourCompanies: Company[] = [
  { id: 'cmp-harbour-retail', organisationId: harbourHomewares.id, name: 'Harbour Homewares Retail Ltd' },
  { id: 'cmp-harbour-direct', organisationId: harbourHomewares.id, name: 'Harbour Direct Commerce Ltd' },
];

const harbourAccounts: MarketplaceAccount[] = [
  { id: 'acct-harbour-amazon', companyId: 'cmp-harbour-retail', marketplace: 'amazon', displayName: 'Harbour Homewares Amazon UK', status: 'synced', lastSuccessfulSyncAt: '2026-08-27T18:35:00Z' },
  { id: 'acct-harbour-ebay', companyId: 'cmp-harbour-direct', marketplace: 'ebay', displayName: 'Harbour Direct eBay UK', status: 'synced', lastSuccessfulSyncAt: '2026-08-27T18:31:00Z' },
];

const brightforgeTools: Organisation = {
  id: 'org-brightforge-tools',
  slug: 'brightforge-tools',
  name: 'Brightforge Tools Ltd',
  reportingCurrency: 'GBP',
  timeZone: 'Europe/London',
};

const brightforgeCompanies: Company[] = [
  { id: 'cmp-brightforge', organisationId: brightforgeTools.id, name: 'Brightforge Tools Ltd' },
];

const brightforgeAccounts: MarketplaceAccount[] = [
  { id: 'acct-brightforge-amazon', companyId: 'cmp-brightforge', marketplace: 'amazon', displayName: 'Brightforge Amazon UK', status: 'synced', lastSuccessfulSyncAt: '2026-08-27T18:22:00Z' },
  { id: 'acct-brightforge-temu', companyId: 'cmp-brightforge', marketplace: 'temu', displayName: 'Brightforge Temu UK', status: 'synced', lastSuccessfulSyncAt: '2026-08-27T18:18:00Z' },
];

export const workspaceFixtures: readonly WorkspaceFixture[] = [
  {
    organisation,
    subscription,
    moduleEntitlements,
    companies,
    marketplaceAccounts,
    users,
  },
  {
    organisation: harbourHomewares,
    subscription: {
      id: 'sub-harbour-homewares-test-plan',
      organisationId: harbourHomewares.id,
      status: 'active',
      planName: 'Test Plan',
      renewsAt: '2026-10-04',
    },
    moduleEntitlements: [
      { organisationId: harbourHomewares.id, moduleKey: 'marketplace-profitability', enabled: true },
    ],
    companies: harbourCompanies,
    marketplaceAccounts: harbourAccounts,
    users: [
      { id: 'usr-harbour-nadia', organisationId: harbourHomewares.id, name: 'Nadia Clarke', email: 'nadia.clarke@harbourhomewares.co.uk', jobTitle: 'Commerce Director', roleId: 'admin', companyIds: 'all', marketplaceAccountIds: 'all' },
    ],
  },
  {
    organisation: brightforgeTools,
    subscription: {
      id: 'sub-brightforge-tools-test-plan',
      organisationId: brightforgeTools.id,
      status: 'active',
      planName: 'Test Plan',
      renewsAt: '2026-09-30',
    },
    moduleEntitlements: [
      { organisationId: brightforgeTools.id, moduleKey: 'marketplace-profitability', enabled: true },
    ],
    companies: brightforgeCompanies,
    marketplaceAccounts: brightforgeAccounts,
    users: [
      { id: 'usr-brightforge-owen', organisationId: brightforgeTools.id, name: 'Owen Mercer', email: 'owen.mercer@brightforgetools.co.uk', jobTitle: 'Managing Director', roleId: 'admin', companyIds: 'all', marketplaceAccountIds: 'all' },
    ],
  },
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
  const sku = `${baseName.split(' ').map((part) => part[0]).join('').slice(0, 5).toUpperCase()}-${String(index + 1).padStart(3, '0')}`;
  const name = index < names.length ? baseName : `${baseName} · ${['Case', 'Trade Pack', 'Bulk', 'Eco'][Math.floor(index / names.length) % 4]}`;
  return {
    id: `prd-${String(index + 1).padStart(4, '0')}`,
    organisationId: organisation.id,
    ownerCompanyId: company.id,
    internalSku: sku,
    title: name,
    category: ['Cleaning', 'PPE', 'Packaging', 'Paper Hygiene'][index % 4],
    brand: ['StockPro', 'ProServe', 'WorkGuard'][index % 3],
    status: index % 19 === 0 ? 'inactive' : 'active',
    createdAt: '2025-01-15T09:00:00.000Z',
    updatedAt: '2026-08-27T14:30:00.000Z',
    companyId: company.id,
    marketplaceAccountIds: [account.id],
    marketplaces: [account.marketplace],
    sku,
    name,
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

export const transactions: Transaction[] = Array.from({ length: 60 }, (_, index) => {
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
