import type { MarketplaceSetupRepository, ConnectMarketplaceInput } from '@/src/services/onboarding-contracts';
import type { ScenarioId } from '@/src/fixtures/scenarios';
import { mockDelay } from '@/src/services/mock/mock-delay';
import {
  MockOnboardingStore,
  OnboardingServiceError,
  mockOnboardingStore,
  requireOrganisationId,
} from '@/src/services/mock/onboarding-store';

const MARKETPLACE_LABELS = {
  amazon: 'Amazon',
  ebay: 'eBay',
  temu: 'Temu',
} as const;

function applyScenario<T extends { marketplace: string; status: string; authenticationStatus: string; connectionStatus: string }>(account: T, scenarioId?: ScenarioId): T {
  if (scenarioId === 'amazon-delayed' && account.marketplace === 'amazon') {
    return { ...account, status: 'delayed', connectionStatus: 'connected' };
  }
  if (scenarioId === 'ebay-auth-failed' && account.marketplace === 'ebay') {
    return { ...account, status: 'authentication_required', authenticationStatus: 'required', connectionStatus: 'failed' };
  }
  if (scenarioId === 'temu-import-running' && account.marketplace === 'temu') {
    return { ...account, status: 'syncing' };
  }
  return account;
}

export class MockMarketplaceSetupRepository implements MarketplaceSetupRepository {
  constructor(private readonly store: MockOnboardingStore = mockOnboardingStore) {}

  async list(sessionId: string, scenarioId?: ScenarioId, signal?: AbortSignal) {
    await mockDelay(260, signal);
    const state = this.store.read();
    const organisationId = requireOrganisationId(state, sessionId);
    if (scenarioId === 'no-marketplace') return [];
    return Object.values(state.marketplaceAccounts)
      .filter((account) => account.organisationId === organisationId)
      .map((account) => applyScenario(account, scenarioId));
  }

  async connect(input: ConnectMarketplaceInput, signal?: AbortSignal) {
    const accountId = this.store.createId('acct');
    this.store.transaction((draft) => {
      const organisationId = requireOrganisationId(draft, input.sessionId);
      const company = draft.companies[input.companyId];
      if (!company || company.organisationId !== organisationId) {
        throw new OnboardingServiceError('validation', 'Choose a company in this organisation.');
      }
      if (!input.displayName.trim() || !input.regionCode.trim()) {
        throw new OnboardingServiceError('validation', 'Enter the store name and region.');
      }
      draft.marketplaceAccounts[accountId] = {
        id: accountId,
        organisationId,
        companyId: input.companyId,
        marketplace: input.marketplace,
        displayName: input.displayName.trim(),
        regionCode: input.regionCode.trim().toUpperCase(),
        connectionStatus: 'connecting',
        authenticationStatus: 'required',
        connectedAt: null,
        status: 'pending',
        lastSuccessfulSyncAt: null,
      };
    });

    await mockDelay(840, signal);
    const result = this.store.transaction((draft) => {
      const account = draft.marketplaceAccounts[accountId];
      if (!account) throw new OnboardingServiceError('not_found', 'The marketplace connection could not be found.');
      if (input.outcome === 'failed') {
        account.connectionStatus = 'failed';
        account.authenticationStatus = 'rejected';
        account.status = 'failed';
      } else if (input.outcome === 'authentication_required') {
        account.connectionStatus = 'failed';
        account.authenticationStatus = 'required';
        account.status = 'authentication_required';
      } else {
        account.connectionStatus = 'connected';
        account.authenticationStatus = 'authorised';
        account.status = 'connected';
        account.connectedAt = this.store.nowIso();
      }
      return account;
    });
    if (result.connectionStatus === 'failed') {
      const marketplaceLabel = MARKETPLACE_LABELS[result.marketplace];
      throw new OnboardingServiceError(
        result.authenticationStatus === 'required' ? 'authentication_required' : 'processing_failed',
        result.authenticationStatus === 'required'
          ? `${marketplaceLabel} authorisation was not granted. Reconnect the account to continue.`
          : `${marketplaceLabel} rejected this test connection. Review the account details and retry.`,
      );
    }
    return result;
  }

  async retry(sessionId: string, marketplaceAccountId: string, signal?: AbortSignal) {
    this.store.transaction((draft) => {
      const organisationId = requireOrganisationId(draft, sessionId);
      const account = draft.marketplaceAccounts[marketplaceAccountId];
      if (!account || account.organisationId !== organisationId) throw new OnboardingServiceError('not_found', 'The marketplace account could not be found.');
      account.connectionStatus = 'connecting';
      account.status = 'retrying';
    });
    await mockDelay(760, signal);
    return this.store.transaction((draft) => {
      const account = draft.marketplaceAccounts[marketplaceAccountId];
      if (!account) throw new OnboardingServiceError('not_found', 'The marketplace account could not be found.');
      account.connectionStatus = 'connected';
      account.authenticationStatus = 'authorised';
      account.status = 'connected';
      account.connectedAt ??= this.store.nowIso();
      return account;
    });
  }

  async disconnect(sessionId: string, marketplaceAccountId: string, signal?: AbortSignal) {
    await mockDelay(380, signal);
    this.store.transaction((draft) => {
      const organisationId = requireOrganisationId(draft, sessionId);
      const account = draft.marketplaceAccounts[marketplaceAccountId];
      if (!account || account.organisationId !== organisationId) throw new OnboardingServiceError('not_found', 'The marketplace account could not be found.');
      const sync = draft.syncs[organisationId];
      if (sync?.accounts.some((item) => item.marketplaceAccountId === marketplaceAccountId)) {
        throw new OnboardingServiceError('dependency', 'This account has historical sync data and cannot be disconnected during onboarding.');
      }
      delete draft.marketplaceAccounts[marketplaceAccountId];
    });
  }
}
