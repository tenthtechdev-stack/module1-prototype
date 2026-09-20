'use client';

import { FinancialDisclosureNotice } from '@/src/components/layout/financial-disclosure-notice';
import { Suspense } from 'react';
import { usePathname } from 'next/navigation';
import { tenantNavigation } from '@/src/config/navigation';
import { AnalysisContextProvider } from '@/src/components/providers/analysis-context-provider';
import { AppHeader } from '@/src/components/layout/app-header';
import { ContextBar } from '@/src/components/layout/context-bar';
import { MobileNavigation, NavigationList, OrganisationCard } from '@/src/components/layout/navigation';
import { CopilotDrawer } from '@/src/components/copilot/copilot-drawer';
import { PrototypeTools } from '@/src/components/prototype/prototype-tools';
import { ErrorState, PageSkeleton } from '@/src/components/states/states';
import { UnknownOrganisationState } from '@/src/components/states/unknown-organisation-state';
import { useWorkspace } from '@/src/services/hooks/use-workspace';
import { PlatformSupportBanner } from '@/src/features/platform/support-banner';

function TenantShellContent({ orgSlug, children }: { orgSlug: string; children: React.ReactNode }) {
  const workspaceQuery = useWorkspace(orgSlug);
  const isAdmin = usePathname().startsWith('/o/' + orgSlug + '/admin');

  if (workspaceQuery.isPending) return <main className="standalone-state"><PageSkeleton /></main>;
  if (workspaceQuery.isError) {
    return <main className="standalone-state"><ErrorState title="We could not load this organisation" description="The workspace repository returned an error." onRetry={() => { void workspaceQuery.refetch(); }} /></main>;
  }
  if (!workspaceQuery.data) return <UnknownOrganisationState />;

  const workspace = workspaceQuery.data;
  return (
    <AnalysisContextProvider orgSlug={orgSlug} workspace={workspace}>
      <div className="app-shell tenant-shell">
        <a className="skip-link" href="#main-content">Skip to content</a>
        <AppHeader organisationName={workspace.organisation.name} userName={workspace.activeUser?.name} mobileNavigation={<MobileNavigation sections={tenantNavigation} orgSlug={orgSlug} workspace={workspace} />} copilot={isAdmin ? undefined : <CopilotDrawer />} />
        <aside className="sidebar" aria-label="Primary navigation">
          <NavigationList sections={tenantNavigation} orgSlug={orgSlug} />
          <OrganisationCard workspace={workspace} />
        </aside>
        <div className="workspace"><PlatformSupportBanner orgSlug={orgSlug} />{isAdmin ? <div className="admin-context-strip"><strong>Organisation workspace</strong><span>· {workspace.organisation.reportingCurrency} reporting</span><span>{workspace.organisation.timeZone}</span></div> : <ContextBar />}<main id="main-content" className="main-content">{!isAdmin ? <FinancialDisclosureNotice /> : null}{children}</main></div>
        <PrototypeTools />
      </div>
    </AnalysisContextProvider>
  );
}

export function TenantShell({ orgSlug, children }: { orgSlug: string; children: React.ReactNode }) {
  return <Suspense fallback={<PageSkeleton />}><TenantShellContent orgSlug={orgSlug}>{children}</TenantShellContent></Suspense>;
}
