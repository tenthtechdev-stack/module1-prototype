'use client';

import { Bell, Search } from 'lucide-react';

export function AppHeader({ mobileNavigation, copilot, platform = false }: { mobileNavigation: React.ReactNode; copilot?: React.ReactNode; platform?: boolean }) {
  return (
    <header className={`app-header${platform ? ' platform-header' : ''}`}>
      <div className="brand-lockup">
        <span className="mobile-header-nav">{mobileNavigation}</span>
        <span className="brand-mark">{platform ? 'TT' : 'SS'}</span>
        <div><strong>{platform ? 'Tenth Tech' : 'Stock Supplies'}</strong><span>{platform ? 'Platform Admin' : 'Profitability'}</span></div>
      </div>
      <label className="global-search"><Search size={16} /><input aria-label="Global search" placeholder={platform ? 'Search organisations and integrations…' : 'Search products, orders, SKUs…'} /><kbd>⌘ K</kbd></label>
      <div className="header-actions"><button className="icon-button" aria-label="Notifications"><Bell size={18} /><i /></button>{copilot}<button className="avatar-button" aria-label="Open user menu">ZR</button></div>
    </header>
  );
}
