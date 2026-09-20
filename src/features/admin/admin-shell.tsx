'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, ShieldCheck } from 'lucide-react';
import { tenantNavigation } from '@/src/config/navigation';
import { AccessState, useAccessRuntime } from '@/src/components/rbac/access';
import { evaluateAccess } from '@/src/domain/permissions';
import { AdminProvider, useAdmin } from './admin-context';
import './admin.css';

function AdminNavigation({ children }: { children: React.ReactNode }) {
  const { orgSlug, organisation } = useAdmin();
  const pathname = usePathname();
  const access = useAccessRuntime();
  const items = tenantNavigation.find(section => section.label === 'Administration')!.items;
  const current = items.find(item => pathname === `/o/${orgSlug}${item.href}`);
  const decision = evaluateAccess({ ...access, capability: current?.capability ?? 'companies.manage' });
  return <div className="tenant-admin">
    <div className="admin-workspace-heading"><span className="admin-workspace-icon"><Building2 size={18} /></span><div><strong>Organisation settings</strong><small>{organisation.name}</small></div><span className="admin-scope-label"><ShieldCheck size={13} /> Tenant Administration</span></div>
    <nav className="admin-tabs" aria-label="Organisation settings">{items.filter(item => evaluateAccess({ ...access, capability: item.capability }).allowed).map(item => <Link href={`/o/${orgSlug}${item.href}`} key={item.href} aria-current={pathname === `/o/${orgSlug}${item.href}` ? 'page' : undefined}><item.icon size={14} />{item.label}</Link>)}</nav>
    {decision.allowed ? children : <div className="admin-restricted"><AccessState decision={decision} /><Link className="ui-button secondary" href={`/o/${orgSlug}/dashboard`}>Back to Dashboard</Link></div>}
    <p className="admin-prototype-note">Prototype workspace · Changes last while you browse Administration. Reloading restores the demonstration data.</p>
  </div>;
}
export function AdminShell({ children }: { children: React.ReactNode }) { return <AdminProvider><AdminNavigation>{children}</AdminNavigation></AdminProvider>; }
