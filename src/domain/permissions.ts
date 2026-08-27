import type { SubscriptionStatus } from '@/src/domain/models';

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
export type ModuleKey = 'analytics' | 'cogs' | 'expenses' | 'operations' | 'administration' | 'copilot' | 'platform';

export interface RolePreset {
  id: string;
  label: string;
  description: string;
  surface: 'tenant' | 'platform';
  capabilities: Capability[];
  companyIds: 'all' | string[];
  accountIds: 'all' | string[];
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
    id: 'owner',
    label: 'Organisation Owner',
    description: 'Full tenant access',
    surface: 'tenant',
    capabilities: CAPABILITIES.filter((capability) => !capability.startsWith('platform.')),
    companyIds: 'all',
    accountIds: 'all',
  },
  {
    id: 'admin',
    label: 'Organisation Admin',
    description: 'People, companies and integrations',
    surface: 'tenant',
    capabilities: [...tenantView, 'companies.manage', 'marketplaces.manage', 'users.manage', 'roles.manage'],
    companyIds: 'all',
    accountIds: 'all',
  },
  {
    id: 'finance',
    label: 'Finance Manager',
    description: 'Profitability, COGS and expenses',
    surface: 'tenant',
    capabilities: [...tenantView, 'cogs.edit', 'cogs.import', 'cogs.approve', 'expenses.view_sensitive', 'expenses.edit'],
    companyIds: 'all',
    accountIds: 'all',
  },
  {
    id: 'marketplace',
    label: 'Marketplace Manager',
    description: 'Assigned Amazon account only',
    surface: 'tenant',
    capabilities: ['profitability.view', 'products.view', 'transactions.view', 'reports.view', 'sync.view', 'sync.retry', 'copilot.use'],
    companyIds: ['cmp-stock'],
    accountIds: ['acct-amazon-uk'],
  },
  {
    id: 'cogs',
    label: 'COGS Manager',
    description: 'Cost coverage and imports',
    surface: 'tenant',
    capabilities: ['products.view', 'cogs.view', 'cogs.edit', 'cogs.import', 'cogs.approve', 'audit.view', 'copilot.use'],
    companyIds: 'all',
    accountIds: 'all',
  },
  {
    id: 'operations',
    label: 'Operations Manager',
    description: 'Transactions and sync health',
    surface: 'tenant',
    capabilities: ['products.view', 'transactions.view', 'sync.view', 'sync.retry', 'marketplaces.manage', 'copilot.use'],
    companyIds: 'all',
    accountIds: 'all',
  },
  {
    id: 'auditor',
    label: 'Auditor',
    description: 'Read-only financial review',
    surface: 'tenant',
    capabilities: tenantView.filter((capability) => capability !== 'copilot.use'),
    companyIds: 'all',
    accountIds: 'all',
  },
  {
    id: 'platform-admin',
    label: 'Platform Super Admin',
    description: 'Tenth Tech platform operations',
    surface: 'platform',
    capabilities: CAPABILITIES.filter((capability) => capability.startsWith('platform.')),
    companyIds: [],
    accountIds: [],
  },
];

export const CAPABILITY_MODULE: Record<Capability, ModuleKey> = {
  'profitability.view': 'analytics',
  'products.view': 'analytics',
  'transactions.view': 'analytics',
  'cogs.view': 'cogs',
  'cogs.edit': 'cogs',
  'cogs.import': 'cogs',
  'cogs.approve': 'cogs',
  'expenses.view': 'expenses',
  'expenses.view_sensitive': 'expenses',
  'expenses.edit': 'expenses',
  'reports.view': 'analytics',
  'sync.view': 'operations',
  'sync.retry': 'operations',
  'companies.manage': 'administration',
  'marketplaces.manage': 'administration',
  'users.manage': 'administration',
  'roles.manage': 'administration',
  'billing.manage': 'administration',
  'audit.view': 'administration',
  'copilot.use': 'copilot',
  'platform.organisations.view': 'platform',
  'platform.entitlements.manage': 'platform',
  'platform.integrations.manage': 'platform',
  'platform.ai_usage.view': 'platform',
  'platform.audit.view': 'platform',
};

export type AccessDecision =
  | { allowed: true }
  | {
      allowed: false;
      reason: 'subscription_restricted' | 'module_not_entitled' | 'capability_missing' | 'assignment_out_of_scope';
    };

export interface AccessInput {
  capability: Capability;
  role: RolePreset;
  subscriptionStatus: SubscriptionStatus;
  entitlements: ReadonlySet<ModuleKey>;
  companyId?: string;
  accountId?: string;
}

export function evaluateAccess(input: AccessInput): AccessDecision {
  const isPlatform = input.capability.startsWith('platform.');
  if (!isPlatform && input.subscriptionStatus !== 'active' && input.subscriptionStatus !== 'trialing' && input.capability !== 'billing.manage') {
    return { allowed: false, reason: 'subscription_restricted' };
  }

  const moduleKey = CAPABILITY_MODULE[input.capability];
  if (!input.entitlements.has(moduleKey)) {
    return { allowed: false, reason: 'module_not_entitled' };
  }

  if (!input.role.capabilities.includes(input.capability)) {
    return { allowed: false, reason: 'capability_missing' };
  }

  if (input.companyId && input.role.companyIds !== 'all' && !input.role.companyIds.includes(input.companyId)) {
    return { allowed: false, reason: 'assignment_out_of_scope' };
  }
  if (input.accountId && input.role.accountIds !== 'all' && !input.role.accountIds.includes(input.accountId)) {
    return { allowed: false, reason: 'assignment_out_of_scope' };
  }

  return { allowed: true };
}

export const ALL_MODULES = new Set<ModuleKey>([
  'analytics',
  'cogs',
  'expenses',
  'operations',
  'administration',
  'copilot',
  'platform',
]);
