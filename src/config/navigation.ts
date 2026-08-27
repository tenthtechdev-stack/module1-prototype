import {
  Activity,
  BadgePoundSterling,
  Boxes,
  Building2,
  CircleDollarSign,
  FileBarChart,
  Gauge,
  KeyRound,
  LayoutDashboard,
  PackageSearch,
  PlugZap,
  ReceiptText,
  ScrollText,
  ShieldCheck,
  Store,
  Users,
  WandSparkles,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Capability } from '@/src/domain/permissions';

export interface NavigationItem {
  label: string;
  href: string;
  icon: LucideIcon;
  capability: Capability;
}

export interface NavigationSection {
  label: string;
  items: NavigationItem[];
}

export const tenantNavigation: NavigationSection[] = [
  {
    label: 'Business analytics',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, capability: 'profitability.view' },
      { label: 'Products', href: '/products', icon: PackageSearch, capability: 'products.view' },
      { label: 'Transactions', href: '/transactions', icon: ReceiptText, capability: 'transactions.view' },
      { label: 'COGS', href: '/cogs', icon: Boxes, capability: 'cogs.view' },
      { label: 'Expenses', href: '/expenses', icon: CircleDollarSign, capability: 'expenses.view' },
      { label: 'Reports', href: '/reports/pnl', icon: FileBarChart, capability: 'reports.view' },
    ],
  },
  {
    label: 'Operational health',
    items: [
      { label: 'Needs Attention', href: '/operations/attention', icon: Activity, capability: 'sync.view' },
      { label: 'Sync Health', href: '/operations/sync-health', icon: Gauge, capability: 'sync.view' },
    ],
  },
  {
    label: 'Organisation admin',
    items: [
      { label: 'Companies', href: '/admin/companies', icon: Building2, capability: 'companies.manage' },
      { label: 'Marketplace Accounts', href: '/admin/marketplace-accounts', icon: Store, capability: 'marketplaces.manage' },
      { label: 'Users', href: '/admin/users', icon: Users, capability: 'users.manage' },
      { label: 'Roles & Permissions', href: '/admin/roles', icon: ShieldCheck, capability: 'roles.manage' },
      { label: 'Billing', href: '/admin/billing', icon: BadgePoundSterling, capability: 'billing.manage' },
      { label: 'Audit', href: '/admin/audit', icon: ScrollText, capability: 'audit.view' },
    ],
  },
];

export const platformNavigation: NavigationSection[] = [
  {
    label: 'Platform operations',
    items: [
      { label: 'Dashboard', href: '/platform/dashboard', icon: LayoutDashboard, capability: 'platform.organisations.view' },
      { label: 'Organisations', href: '/platform/organisations', icon: Building2, capability: 'platform.organisations.view' },
      { label: 'Integrations', href: '/platform/integrations', icon: PlugZap, capability: 'platform.integrations.manage' },
      { label: 'AI Usage', href: '/platform/ai-usage', icon: WandSparkles, capability: 'platform.ai_usage.view' },
      { label: 'Audit', href: '/platform/audit', icon: KeyRound, capability: 'platform.audit.view' },
    ],
  },
];
