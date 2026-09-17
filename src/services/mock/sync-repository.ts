import type { Marketplace, SyncStatus } from '@/src/domain/models';
import { SYNC_DATASETS, type InitialSyncProgress, type MarketplaceSyncProgress, type SyncDataset, type SyncDatasetProgress } from '@/src/domain/onboarding';
import type { ScenarioId } from '@/src/fixtures/scenarios';
import type { InitialSyncRepository } from '@/src/services/onboarding-contracts';
import { mockDelay } from '@/src/services/mock/mock-delay';
import {
  MockOnboardingStore,
  OnboardingServiceError,
  mockOnboardingStore,
  requireOrganisationId,
} from '@/src/services/mock/onboarding-store';

const DATASET_STAGE_MS = 1_250;
const DATASET_RUN_MS = 1_600;

interface DatasetFailurePlan {
  code: string;
  message: string;
  importedFraction: number;
}

const TOTALS: Record<Marketplace, Record<SyncDataset, number>> = {
  amazon: { products: 2480, orders: 18920, transactions: 34771, fees: 22840, refunds: 1127, advertising: 4380 },
  ebay: { products: 910, orders: 4322, transactions: 7816, fees: 4012, refunds: 196, advertising: 0 },
  temu: { products: 392, orders: 1864, transactions: 3205, fees: 1738, refunds: 74, advertising: 486 },
};

const INITIAL_SYNC_FAILURES: Partial<Record<Marketplace, Partial<Record<SyncDataset, DatasetFailurePlan>>>> = {
  amazon: {
    fees: {
      code: 'provider_page_failed',
      message: 'Amazon returned a temporary error while importing marketplace fees. Previously imported fee records remain available.',
      importedFraction: 0.72,
    },
  },
};

function datasetSeed(dataset: SyncDataset, totalRecords: number): SyncDatasetProgress {
  return {
    dataset,
    status: 'pending',
    recordsImported: 0,
    totalRecords,
    startedAt: null,
    completedAt: null,
    lastSuccessfulSyncAt: null,
    retryStartedAt: null,
    error: null,
  };
}

function deriveDataset(
  dataset: SyncDatasetProgress,
  index: number,
  syncStartedAt: string,
  nowMs: number,
  failurePlan?: DatasetFailurePlan,
): SyncDatasetProgress {
  const result = { ...dataset, error: dataset.error ? { ...dataset.error } : null };
  const baseMs = Date.parse(syncStartedAt);
  const startsAt = baseMs + index * DATASET_STAGE_MS;
  if (result.retryStartedAt) {
    const retryElapsed = nowMs - Date.parse(result.retryStartedAt);
    if (retryElapsed < 1_200) {
      result.status = 'retrying';
      result.startedAt ??= new Date(startsAt).toISOString();
      result.recordsImported = Math.min(result.totalRecords, Math.round(result.totalRecords * Math.max(failurePlan?.importedFraction ?? 0.08, retryElapsed / 1_200)));
      if (failurePlan) result.lastSuccessfulSyncAt ??= new Date(startsAt + Math.round(DATASET_RUN_MS * failurePlan.importedFraction)).toISOString();
      return result;
    }
    result.status = 'synced';
    result.recordsImported = result.totalRecords;
    result.completedAt = new Date(Date.parse(result.retryStartedAt) + 1_200).toISOString();
    result.lastSuccessfulSyncAt = result.completedAt;
    result.error = null;
    return result;
  }
  if (result.status === 'failed' || result.status === 'delayed' || result.status === 'authentication_required') return result;

  const elapsed = nowMs - startsAt;
  if (elapsed < 0) {
    result.status = 'pending';
    result.recordsImported = 0;
    return result;
  }
  result.startedAt = new Date(startsAt).toISOString();
  if (elapsed < DATASET_RUN_MS) {
    result.status = 'syncing';
    result.recordsImported = Math.min(result.totalRecords, Math.round(result.totalRecords * (elapsed / DATASET_RUN_MS)));
    return result;
  }
  if (failurePlan) {
    result.status = 'failed';
    result.recordsImported = Math.round(result.totalRecords * failurePlan.importedFraction);
    result.completedAt = null;
    result.lastSuccessfulSyncAt = new Date(startsAt + Math.round(DATASET_RUN_MS * failurePlan.importedFraction)).toISOString();
    result.error = { code: failurePlan.code, message: failurePlan.message, retryable: true };
    return result;
  }
  const completedAt = new Date(startsAt + DATASET_RUN_MS).toISOString();
  result.status = 'synced';
  result.recordsImported = result.totalRecords;
  result.completedAt = completedAt;
  result.lastSuccessfulSyncAt = completedAt;
  return result;
}

