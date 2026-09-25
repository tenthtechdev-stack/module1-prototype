import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

function pathFor(file) {
  return resolve(root, file);
}

function read(file) {
  const absolutePath = pathFor(file);
  if (!existsSync(absolutePath)) {
    failures.push(`missing file: ${file}`);
    return '';
  }
  return readFileSync(absolutePath, 'utf8');
}

function expect(condition, message) {
  if (!condition) failures.push(message);
}

function expectContains(file, needles) {
  const contents = read(file);
  for (const needle of needles) {
    expect(contents.includes(needle), `${file} missing contract: ${needle}`);
  }
}

async function loadTypeScriptModule(file) {
  const output = ts.transpileModule(read(file), {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: file,
  }).outputText;
  const encoded = Buffer.from(output).toString('base64');
  return import(`data:text/javascript;base64,${encoded}`);
}

function sourceFiles(directory) {
  const absoluteDirectory = pathFor(directory);
  if (!existsSync(absoluteDirectory)) {
    failures.push(`missing directory: ${directory}`);
    return [];
  }

  return readdirSync(absoluteDirectory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = resolve(absoluteDirectory, entry.name);
    if (entry.isDirectory()) return sourceFiles(relative(root, entryPath));
    return ['.ts', '.tsx', '.js', '.jsx', '.mjs'].includes(extname(entry.name)) ? [entryPath] : [];
  });
}

const routeFiles = [
  'app/auth/sign-in/page.tsx',
  'app/auth/register/page.tsx',
  'app/auth/forgot-password/page.tsx',
  'app/auth/invite/[token]/page.tsx',
  'app/onboarding/subscription/page.tsx',
  'app/onboarding/payment/page.tsx',
  'app/onboarding/organisation/page.tsx',
  'app/onboarding/companies/page.tsx',
  'app/onboarding/marketplaces/page.tsx',
  'app/onboarding/sync/page.tsx',
  'app/onboarding/cogs/page.tsx',
  'app/onboarding/users/page.tsx',
  'app/onboarding/complete/page.tsx',
  'app/o/[orgSlug]/dashboard/page.tsx',
  'app/o/[orgSlug]/products/page.tsx',
  'app/o/[orgSlug]/products/[productId]/page.tsx',
  'app/o/[orgSlug]/transactions/page.tsx',
  'app/o/[orgSlug]/transactions/[transactionId]/page.tsx',
  'app/o/[orgSlug]/cogs/page.tsx',
  'app/o/[orgSlug]/cogs/import/page.tsx',
  'app/o/[orgSlug]/cogs/import/[importId]/page.tsx',
  'app/o/[orgSlug]/expenses/page.tsx',
  'app/o/[orgSlug]/reports/pnl/page.tsx',
  'app/o/[orgSlug]/reports/products/page.tsx',
  'app/o/[orgSlug]/reports/marketplaces/page.tsx',
  'app/o/[orgSlug]/reports/fees/page.tsx',
  'app/o/[orgSlug]/reports/refunds/page.tsx',
  'app/o/[orgSlug]/reports/expenses/page.tsx',
  'app/o/[orgSlug]/operations/attention/page.tsx',
  'app/o/[orgSlug]/operations/sync-health/page.tsx',
  'app/o/[orgSlug]/admin/companies/page.tsx',
  'app/o/[orgSlug]/admin/marketplace-accounts/page.tsx',
  'app/o/[orgSlug]/admin/users/page.tsx',
  'app/o/[orgSlug]/admin/roles/page.tsx',
  'app/o/[orgSlug]/admin/billing/page.tsx',
  'app/o/[orgSlug]/admin/audit/page.tsx',
  'app/platform/dashboard/page.tsx',
  'app/platform/organisations/page.tsx',
  'app/platform/organisations/[organisationId]/page.tsx',
  'app/platform/integrations/page.tsx',
  'app/platform/ai-usage/page.tsx',
  'app/platform/audit/page.tsx',
];

for (const file of routeFiles) {
  expect(existsSync(pathFor(file)), `missing route: ${file}`);
}

