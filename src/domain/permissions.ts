import type { ModuleEntitlementKey, SubscriptionStatus, User, UserRoleAssignment } from '@/src/domain/models';

export const CAPABILITIES = [
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
  'companies.manage',
  'marketplaces.manage',
  'users.manage',
  'roles.manage',
  'billing.manage',
  'audit.view',
  'copilot.use',
  'platform.organisations.view',
  'platform.entitlements.manage',
  'platform.integrations.manage',
  'platform.ai_usage.view',
  'platform.audit.view',
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export interface RolePreset {
  id: string;
  label: string;
  description: string;
  surface: 'tenant' | 'platform';
  capabilities: Capability[];
}

export interface AssignmentScope {
  companyIds: 'all' | string[];
  accountIds: 'all' | string[];
}

export const CAPABILITY_LABELS: Record<Capability, string> = {
  'profitability.view': 'Dashboard & profitability',
  'products.view': 'Products · View',
  'transactions.view': 'Transactions · View',
  'cogs.view': 'COGS · View',
  'cogs.edit': 'COGS · Manage',
  'cogs.import': 'COGS · Import',
  'cogs.approve': 'COGS · Approve',
  'expenses.view': 'Expenses · View',
  'expenses.view_sensitive': 'Expenses · View sensitive values',
  'expenses.edit': 'Expenses · Manage',
  'reports.view': 'Reports · View & export',
  'sync.view': 'Marketplace accounts · View sync',
  'sync.retry': 'Marketplace accounts · Retry sync',
  'companies.manage': 'Companies · Manage',
  'marketplaces.manage': 'Marketplace accounts · Manage connection',
  'users.manage': 'Users · Invite & manage assignments',
  'roles.manage': 'Roles & permissions · Manage',
  'billing.manage': 'Billing & modules · Manage',
  'audit.view': 'Audit · View',
  'copilot.use': 'AI Copilot · Use',
  'platform.organisations.view': 'Platform organisations · View',
  'platform.entitlements.manage': 'Platform entitlements · Manage',
  'platform.integrations.manage': 'Platform integrations · Manage',
  'platform.ai_usage.view': 'Platform AI usage · View',
  'platform.audit.view': 'Platform audit · View',
};

export interface CapabilityGroup {
  label: string;
  description: string;
  capabilities: Capability[];
}

export const TENANT_CAPABILITY_GROUPS: CapabilityGroup[] = [
  { label: 'Dashboard', description: 'Commercial overview and profitability.', capabilities: ['profitability.view'] },
  { label: 'Products', description: 'Product catalogue visibility.', capabilities: ['products.view'] },
  { label: 'COGS & Product Groups', description: 'Cost visibility, maintenance, imports and approval workflows.', capabilities: ['cogs.view', 'cogs.edit', 'cogs.import', 'cogs.approve'] },
  { label: 'Transactions', description: 'Marketplace transaction visibility.', capabilities: ['transactions.view'] },
  { label: 'Expenses', description: 'Expense visibility, sensitive values and maintenance.', capabilities: ['expenses.view', 'expenses.view_sensitive', 'expenses.edit'] },
  { label: 'Reports', description: 'Report visibility and the existing export actions.', capabilities: ['reports.view'] },
  { label: 'Marketplace Accounts', description: 'Sync visibility, retries and connection management.', capabilities: ['sync.view', 'sync.retry', 'marketplaces.manage'] },
  { label: 'Companies', description: 'Company administration.', capabilities: ['companies.manage'] },
  { label: 'Users', description: 'Invitations and scoped role assignments.', capabilities: ['users.manage'] },
  { label: 'Roles & Permissions', description: 'Custom role administration.', capabilities: ['roles.manage'] },
  { label: 'Billing & Modules', description: 'Subscription and module administration.', capabilities: ['billing.manage'] },
  { label: 'Audit', description: 'Organisation audit trail.', capabilities: ['audit.view'] },
  { label: 'AI Copilot', description: 'Permission-aware Copilot access.', capabilities: ['copilot.use'] },
];

export function getUserRoleAssignments(user: Pick<User, 'roleId' | 'companyIds' | 'marketplaceAccountIds' | 'roleAssignments'>): UserRoleAssignment[] {
  if (user.roleAssignments?.length) return user.roleAssignments;
  const scope = user.companyIds === 'all' && user.marketplaceAccountIds === 'all'
    ? 'organisation'
    : user.marketplaceAccountIds === 'all' ? 'company' : 'marketplace-account';
  return [{
    id: `legacy-${user.roleId}`,
    roleId: user.roleId,
    scope,
    companyIds: user.companyIds,
    marketplaceAccountIds: user.marketplaceAccountIds,
  }];
}

export function getEffectiveCapabilities(assignments: readonly UserRoleAssignment[], roles: readonly RolePreset[]): Capability[] {
  const allowed = new Set<Capability>();
  assignments.forEach((assignment) => roles.find((role) => role.id === assignment.roleId)?.capabilities.forEach((capability) => allowed.add(capability)));
  return CAPABILITIES.filter((capability) => allowed.has(capability) && !capability.startsWith('platform.'));
}

const tenantView: Capability[] = [
  'profitability.view',
  'products.view',
  'transactions.view',
  'cogs.view',
  'expenses.view',
  'reports.view',
  'sync.view',
  'audit.view',
  'copilot.use',
];

export const ROLE_PRESETS: RolePreset[] = [
  {
    id: 'admin',
    label: 'Organisation Admin',
    description: 'Full tenant administration and analytics',
    surface: 'tenant',
    capabilities: CAPABILITIES.filter((capability) => !capability.startsWith('platform.')),
  },
  {
    id: 'company-manager',
    label: 'Company Manager',
    description: 'Two assigned companies with operational actions',
    surface: 'tenant',
    capabilities: [...tenantView, 'cogs.edit', 'expenses.view_sensitive', 'sync.retry'],
  },
  {
    id: 'finance',
    label: 'Finance / Accounts',
    description: 'Profitability, COGS and expenses',
    surface: 'tenant',
    capabilities: [...tenantView, 'cogs.edit', 'cogs.import', 'cogs.approve', 'expenses.view_sensitive', 'expenses.edit'],
  },
  {
    id: 'marketplace-manager',
    label: 'Marketplace Manager',
    description: 'Assigned marketplace accounts only',
    surface: 'tenant',
    capabilities: ['profitability.view', 'products.view', 'transactions.view', 'reports.view', 'sync.view', 'sync.retry', 'copilot.use'],
  },
  {
    id: 'cost-user',
    label: 'Purchasing / Cost User',
    description: 'Product cost maintenance without broad financial access',
    surface: 'tenant',
    capabilities: ['products.view', 'cogs.view', 'cogs.edit', 'cogs.import', 'copilot.use'],
  },
  {
    id: 'analyst',
    label: 'Analyst / Management Viewer',
    description: 'Read-only commercial and sensitive financial analysis',
    surface: 'tenant',
    capabilities: [...tenantView, 'expenses.view_sensitive'],
  },
  {
    id: 'auditor',
    label: 'Auditor / Read Only',
    description: 'Read-only financial review',
    surface: 'tenant',
    capabilities: tenantView.filter((capability) => capability !== 'copilot.use'),
  },
  {
    id: 'platform-admin',
    label: 'Platform Super Admin',
    description: 'Tenth Tech platform operations',
    surface: 'platform',
    capabilities: CAPABILITIES.filter((capability) => capability.startsWith('platform.')),
  },
];

// Prototype principals keep data assignment separate from reusable role definitions.
export const PREVIEW_ASSIGNMENTS: Record<string, AssignmentScope> = {
  admin: { companyIds: 'all', accountIds: 'all' },
  'company-manager': { companyIds: ['cmp-stock', 'cmp-proserve'], accountIds: 'all' },
  finance: { companyIds: 'all', accountIds: 'all' },
  'marketplace-manager': { companyIds: ['cmp-proserve'], accountIds: ['acct-proserve-amazon', 'acct-proserve-temu'] },
  'cost-user': { companyIds: ['cmp-northbridge'], accountIds: ['acct-northbridge-amazon'] },
  analyst: { companyIds: 'all', accountIds: 'all' },
  auditor: { companyIds: 'all', accountIds: 'all' },
  'platform-admin': { companyIds: [], accountIds: [] },
};

export const CAPABILITY_REQUIRED_MODULE: Partial<Record<Capability, ModuleEntitlementKey>> = {
  'profitability.view': 'marketplace-profitability',
  'products.view': 'marketplace-profitability',
  'transactions.view': 'marketplace-profitability',
  'cogs.view': 'marketplace-profitability',
  'cogs.edit': 'marketplace-profitability',
  'cogs.import': 'marketplace-profitability',
  'cogs.approve': 'marketplace-profitability',
  'expenses.view': 'marketplace-profitability',
  'expenses.view_sensitive': 'marketplace-profitability',
  'expenses.edit': 'marketplace-profitability',
  'reports.view': 'marketplace-profitability',
  'sync.view': 'marketplace-profitability',
  'sync.retry': 'marketplace-profitability',
  // Copilot is a permission-aware capability within Module 01. Future AI usage
  // controls remain a separate concern rather than a synthetic business module.
  'copilot.use': 'marketplace-profitability',
};

export const PROTOTYPE_ENABLED_MODULES = [
  'marketplace-profitability',
] as const satisfies readonly ModuleEntitlementKey[];

export type AccessDecision =
  | { allowed: true }
  | {
      allowed: false;
      reason: 'subscription_restricted' | 'module_not_entitled' | 'capability_missing' | 'assignment_out_of_scope';
    };

export interface AccessInput {
  capability: Capability;
  role: RolePreset;
  assignment: AssignmentScope;
  subscriptionStatus: SubscriptionStatus;
  entitlements: ReadonlySet<ModuleEntitlementKey>;
  companyId?: string;
  accountId?: string;
}

export function evaluateAccess(input: AccessInput): AccessDecision {
  const isPlatform = input.capability.startsWith('platform.');
  if (!isPlatform && input.subscriptionStatus !== 'active' && input.subscriptionStatus !== 'trialing' && input.capability !== 'billing.manage') {
    return { allowed: false, reason: 'subscription_restricted' };
  }

  const requiredModule = CAPABILITY_REQUIRED_MODULE[input.capability];
  if (requiredModule && !input.entitlements.has(requiredModule)) {
    return { allowed: false, reason: 'module_not_entitled' };
  }

  if (!input.role.capabilities.includes(input.capability)) {
    return { allowed: false, reason: 'capability_missing' };
  }

  if (input.companyId && input.assignment.companyIds !== 'all' && !input.assignment.companyIds.includes(input.companyId)) {
    return { allowed: false, reason: 'assignment_out_of_scope' };
  }
  if (input.accountId && input.assignment.accountIds !== 'all' && !input.assignment.accountIds.includes(input.accountId)) {
    return { allowed: false, reason: 'assignment_out_of_scope' };
  }

  return { allowed: true };
}
