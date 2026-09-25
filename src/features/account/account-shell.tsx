'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowLeft, BellRing, Menu, ShieldCheck, UserRound, X } from 'lucide-react';
import { AppHeader } from '@/src/components/layout/app-header';
import { InitialsAvatar } from '@/src/features/account/account-ui';
import { useAccountProfile } from '@/src/features/account/account-store';

const ACCOUNT_ITEMS = [
  { href: '/account/profile', label: 'My Profile', icon: UserRound },
  { href: '/account/security', label: 'Security', icon: ShieldCheck },
  { href: '/account/notifications', label: 'Notifications', icon: BellRing },
];

function AccountNavigation({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return <nav className="navigation-list account-navigation" aria-label="Account settings">
    <section>
      <p className="nav-label">My account</p>
      {ACCOUNT_ITEMS.map((item) => {
        const active = pathname === item.href;
        return <Link key={item.href} href={item.href} className={`nav-item${active ? ' active' : ''}`} aria-current={active ? 'page' : undefined} onClick={onNavigate}><item.icon size={17} aria-hidden="true" /><span>{item.label}</span></Link>;
      })}
    </section>
  </nav>;
}

function AccountMobileNavigation() {
  return <Dialog.Root>
    <Dialog.Trigger asChild><button className="icon-button mobile-menu-trigger" aria-label="Open account navigation"><Menu size={19} /></button></Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay className="drawer-overlay" />
      <Dialog.Content className="mobile-nav-drawer" aria-describedby={undefined}>
        <div className="drawer-heading">
          <div className="brand-lockup drawer-brand"><span className="brand-mark">SS</span><div><Dialog.Title>My account</Dialog.Title><span>Personal settings</span></div></div>
          <Dialog.Close asChild><button className="icon-button" aria-label="Close account navigation"><X size={18} /></button></Dialog.Close>
        </div>
        <Dialog.Close asChild><div className="account-mobile-navigation"><AccountNavigation /></div></Dialog.Close>
        <Link className="account-mobile-return" href="/o/stock-supplies/dashboard"><ArrowLeft size={15} /> Return to workspace</Link>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

export function AccountShell({ children }: { children: React.ReactNode }) {
  const [profile] = useAccountProfile();
  return <div className="app-shell account-shell">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <AppHeader organisationName="Personal account" userName={profile.name} mobileNavigation={<AccountMobileNavigation />} />
    <aside className="sidebar account-sidebar" aria-label="Account navigation">
      <AccountNavigation />
      <div className="account-sidebar-footer">
        <Link className="account-return-link" href="/o/stock-supplies/dashboard"><ArrowLeft size={15} /><span>Return to workspace</span></Link>
        <div className="account-sidebar-identity"><InitialsAvatar name={profile.name} image={profile.avatarDataUrl} /><div><strong>{profile.name}</strong><small>{profile.email}</small></div></div>
      </div>
    </aside>
    <div className="workspace account-workspace"><main id="main-content" className="main-content account-main-content">{children}</main></div>
  </div>;
}

