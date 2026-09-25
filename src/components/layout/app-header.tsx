'use client';

import { Search } from 'lucide-react';
import { AppearanceMenu } from '@/src/components/theme/appearance-control';
import { NotificationCentre } from '@/src/features/account/notification-centre';
import { useAccountProfile } from '@/src/features/account/account-store';

export function AppHeader({ mobileNavigation, copilot, platform = false, organisationName, userName, orgSlug }: { mobileNavigation: React.ReactNode; copilot?: React.ReactNode; platform?: boolean; organisationName?: string; userName?: string; orgSlug?: string }) {
  const [profile] = useAccountProfile();
  const displayName = profile.name || userName;
  const initials = displayName
    ? displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
    : 'ZR';
  return (
    <header className={`app-header${platform ? ' platform-header' : ''}`}>
      <div className="brand-lockup">
        <span className="mobile-header-nav">{mobileNavigation}</span>
        <span className="brand-mark">{platform ? 'TT' : 'SS'}</span>
        <div><strong>{platform ? 'Tenth Tech' : 'Stock Supplies'}</strong><span>{platform ? 'Platform Administration' : organisationName ?? 'Organisation workspace'}</span></div>
      </div>
      <label className="global-search"><Search size={16} /><input aria-label="Global search" placeholder={platform ? 'Search organisations and integrations…' : 'Search products, orders, SKUs…'} /><kbd>⌘ K</kbd></label>
      <div className="header-actions"><NotificationCentre orgSlug={orgSlug} />{copilot}<AppearanceMenu userName={displayName} userEmail={profile.email} trigger={<button type="button" className="avatar-button" aria-label={displayName ? `Open user menu for ${displayName}` : 'Open user menu'}>{initials}</button>} /></div>
    </header>
  );
}
