'use client';

import { AppHeader } from '@/src/components/layout/app-header';
import { MobileNavigation, NavigationList } from '@/src/components/layout/navigation';
import { platformNavigation } from '@/src/config/navigation';
import { PrototypeTools } from '@/src/components/prototype/prototype-tools';

export function PlatformShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell platform-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <AppHeader platform mobileNavigation={<MobileNavigation sections={platformNavigation} platform />} />
      <aside className="sidebar platform-sidebar" aria-label="Platform navigation">
        <div><span className="platform-badge">Tenth Tech Platform Administration</span><NavigationList sections={platformNavigation} /></div>
        <div className="operator-card"><span className="avatar-button">ZR</span><div><strong>Zara Rahman</strong><small>Tenth Tech operator</small></div></div>
      </aside>
      <div className="workspace platform-workspace"><main id="main-content" className="main-content">{children}</main></div>
      <PrototypeTools />
    </div>
  );
}
