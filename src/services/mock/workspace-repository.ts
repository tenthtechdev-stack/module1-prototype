import { workspaceFixtures } from '@/src/fixtures/data';
import type { WorkspaceRepository, WorkspaceSnapshot } from '@/src/services/contracts';
import type { ScenarioId } from '@/src/fixtures/scenarios';
import { getScenarioRuntime } from '@/src/fixtures/scenarios';
import { MockOnboardingStore, mockOnboardingStore } from '@/src/services/mock/onboarding-store';

function delay(signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, 320);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Request aborted', 'AbortError'));
    }, { once: true });
  });
}

export class MockWorkspaceRepository implements WorkspaceRepository {
  constructor(private readonly onboardingStore: MockOnboardingStore = mockOnboardingStore) {}

  async getByOrganisationSlug(orgSlug: string, scenarioId: ScenarioId, signal?: AbortSignal): Promise<WorkspaceSnapshot | null> {
    await delay(signal);

    const staticFixture = workspaceFixtures.find((workspace) => workspace.organisation.slug === orgSlug);
    const persistedWorkspace = staticFixture ? null : this.onboardingStore.findWorkspaceBySlug(orgSlug);
    const fixture = staticFixture ? {
      organisation: staticFixture.organisation,
      subscription: staticFixture.subscription,
      moduleEntitlements: staticFixture.moduleEntitlements,
      companies: staticFixture.companies,
      marketplaceAccounts: staticFixture.marketplaceAccounts,
      users: staticFixture.users,
      activeUser: null,
      cogsReadiness: null,
    } : persistedWorkspace ? {
      organisation: persistedWorkspace.organisation,
      subscription: persistedWorkspace.subscription,
      moduleEntitlements: persistedWorkspace.entitlements,
      companies: persistedWorkspace.companies,
      marketplaceAccounts: persistedWorkspace.marketplaceAccounts,
      users: persistedWorkspace.users,
      activeUser: persistedWorkspace.activeUser,
      cogsReadiness: persistedWorkspace.cogsReadiness,
    } : null;
    if (!fixture) return null;

    const runtime = getScenarioRuntime(scenarioId);
    const scenarioAccounts = runtime.accountMode === 'none' ? [] : fixture.marketplaceAccounts.map((account, index) => {
      if (scenarioId === 'first-sync' && index === 0) return { ...account, status: 'syncing' as const };
      if (scenarioId === 'amazon-delayed' && account.marketplace === 'amazon') return { ...account, status: 'delayed' as const };
      if (scenarioId === 'ebay-auth-failed' && account.marketplace === 'ebay') return { ...account, status: 'authentication_required' as const };
      if (scenarioId === 'temu-import-running' && account.marketplace === 'temu') return { ...account, status: 'syncing' as const };
      return { ...account };
    });
    const scenarioCogsReadiness = fixture.cogsReadiness ? (() => {
      const productsImported = fixture.cogsReadiness.productsImported;
      const cogsComplete = runtime.cogsMode === 'none'
        ? 0
        : runtime.cogsMode === 'partial'
          ? Math.round(productsImported * 0.64)
          : fixture.cogsReadiness.cogsComplete;
      return {
        productsImported,
        cogsComplete,
        cogsMissing: Math.max(0, productsImported - cogsComplete),
        coveragePercent: productsImported ? Math.round((cogsComplete / productsImported) * 100) : 0,
        reliableProfitability: productsImported > 0 && cogsComplete === productsImported,
      };
    })() : null;

    return {
      organisation: { ...fixture.organisation },
      subscription: { ...fixture.subscription, status: runtime.subscriptionStatus },
      entitlements: fixture.moduleEntitlements.map((entitlement) => ({
        ...entitlement,
        enabled: entitlement.enabled && runtime.entitlements.has(entitlement.moduleKey),
      })),
      companies: fixture.companies.map((company) => ({ ...company })),
      marketplaceAccounts: scenarioAccounts,
      users: fixture.users.map((user) => ({
        ...user,
        companyIds: user.companyIds === 'all' ? 'all' : [...user.companyIds],
        marketplaceAccountIds: user.marketplaceAccountIds === 'all' ? 'all' : [...user.marketplaceAccountIds],
      })),
      activeUser: fixture.activeUser ? {
        ...fixture.activeUser,
        companyIds: fixture.activeUser.companyIds === 'all' ? 'all' : [...fixture.activeUser.companyIds],
        marketplaceAccountIds: fixture.activeUser.marketplaceAccountIds === 'all' ? 'all' : [...fixture.activeUser.marketplaceAccountIds],
      } : null,
      cogsReadiness: scenarioCogsReadiness,
    };
  }
}