// The local prototype must remain a standard Next.js app suitable for localhost and Vercel.
const packageJson = JSON.parse(read('package.json') || '{}');
const expectedScripts = {
  dev: 'next dev',
  build: 'next build',
  start: 'next start',
};
for (const [name, command] of Object.entries(expectedScripts)) {
  expect(packageJson.scripts?.[name] === command, `package.json script "${name}" must be "${command}"`);
}
expect(Boolean(packageJson.dependencies?.next), 'package.json must depend on next');
for (const dependency of ['@radix-ui/react-dropdown-menu', '@radix-ui/react-popover']) {
  expect(Boolean(packageJson.dependencies?.[dependency]), `package.json must depend on ${dependency} for accessible shared overlays`);
}
const installedPackages = {
  ...packageJson.dependencies,
  ...packageJson.devDependencies,
};
for (const dependency of ['vinext', '@openai/apps-sdk-ui', '@cloudflare/workers-types']) {
  expect(!(dependency in installedPackages), `package.json must not depend on ${dependency}`);
}
expectContains('postcss.config.mjs', ['@tailwindcss/postcss', 'export default config']);
for (const obsoleteFile of ['vite.config.ts', 'vite.config.js', 'vite.config.mjs', '.openai/hosting.json']) {
  expect(!existsSync(pathFor(obsoleteFile)), `obsolete hosting/build file must be absent: ${obsoleteFile}`);
}

// Keep the role catalogue exact so role previews cannot drift from the product brief.
const expectedRoleLabels = [
  'Organisation Admin',
  'Company Manager',
  'Finance / Accounts',
  'Marketplace Manager',
  'Purchasing / Cost User',
  'Analyst / Management Viewer',
  'Auditor / Read Only',
  'Platform Super Admin',
];
const permissionsSource = read('src/domain/permissions.ts');
const rolePresetSource = permissionsSource.slice(
  permissionsSource.indexOf('export const ROLE_PRESETS'),
  permissionsSource.indexOf('export const CAPABILITY_REQUIRED_MODULE'),
);
const actualRoleLabels = [...rolePresetSource.matchAll(/label:\s*'([^']+)'/g)].map((match) => match[1]);
expect(
  JSON.stringify(actualRoleLabels) === JSON.stringify(expectedRoleLabels),
  `src/domain/permissions.ts must define exactly these eight roles in order: ${expectedRoleLabels.join(', ')}`,
);
expectContains('src/domain/permissions.ts', [
  'export interface AssignmentScope',
  'export const PREVIEW_ASSIGNMENTS',
  'export const CAPABILITY_REQUIRED_MODULE',
  'Partial<Record<Capability, ModuleEntitlementKey>>',
  "'copilot.use': 'marketplace-profitability'",
  'subscription_restricted',
  'module_not_entitled',
  'capability_missing',
  'assignment_out_of_scope',
]);

const moduleOneCapabilities = [
  'profitability.view',
  'products.view',
  'transactions.view',
  'cogs.view',
  'cogs.edit',
  'cogs.import',
  'cogs.approve',
  'expenses.view',
  'expenses.view_sensitive',
  'expenses.edit',
  'reports.view',
  'sync.view',
  'sync.retry',
  'copilot.use',
];
for (const capability of moduleOneCapabilities) {
  expect(
    permissionsSource.includes(`'${capability}': 'marketplace-profitability'`),
    `Module 01 capability must require marketplace-profitability: ${capability}`,
  );
}
expect(
  !permissionsSource.includes("entitlements.add('platform')"),
  'platform access must not be implemented as a customer module entitlement',
);

const requiredScenarios = [
  ['healthy', 'Healthy Business'],
  ['first-sync', 'First Marketplace Sync'],
  ['no-marketplace', 'No Marketplace Connected'],
  ['cogs-none', 'COGS 0% Complete'],
  ['partial-cogs', 'Partial COGS Coverage'],
  ['amazon-delayed', 'Amazon Sync Delayed'],
  ['ebay-auth-failed', 'eBay Authentication Failed'],
  ['temu-import-running', 'Temu Historical Import Running'],
  ['past-due', 'Past Due Subscription'],
  ['module-unavailable', 'Module Entitlement Disabled'],
  ['cogs-awaiting-approval', 'COGS Copilot Awaiting Approval'],
  ['import-errors', 'Import Contains Errors'],
  ['no-results', 'No Results'],
];
const scenariosSource = read('src/fixtures/scenarios.ts');
for (const [id, label] of requiredScenarios) {
  expect(
    scenariosSource.includes(`{ id: '${id}', label: '${label}'`),
    `src/fixtures/scenarios.ts missing required scenario: ${label} (${id})`,
  );
}
expectContains('src/fixtures/scenarios.ts', [
  'accountMode',
  'cogsMode',
  'copilotMode',
  'importMode',
  'resultMode',
  'subscriptionStatus',
  'entitlements',
  'freshness',
]);

