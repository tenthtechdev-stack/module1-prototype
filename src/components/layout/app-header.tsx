'use client';

import { Bell, Search } from 'lucide-react';

export function AppHeader({ mobileNavigation, copilot, platform = false, organisationName, userName }: { mobileNavigation: React.ReactNode; copilot?: React.ReactNode; platform?: boolean; organisationName?: string; userName?: string }) {
  const initials = userName
    ? userName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
    : 'ZR';
  return (
    <header className={`app-header${platform ? ' platform-header' : ''}`}>
      <div className="brand-lockup">
        <span className="mobile-header-nav">{mobileNavigation}</span>
        <span className="brand-mark">{platform ? 'TT' : 'SS'}</span>
        <div><strong>{platform ? 'Tenth Tech' : 'Stock Supplies'}</strong><span>{platform ? 'Platform Administration' : organisationName ?? 'Organisation workspace'}</span></div>
      </div>
      <label className="global-search"><Search size={16} /><input aria-label="Global search" placeholder={platform ? 'Search organisations and integrations…' : 'Search products, orders, SKUs…'} /><kbd>⌘ K</kbd></label>
      <div className="header-actions"><button className="icon-button" aria-label="Notifications"><Bell size={18} /><i /></button>{copilot}<button className="avatar-button" aria-label={userName ? `Open user menu for ${userName}` : 'Open user menu'}>{initials}</button></div>
    </header>
  );
}
