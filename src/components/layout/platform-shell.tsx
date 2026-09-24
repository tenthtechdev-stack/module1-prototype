'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Menu, X, Search, ShieldCheck } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { NavigationList } from '@/src/components/layout/navigation';
import { platformNavigation } from '@/src/config/navigation';

import { usePrototype } from '@/src/components/providers/prototype-provider';
import { PageSkeleton } from '@/src/components/states/states';

function PlatformMobileNavigation() {
  const [open, setOpen] = useState(false);
  return <Dialog.Root open={open} onOpenChange={setOpen}>
    <Dialog.Trigger asChild><button className="icon-button mobile-menu-trigger" aria-label="Open navigation"><Menu size={19} /></button></Dialog.Trigger>
    <Dialog.Portal><Dialog.Overlay className="drawer-overlay" /><Dialog.Content className="mobile-nav-drawer" aria-describedby={undefined}>
      <div className="drawer-heading"><div className="brand-lockup drawer-brand"><span className="brand-mark">TT</span><div><Dialog.Title>Tenth Tech</Dialog.Title><span>Platform Admin</span></div></div><Dialog.Close asChild><button className="icon-button" aria-label="Close navigation"><X size={18} /></button></Dialog.Close></div>
      <NavigationList sections={platformNavigation} onNavigate={() => setOpen(false)} />
    </Dialog.Content></Dialog.Portal>
  </Dialog.Root>;
}

function PlatformShellContent({ children }: { children: React.ReactNode }) {
  const { roleId, enabled } = usePrototype();
  const [query, setQuery] = useState('');
  const router = useRouter();
  if (roleId !== 'platform-admin') return <><main className="standalone-state platform-access"><ShieldCheck size={32} /><p className="eyebrow">Tenth Tech Platform</p><h1>Platform Super Admin access required</h1><p>This area is reserved for the Tenth Tech platform team.</p><p>{enabled ? 'Select Platform Super Admin in the prototype Role control to preview platform operations.' : 'Platform access is reserved for authorised platform administrators.'}</p><Link className="ui-button secondary" href="/o/stock-supplies/dashboard">Return to organisation workspace</Link></main></>;
  return (
    <div className="app-shell platform-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="app-header platform-header">
        <div className="brand-lockup"><span className="mobile-header-nav"><PlatformMobileNavigation /></span><span className="brand-mark">TT</span><div><strong>Tenth Tech</strong><span>Platform Administration</span></div></div>
        <form className="global-search" onSubmit={event => { event.preventDefault(); router.push('/platform/organisations?q=' + encodeURIComponent(query)); }}><Search size={16} /><input aria-label="Search organisations" placeholder="Search organisations…" value={query} onChange={event => setQuery(event.target.value)} /><button type="submit" className="platform-search-submit">Search</button></form>
        <div className="header-actions"><span className="platform-identity"><ShieldCheck size={15} />Super Admin</span><span className="avatar-button" title="Zara Rahman · Platform Super Admin">ZR</span></div>
      </header>
      <aside className="sidebar platform-sidebar" aria-label="Platform navigation">
        <div><span className="platform-badge">Tenth Tech Platform Administration</span><NavigationList sections={platformNavigation} /></div>
        <div className="operator-card"><span className="avatar-button">ZR</span><div><strong>Zara Rahman</strong><small>Platform Super Admin</small></div></div>
      </aside>
      <div className="workspace platform-workspace"><div className="platform-context-strip"><span><i /> Platform operations</span><span>Prototype · illustrative data · session-only changes</span></div><main id="main-content" className="main-content">{children}</main></div>
    </div>
  );
}
export function PlatformShell({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageSkeleton />}><PlatformShellContent>{children}</PlatformShellContent></Suspense>;
}