// The domain layer should model the future API surface, not only the current demo table.
const requiredDomainExports = [
  'Marketplace',
  'SubscriptionStatus',
  'SyncStatus',
  'DateRange',
  'AnalysisContext',
  'Organisation',
  'Subscription',
  'ModuleEntitlement',
  'Company',
  'MarketplaceAccount',
  'Permission',
  'Role',
  'User',
  'Product',
  'Listing',
  'ProductPerformance',
  'ProductListItem',
  'Transaction',
  'COGSRecord',
  'Expense',
  'SyncJob',
  'AttentionItem',
  'AuditEvent',
  'DataFreshness',
  'CopilotContext',
  'CopilotSuggestion',
];
const modelsSource = read('src/domain/models.ts');
for (const exportName of requiredDomainExports) {
  const declaration = new RegExp(`export\\s+(?:type|interface)\\s+${exportName}\\b`);
  expect(declaration.test(modelsSource), `src/domain/models.ts missing exported model: ${exportName}`);
}

const expectedModuleKeys = [
  'marketplace-profitability',
  'products-inventory',
  'purchasing-suppliers',
  'sales-customers',
  'warehouse',
  'fulfilment',
  'finance',
  'communications',
  'platform-completion',
];
const moduleKeySource = modelsSource.slice(
  modelsSource.indexOf('export type ModuleEntitlementKey'),
  modelsSource.indexOf('export type SyncStatus'),
);
const actualModuleKeys = [...moduleKeySource.matchAll(/\|\s*'([^']+)'/g)].map((match) => match[1]);
expect(
  JSON.stringify(actualModuleKeys) === JSON.stringify(expectedModuleKeys),
  `ModuleEntitlementKey must define exactly the nine business modules: ${expectedModuleKeys.join(', ')}`,
);
expectContains('src/domain/models.ts', [
  'moduleKey: ModuleEntitlementKey',
  'productId: string',
  'unitCostMinor: number',
  'currency: string',
  'effectiveFrom: string',
  'effectiveTo: string | null',
  'changedByUserId: string',
  'createdAt: string',
  'export type ExpenseScope',
  "{ type: 'organisation' }",
  "{ type: 'company'; companyId: string }",
  "{ type: 'marketplace'; marketplace: Marketplace }",
  "{ type: 'marketplace_account'; marketplaceAccountId: string }",
  "{ type: 'product'; productId: string }",
  'export type AuditActor',
  'target: AuditTarget',
  'previousValue: unknown',
  'newValue: unknown',
  'reason: string | null',
  'export type SyncJobStatus',
  'marketplaceAccountId: string',
  'jobType: SyncJobType',
  'completedAt: string | null',
  'lastSuccessfulRunAt: string | null',
  'recordsProcessed: number',
  'error: SyncJobError | null',
  'retry: SyncJobRetry | null',
]);

const fixtureSource = read('src/fixtures/data.ts');
expectContains('src/fixtures/data.ts', [
  "planName: 'Test Plan'",
  "moduleKey: 'marketplace-profitability'",
  'export const workspaceFixtures',
  "slug: 'stock-supplies'",
  "slug: 'harbour-homewares'",
  "slug: 'brightforge-tools'",
]);
expect(!/\bGrowth(?: Plan)?\b/i.test(fixtureSource), 'fixture data must not contain invented Growth plan labels');
for (const pseudoModule of ['analytics', 'cogs', 'expenses', 'operations', 'administration', 'copilot', 'platform']) {
  expect(
    !fixtureSource.includes(`moduleKey: '${pseudoModule}'`),
    `fixture data must not model ${pseudoModule} as a business module entitlement`,
  );
}

