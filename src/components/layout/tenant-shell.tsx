'use client';

import { Suspense } from 'react';
import { ChevronDown } from 'lucide-react';
import { tenantNavigation } from '@/src/config/navigation';
import { AnalysisContextProvider } from '@/src/components/providers/analysis-context-provider';
import { AppHeader } from '@/src/components/layout/app-header';
import { ContextBar } from '@/src/components/layout/context-bar';
import { MobileNavigation, NavigationList } from '@/src/components/layout/navigation';
import { CopilotDrawer } from '@/src/components/copilot/copilot-drawer';
import { PrototypeTools } from '@/src/components/prototype/prototype-tools';
import { PageSkeleton } from '@/src/components/states/states';

function TenantShellContent({ orgSlug, children }: { orgSlug: string; children: React.ReactNode }) {
  return (
    <AnalysisContextProvider orgSlug={orgSlug}>
      <div className="app-shell tenant-shell">
        <a className="skip-link" href="#main-content">Skip to content</a>
        <AppHeader mobileNavigation={<MobileNavigation sections={tenantNavigation} orgSlug={orgSlug} />} copilot={<CopilotDrawer />} />
        <aside className="sidebar" aria-label="Primary navigation">
          <NavigationList sections={tenantNavigation} orgSlug={orgSlug} />
          <div className="org-card"><span className="org-monogram">S</span><div><strong>Stock Supplies</strong><small>Growth plan</small></div><ChevronDown size={14} /></div>
        </aside>
        <div className="workspace"><ContextBar /><main id="main-content" className="main-content">{children}</main></div>
        <PrototypeTools />
      </div>
    </AnalysisContextProvider>
  );
}

export function TenantShell({ orgSlug, children }: { orgSlug: string; children: React.ReactNode }) {
  return <Suspense fallback={<PageSkeleton />}><TenantShellContent orgSlug={orgSlug}>{children}</TenantShellContent></Suspense>;
}
