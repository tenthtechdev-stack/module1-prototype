import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

const requiredContracts = [
  ['src/domain/permissions.ts', 'subscription_restricted'],
  ['src/domain/permissions.ts', 'module_not_entitled'],
  ['src/domain/permissions.ts', 'assignment_out_of_scope'],
  ['src/components/providers/analysis-context-provider.tsx', 'marketplaceAccountIds'],
  ['src/services/mock/product-repository.ts', '250 +'],
  ['src/components/tables/enterprise-data-grid.tsx', 'tableFeatures'],
  ['src/components/copilot/copilot-drawer.tsx', 'Financial changes always require approval'],
];

const missing = routeFiles.filter((file) => !existsSync(resolve(file)));
for (const [file, needle] of requiredContracts) {
  const contents = readFileSync(resolve(file), 'utf8');
  if (!contents.includes(needle)) missing.push(`${file} missing contract: ${needle}`);
}

if (missing.length) {
  console.error(`Foundation validation failed:\n${missing.map((item) => `- ${item}`).join('\n')}`);
  process.exit(1);
}

console.log(`Foundation validation passed: ${routeFiles.length} leaf routes and ${requiredContracts.length} architecture contracts.`);