// UI hooks use a typed composition root; only mock repositories may touch business fixtures.
expectContains('src/services/contracts.ts', [
  'export interface AccessScope',
  'export interface ProductRepository',
  'export interface WorkspaceRepository',
  'export interface WorkspaceSnapshot',
  'export interface CopilotRepository',
  'getByOrganisationSlug(orgSlug: string',
  'Promise<WorkspaceSnapshot | null>',
]);
expectContains('src/services/runtime.ts', [
  'export interface ServiceContainer',
  'products: ProductRepository',
  'workspace: WorkspaceRepository',
  'copilot: CopilotRepository',
  'products: new MockProductRepository()',
  'workspace: new MockWorkspaceRepository()',
  'copilot: new MockCopilotRepository()',
]);
expectContains('src/services/mock/product-repository.ts', [
  'implements ProductRepository',
  'aggregateProductPage',
  'createProductAnalyticsSnapshot',
  'buildProductListItem',
  'authorisedCompanyIds',
  'authorisedAccountIds',
]);
expectContains('src/services/mock/workspace-repository.ts', ['implements WorkspaceRepository', 'getByOrganisationSlug', 'if (!fixture) return null']);
expectContains('src/services/mock/copilot-repository.ts', ['implements CopilotRepository', 'getScenarioRuntime']);
expectContains('src/services/hooks/use-products.ts', ["from '@/src/services/runtime'", 'services.products.list']);
expectContains('src/services/hooks/use-workspace.ts', ["from '@/src/services/runtime'", 'services.workspace.getByOrganisationSlug', 'queryKeys.workspace(orgSlug, scenarioId)']);
expectContains('src/services/hooks/use-copilot.ts', ["from '@/src/services/runtime'", 'services.copilot.overview', 'services.copilot.ask']);
expectContains('src/services/mappers/product-read-model.ts', ['export function materializeProduct']);

const uiPrimitiveContracts = [
  ['src/components/ui/actions.tsx', ['Button', 'IconButton']],
  ['src/components/ui/forms.tsx', ['Field', 'Input', 'SearchInput', 'Textarea', 'Select', 'MultiSelect', 'Checkbox', 'Radio', 'Switch', 'DateRangeControl']],
  ['src/components/ui/feedback.tsx', ['Badge', 'Alert', 'Spinner', 'Skeleton', 'ToastProvider']],
  ['src/components/ui/overlays.tsx', ['Tooltip', 'Popover', 'DropdownMenu', 'Tabs', 'Modal', 'Drawer', 'ConfirmationDialog']],
  ['src/components/ui/navigation.tsx', ['Breadcrumbs', 'Pagination']],
];
for (const [file, exportNames] of uiPrimitiveContracts) {
  const contents = read(file);
  for (const exportName of exportNames) {
    expect(
      new RegExp(`export\\s+(?:function|const|class)\\s+${exportName}\\b`).test(contents),
      `${file} missing UI primitive export: ${exportName}`,
    );
  }
}

expectContains('src/components/rbac/access.tsx', [
  'SubscriptionState',
  'ModuleEntitlementState',
  'PermissionState',
  'AssignmentState',
]);
expectContains('src/components/tables/enterprise-data-grid.tsx', [
  'export type GridColumn',
  'export interface EnterpriseDataGridViewState',
  'export interface EnterpriseDataGridProps',
  'ariaLabel',
  'savedViewKey',
  'initialViewState',
  'onSaveView',
  'tableFeatures',
  'pagination?: PaginationState',
  'onPaginationChange?: OnChangeFn<PaginationState>',
  'sorting?: SortingState',
  'onSortingChange?: OnChangeFn<SortingState>',
  'columnFilters?: ColumnFiltersState',
  'onColumnFiltersChange?: OnChangeFn<ColumnFiltersState>',
  'search?: string',
  'onSearchChange?: OnChangeFn<string>',
  'columnVisibility?: ColumnVisibilityState',
  'onColumnVisibilityChange?: OnChangeFn<ColumnVisibilityState>',
  'columnSizing?: ColumnSizingState',
  'onColumnSizingChange?: OnChangeFn<ColumnSizingState>',
  'columnPinning?: ColumnPinningState',
  'onColumnPinningChange?: OnChangeFn<ColumnPinningState>',
  'manualPagination?: boolean',
  'manualSorting?: boolean',
  'manualFiltering?: boolean',
  'rowCount?: number',
  'pageCount?: number',
  'renderBulkActions?:',
  'renderRowActions?:',
  'loading?: boolean',
  'error?: Error | string | null',
  'emptyState?: ReactNode',
  'virtualize?: boolean',
  'responsivePriorityColumns?: readonly string[]',
  'setColumnSizing',
  'aria-valuenow',
  'parseSavedView',
  'shouldVirtualize = virtualize && !isMobileGrid',
  'getIsPinned',
]);
expectContains('src/features/foundation/product-table-demo.tsx', [
  'pagination={pagination}',
  'sorting={sorting}',
  'search={search}',
  'renderBulkActions={renderBulkActions}',
  'renderRowActions={renderRowActions}',
  'loading={query.isPending}',
  'responsivePriorityColumns=',
  'workspace.organisation.id',
]);
expectContains('src/components/ui/overlays.tsx', [
  "from '@radix-ui/react-dropdown-menu'",
  "from '@radix-ui/react-popover'",
  '<DropdownMenuPrimitive.Root>',
  '<PopoverPrimitive.Root>',
]);
expectContains('src/components/ui/forms.tsx', [
  "Omit<SelectHTMLAttributes<HTMLSelectElement>, 'multiple'>",
  'multiple>{children}</select>',
]);
expectContains('src/components/copilot/copilot-drawer.tsx', [
  'CopilotContext',
  'useCopilot',
  'formatMoney',
  'Financial changes always require approval',
]);

