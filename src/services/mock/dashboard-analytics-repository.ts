import { expenseAttention } from '@/src/services/analytics/expense-attention';
import { financialDisclosureAllowed, redactFinancialDisclosure } from '@/src/services/mappers/financial-disclosure';
import type { DashboardAnalytics, DashboardRepositoryInput } from '@/src/domain/analytics';
import type { CogsImportBatch } from '@/src/domain/cogs';
import { generateAnalyticsDataset, stableHash } from '@/src/fixtures/analytics-data';
import type { DashboardAnalyticsRepository } from '@/src/services/contracts';
import { aggregateDashboardAnalytics } from '@/src/services/analytics/analytics-aggregation';
import { materializeApprovedCogsDataset } from '@/src/services/mock/cogs-dataset';
import { mockCogsManagementStore, organisationCogsState } from '@/src/services/mock/cogs-management-store';

const APPROVAL_STATUSES = new Set<CogsImportBatch['status']>(['ready-for-approval', 'awaiting-approval']);
const REVIEW_STATUSES = new Set<CogsImportBatch['status']>(['needs-review', 'failed']);

function plural(value: number, singular: string, pluralValue = `${singular}s`) {
  return value === 1 ? singular : pluralValue;
}

function reconcileCogsAttention(analytics: DashboardAnalytics, input: DashboardRepositoryInput): DashboardAnalytics {
  const organisationState = organisationCogsState(mockCogsManagementStore.read(), input.organisation.id);
  const allBatches = Object.values(organisationState.batches);
  const visibleBatches = allBatches.filter((batch) => input.authorisedCompanyIds.includes(batch.companyId));
  const approvalBatches = visibleBatches.filter((batch) => APPROVAL_STATUSES.has(batch.status));
  const reviewBatches = visibleBatches.filter((batch) => REVIEW_STATUSES.has(batch.status));
  const scenarioMarker = `scenario:${input.scenarioId}`;
  const scenarioBatchId = `cogs-imp-${input.scenarioId}`;
  const persistedScenarioBatch = allBatches.some((batch) => batch.id === scenarioBatchId || batch.note === scenarioMarker);

  const approvalRows = approvalBatches.reduce((count, batch) => count + batch.rows.filter((row) => row.reviewStatus === 'accepted' && !row.anomalies.some((anomaly) => anomaly.blocking)).length, 0);
  const reviewRows = reviewBatches.reduce((count, batch) => count + batch.rows.filter((row) => row.reviewStatus !== 'rejected' && (row.reviewStatus !== 'accepted' || row.anomalies.some((anomaly) => anomaly.blocking))).length, 0);
  const blockingRows = reviewBatches.reduce((count, batch) => count + batch.rows.filter((row) => row.reviewStatus !== 'rejected' && row.anomalies.some((anomaly) => anomaly.blocking)).length, 0);
  const failedBatches = reviewBatches.filter((batch) => batch.status === 'failed');

  const approvalItem = approvalBatches.length ? {
    id: 'cogs-approval',
    title: approvalRows
      ? `${approvalRows.toLocaleString('en-GB')} COGS ${plural(approvalRows, 'change')} need approval`
      : `${approvalBatches.length.toLocaleString('en-GB')} COGS ${plural(approvalBatches.length, 'batch', 'batches')} need approval`,
    detail: `${approvalBatches.length.toLocaleString('en-GB')} active ${plural(approvalBatches.length, 'batch', 'batches')}; only an authorised approval applies these costs.`,
    severity: 'medium' as const,
    href: `/o/${input.organisation.slug}/cogs?status=pending_approval`,
    scope: 'organisation' as const,
  } : null;

  const reviewItem = reviewBatches.length ? {
    id: 'import-errors',
    title: failedBatches.length
      ? `${failedBatches.length.toLocaleString('en-GB')} cost ${plural(failedBatches.length, 'import')} failed`
      : reviewRows
        ? `${reviewRows.toLocaleString('en-GB')} cost import ${plural(reviewRows, 'row')} need review`
        : `${reviewBatches.length.toLocaleString('en-GB')} cost ${plural(reviewBatches.length, 'import')} ${reviewBatches.length === 1 ? 'needs' : 'need'} review`,
    detail: failedBatches.length
      ? 'The atomic apply was rolled back; no costs from the failed batch were committed.'
      : blockingRows
        ? `${blockingRows.toLocaleString('en-GB')} blocking ${plural(blockingRows, 'row')} across ${reviewBatches.length.toLocaleString('en-GB')} active ${plural(reviewBatches.length, 'import')}.`
        : `Unresolved matches or warnings remain across ${reviewBatches.length.toLocaleString('en-GB')} active ${plural(reviewBatches.length, 'import')}.`,
    severity: failedBatches.length ? 'high' as const : 'medium' as const,
    href: `/o/${input.organisation.slug}/cogs/import?view=history`,
    scope: 'organisation' as const,
  } : null;

  const withoutReconciledItems = analytics.attention.filter((item) => {
    if (item.id === 'cogs-approval') return !approvalItem && !persistedScenarioBatch;
    if (item.id === 'import-errors') return !reviewItem && !persistedScenarioBatch;
    return true;
  });
  const reconciledItems = [approvalItem, reviewItem].filter((item): item is NonNullable<typeof item> => Boolean(item));
  if (!reconciledItems.length) return { ...analytics, attention: withoutReconciledItems };
  const lossIndex = withoutReconciledItems.findIndex((item) => item.id === 'losses');
  const insertAt = lossIndex < 0 ? withoutReconciledItems.length : lossIndex;
  const attention = [...withoutReconciledItems];
  attention.splice(insertAt, 0, ...reconciledItems);
  return { ...analytics, attention: attention.slice(0, 5) };
}

function delay(key: string, signal?: AbortSignal) {
  const duration = 480 + (stableHash(key) % 220);
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, duration);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Request aborted', 'AbortError'));
    }, { once: true });
  });
}

export class MockDashboardAnalyticsRepository implements DashboardAnalyticsRepository {
  private readonly datasets = new Map<string, ReturnType<typeof generateAnalyticsDataset>>();

  async getDashboard(input: DashboardRepositoryInput, signal?: AbortSignal): Promise<DashboardAnalytics> {
    await delay(JSON.stringify({ context: input.context, scenarioId: input.scenarioId }), signal);
    if (input.scenarioId === 'repository-error') throw new Error('The profitability analytics request failed.');
    const shapeKey = JSON.stringify({
      organisationId: input.organisation.id,
      companies: input.companies.map((company) => company.id),
      accounts: input.marketplaceAccounts.map((account) => [account.id, account.status]),
    });
    let dataset = this.datasets.get(shapeKey);
    if (!dataset) {
      dataset = generateAnalyticsDataset({
        organisation: input.organisation,
        companies: input.companies,
        marketplaceAccounts: input.marketplaceAccounts,
      });
      this.datasets.set(shapeKey, dataset);
    }
    const materialized = materializeApprovedCogsDataset(dataset, input.organisation.id);
    const analytics = aggregateDashboardAnalytics(materialized, input);
    const unallocated = expenseAttention(materialized, input);
    if (unallocated) analytics.attention = [unallocated, ...analytics.attention.filter(item => item.id !== unallocated.id)].slice(0, 5);
    return redactFinancialDisclosure(reconcileCogsAttention(analytics, input), financialDisclosureAllowed(input));
  }
}