function aggregateStatus(datasets: SyncDatasetProgress[]): SyncStatus {
  if (datasets.some((item) => item.status === 'authentication_required')) return 'authentication_required';
  if (datasets.some((item) => item.status === 'failed')) return 'failed';
  if (datasets.some((item) => item.status === 'delayed')) return 'delayed';
  if (datasets.some((item) => item.status === 'retrying')) return 'retrying';
  if (datasets.every((item) => item.status === 'synced')) return 'synced';
  if (datasets.some((item) => item.status === 'syncing')) return 'syncing';
  return 'pending';
}

function scenarioDatasets(progress: MarketplaceSyncProgress, scenarioId: ScenarioId): MarketplaceSyncProgress {
  const datasets = progress.datasets.map((dataset) => ({ ...dataset, error: dataset.error ? { ...dataset.error } : null }));
  if (scenarioId === 'amazon-delayed' && progress.marketplace === 'amazon') {
    const fees = datasets.find((item) => item.dataset === 'fees');
    if (fees && !fees.retryStartedAt) {
      fees.status = 'delayed';
      fees.error = { code: 'marketplace_delayed', message: 'Amazon Fees are delayed. Last successful sync was 2 hours ago.', retryable: true };
    }
  }
  if (scenarioId === 'ebay-auth-failed' && progress.marketplace === 'ebay') {
    for (const dataset of datasets) {
      if (dataset.status !== 'synced') dataset.status = 'authentication_required';
      dataset.error = { code: 'authentication_expired', message: 'eBay authorisation is required.', retryable: false };
    }
  }
  if (scenarioId === 'temu-import-running' && progress.marketplace === 'temu') {
    const transactions = datasets.find((item) => item.dataset === 'transactions');
    if (transactions) {
      transactions.status = 'syncing';
      transactions.recordsImported = Math.round(transactions.totalRecords * 0.68);
      transactions.completedAt = null;
    }
    for (const dataset of datasets.slice(3)) {
      dataset.status = 'pending';
      dataset.recordsImported = 0;
      dataset.completedAt = null;
    }
  }
  if (scenarioId === 'first-sync' && progress.marketplace === 'amazon') {
    const fees = datasets.find((item) => item.dataset === 'fees');
    const advertising = datasets.find((item) => item.dataset === 'advertising');
    if (fees && !fees.retryStartedAt) {
      fees.status = 'syncing';
      fees.recordsImported = Math.round(fees.totalRecords * 0.44);
      fees.completedAt = null;
    }
    if (advertising) {
      advertising.status = 'pending';
      advertising.recordsImported = 0;
      advertising.completedAt = null;
    }
  }
  const total = datasets.reduce((sum, item) => sum + item.totalRecords, 0);
  const imported = datasets.reduce((sum, item) => sum + item.recordsImported, 0);
  return { ...progress, datasets, status: aggregateStatus(datasets), progressPercent: total ? Math.round((imported / total) * 100) : 100 };
}

export class MockInitialSyncRepository implements InitialSyncRepository {
  constructor(private readonly store: MockOnboardingStore = mockOnboardingStore) {}

  async start(sessionId: string, signal?: AbortSignal): Promise<InitialSyncProgress> {
    await mockDelay(460, signal);
    this.store.transaction((draft) => {
      const organisationId = requireOrganisationId(draft, sessionId);
      const accounts = Object.values(draft.marketplaceAccounts).filter((account) => account.organisationId === organisationId && account.connectionStatus === 'connected');
      if (!accounts.length) throw new OnboardingServiceError('prerequisite', 'Connect at least one marketplace account before starting sync.');
      if (!draft.syncs[organisationId]) {
        const startedAt = this.store.nowIso();
        draft.syncs[organisationId] = {
          organisationId,
          startedAt,
          accounts: accounts.map((account) => ({
            marketplaceAccountId: account.id,
            startedAt,
            datasets: SYNC_DATASETS.map((dataset) => datasetSeed(dataset, TOTALS[account.marketplace][dataset])),
          })),
        };
        for (const account of accounts) account.status = 'syncing';
      }
    });
    return this.getProgress(sessionId, 'healthy', signal);
  }