expectContains('src/domain/date-ranges.ts', [
  "export type DatePreset = DatePresetKey | 'custom'",
  'export function resolveDateRange',
  'isIsoDate(from)',
  'isIsoDate(to)',
  "presetFor(dateRange) ?? 'custom'",
]);
expectContains('src/components/providers/analysis-context-provider.tsx', [
  'workspace: WorkspaceSnapshot',
  "const requestedDateFrom = searchParams.get('from')",
  "const requestedDateTo = searchParams.get('to')",
  'resolveDateRange({',
  'setDateRange:',
]);
expectContains('src/components/layout/context-bar.tsx', ["value: 'custom'", 'context.dateRange.from', 'context.dateRange.to']);

const tenantLayoutSource = read('app/o/[orgSlug]/layout.tsx');
expect(!tenantLayoutSource.includes("orgSlug !== 'stock-supplies'"), 'tenant layout must not hardcode the primary organisation slug');
expectContains('src/components/layout/tenant-shell.tsx', [
  'useWorkspace(orgSlug)',
  'workspaceQuery.data',
  '<UnknownOrganisationState />',
  'organisationName={workspace.organisation.name}',
]);
expectContains('src/components/layout/navigation.tsx', [
  'export function OrganisationCard',
  'workspace.organisation.name',
  'workspace.subscription.planName',
]);
expect(existsSync(pathFor('src/components/states/unknown-organisation-state.tsx')), 'missing repository-driven unknown organisation state');

const dashboardSource = read('app/o/[orgSlug]/dashboard/page.tsx');
expect(
  dashboardSource.includes("import { DashboardPage }")
    && dashboardSource.includes('<DashboardPage />')
    && !dashboardSource.includes('FoundationPage'),
  'tenant dashboard must render the Phase 3 DashboardPage without exposing the Phase 1 QA surface',
);
const productsSource = read('app/o/[orgSlug]/products/page.tsx');
expect(
  productsSource.includes("import { ProductsPage }")
    && productsSource.includes('<ProductsPage />')
    && !productsSource.includes('FeaturePage'),
  'Products must render the Phase 4 ProductsPage without exposing the earlier placeholder',
);
const productDetailSource = read('app/o/[orgSlug]/products/[productId]/page.tsx');
expect(
  productDetailSource.includes("import { ProductDetailPage }")
    && productDetailSource.includes('decodeURIComponent(productId)')
    && productDetailSource.includes('<ProductDetailPage productId={decodedProductId} />'),
  'Product detail must render the Phase 4 ProductDetailPage',
);
expectContains('src/features/foundation/foundation-page.tsx', [
  'Frontend foundation',
  'ProductTableDemo',
  'Reusable application states',
]);

// Prototype scenario controls may consume scenario definitions; business-data fixtures may not leak into UI.
const fixtureImportPattern = /(?:from\s+|import\s*\()(['"])(?:@\/src\/fixtures\/(?!scenarios(?:['"]|$))|(?:\.\.\/)+fixtures\/)[^'"]*\1/g;
for (const directory of ['src/components', 'src/features']) {
  for (const absoluteFile of sourceFiles(directory)) {
    const contents = readFileSync(absoluteFile, 'utf8');
    if (fixtureImportPattern.test(contents)) {
      failures.push(`${relative(root, absoluteFile)} must obtain business data through services, not fixtures`);
    }
    fixtureImportPattern.lastIndex = 0;
  }
}

try {
  const { evaluateAccess, ROLE_PRESETS } = await loadTypeScriptModule('src/domain/permissions.ts');
  const tenantAdmin = ROLE_PRESETS.find((role) => role.id === 'admin');
  const platformAdmin = ROLE_PRESETS.find((role) => role.id === 'platform-admin');
  const baseAccess = {
    role: tenantAdmin,
    assignment: { companyIds: 'all', accountIds: 'all' },
    subscriptionStatus: 'active',
    entitlements: new Set(['marketplace-profitability']),
  };
  expect(evaluateAccess({ ...baseAccess, capability: 'profitability.view' }).allowed, 'Module 01 access matrix must allow an entitled administrator');
  expect(
    evaluateAccess({ ...baseAccess, capability: 'profitability.view', entitlements: new Set() }).reason === 'module_not_entitled',
    'Module 01 disabled scenario must deny the whole profitability module',
  );
  expect(
    evaluateAccess({ ...baseAccess, capability: 'billing.manage', entitlements: new Set() }).allowed,
    'core billing administration must not require Module 01 entitlement',
  );
  expect(
    evaluateAccess({ ...baseAccess, capability: 'billing.manage', subscriptionStatus: 'past_due', entitlements: new Set() }).allowed,
    'billing must remain available while a subscription is past due',
  );
  expect(
    evaluateAccess({
      ...baseAccess,
      capability: 'platform.organisations.view',
      role: platformAdmin,
      subscriptionStatus: 'past_due',
      entitlements: new Set(),
    }).allowed,
    'platform capabilities must be independent of customer subscriptions and module entitlements',
  );
  expect(
    evaluateAccess({
      ...baseAccess,
      capability: 'products.view',
      assignment: { companyIds: ['cmp-stock'], accountIds: 'all' },
      companyId: 'cmp-proserve',
    }).reason === 'assignment_out_of_scope',
    'company assignment filtering must remain after subscription, entitlement, and RBAC checks',
  );
  expect(
    evaluateAccess({ ...baseAccess, capability: 'copilot.use', entitlements: new Set() }).reason === 'module_not_entitled',
    'Copilot must remain permission-aware without becoming a synthetic business module',
  );
} catch (error) {
  failures.push(`could not execute access hierarchy checks: ${error instanceof Error ? error.message : String(error)}`);
}

try {
  const { resolveDateRange } = await loadTypeScriptModule('src/domain/date-ranges.ts');
  const custom = resolveDateRange({ range: null, from: '2026-07-15', to: '2026-08-15' });
  expect(custom.datePreset === 'custom', 'explicit non-preset from/to must resolve as a custom range');
  expect(custom.dateRange.from === '2026-07-15' && custom.dateRange.to === '2026-08-15', 'custom from/to must round-trip exactly');
  const inferredPreset = resolveDateRange({ range: null, from: '2026-08-01', to: '2026-08-27' });
  expect(inferredPreset.datePreset === 'month', 'an exact preset date pair should infer its preset');
  const presetOnly = resolveDateRange({ range: 'quarter', from: null, to: null });
  expect(presetOnly.datePreset === 'quarter' && presetOnly.dateRange.from === '2026-06-01', 'preset-only URLs must restore their analytical range');
  const reversed = resolveDateRange({ range: 'month', from: '2026-08-20', to: '2026-08-10' });
  expect(reversed.datePreset === 'month' && reversed.dateRange.from === '2026-08-01', 'reversed custom dates must fall back safely');
} catch (error) {
  failures.push(`could not execute date-range checks: ${error instanceof Error ? error.message : String(error)}`);
}

try {
  const { queryKeys } = await loadTypeScriptModule('src/services/query-keys.ts');
  expect(
    JSON.stringify(queryKeys.workspace('stock-supplies', 'healthy')) !== JSON.stringify(queryKeys.workspace('harbour-homewares', 'healthy')),
    'workspace query keys must be isolated by organisation slug',
  );
} catch (error) {
  failures.push(`could not execute workspace query-key checks: ${error instanceof Error ? error.message : String(error)}`);
}

if (failures.length > 0) {
  console.error(`Foundation validation failed:\n${failures.map((item) => `- ${item}`).join('\n')}`);
  process.exit(1);
}

console.log(`Foundation validation passed: ${[
  `${routeFiles.length} leaf routes`,
  `${expectedRoleLabels.length} exact roles`,
  `${requiredScenarios.length} required scenarios`,
  `${requiredDomainExports.length} domain models`,
  `${uiPrimitiveContracts.length} UI primitive modules`,
  'access hierarchy, tenant isolation, and date deep-link behavior',
  'standard Next.js runtime and service boundaries',
].join(' · ')}.`);