  async getProgress(sessionId: string, scenarioId: ScenarioId, signal?: AbortSignal): Promise<InitialSyncProgress> {
    await mockDelay(180, signal);
    if (scenarioId === 'repository-error') throw new Error('The mock sync service is unavailable.');
    const state = this.store.read();
    const organisationId = requireOrganisationId(state, sessionId);
    const persisted = state.syncs[organisationId];
    const nowIso = this.store.nowIso();
    if (!persisted || scenarioId === 'no-marketplace') {
      return { organisationId, status: 'pending', progressPercent: 0, canContinue: false, startedAt: null, updatedAt: nowIso, accounts: [], imported: { products: 0, listings: 0, orders: 0, transactions: 0 } };
    }
    const nowMs = Date.parse(nowIso);
    const accounts = persisted.accounts.map((persistedAccount) => {
      const account = state.marketplaceAccounts[persistedAccount.marketplaceAccountId];
      if (!account) return null;
      const datasets = persistedAccount.datasets.map((dataset, index) => deriveDataset(
        dataset,
        index,
        persistedAccount.startedAt,
        nowMs,
        INITIAL_SYNC_FAILURES[account.marketplace]?.[dataset.dataset],
      ));
      const total = datasets.reduce((sum, item) => sum + item.totalRecords, 0);
      const imported = datasets.reduce((sum, item) => sum + item.recordsImported, 0);
      return scenarioDatasets({
        marketplaceAccountId: account.id,
        marketplace: account.marketplace,
        status: aggregateStatus(datasets),
        progressPercent: total ? Math.round((imported / total) * 100) : 100,
        startedAt: persistedAccount.startedAt,
        updatedAt: nowIso,
        datasets,
      }, scenarioId);
    }).filter((item): item is MarketplaceSyncProgress => item !== null);
    const allDatasets = accounts.flatMap((account) => account.datasets);
    const total = allDatasets.reduce((sum, item) => sum + item.totalRecords, 0);
    const recordsImported = allDatasets.reduce((sum, item) => sum + item.recordsImported, 0);
    const progressPercent = total ? Math.round((recordsImported / total) * 100) : 0;
    const products = Math.max(0, ...accounts.map((account) => account.datasets.find((item) => item.dataset === 'products')?.recordsImported ?? 0));
    const listings = accounts.reduce((sum, account) => sum + (account.datasets.find((item) => item.dataset === 'products')?.recordsImported ?? 0), 0);
    const orders = accounts.reduce((sum, account) => sum + (account.datasets.find((item) => item.dataset === 'orders')?.recordsImported ?? 0), 0);
    const transactions = accounts.reduce((sum, account) => sum + (account.datasets.find((item) => item.dataset === 'transactions')?.recordsImported ?? 0), 0);
    const status = aggregateStatus(allDatasets);

    if (products > (state.cogs[organisationId]?.importedProductCount ?? 0) || scenarioId === 'healthy') {
      this.store.transaction((draft) => {
        const cogs = draft.cogs[organisationId];
        if (cogs && products > cogs.importedProductCount) cogs.importedProductCount = products;
        if (scenarioId === 'healthy') {
          for (const progress of accounts) {
            const account = draft.marketplaceAccounts[progress.marketplaceAccountId];
            if (!account) continue;
            account.status = progress.status;
            if (progress.status === 'synced') {
              account.lastSuccessfulSyncAt = progress.datasets
                .map((dataset) => dataset.lastSuccessfulSyncAt)
                .filter((value): value is string => Boolean(value))
                .sort()
                .at(-1) ?? account.lastSuccessfulSyncAt;
            }
          }
        }
      });
    }

    return {
      organisationId,
      status,
      progressPercent,
      canContinue: products > 0,
      startedAt: persisted.startedAt,
      updatedAt: nowIso,
      accounts,
      imported: { products, listings, orders, transactions },
    };
  }

  async retryDataset(sessionId: string, marketplaceAccountId: string, dataset: SyncDataset, signal?: AbortSignal) {
    await mockDelay(300, signal);
    this.store.transaction((draft) => {
      const organisationId = requireOrganisationId(draft, sessionId);
      const sync = draft.syncs[organisationId];
      const account = sync?.accounts.find((item) => item.marketplaceAccountId === marketplaceAccountId);
      const datasetProgress = account?.datasets.find((item) => item.dataset === dataset);
      if (!datasetProgress) throw new OnboardingServiceError('not_found', 'The sync dataset could not be found.');
      datasetProgress.status = 'retrying';
      datasetProgress.retryStartedAt = this.store.nowIso();
      datasetProgress.error = null;
    });
    return this.getProgress(sessionId, 'healthy', signal);
  }
}
