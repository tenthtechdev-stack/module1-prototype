import type { AnalyticsDataset, DashboardRepositoryInput } from '@/src/domain/analytics';
import {
  COGS_TODAY,
  LARGE_COGS_CHANGE_BPS,
  buildCogsImportRows,
  canonicalRecordsFromHistory,
  cogsSourceLabel,
  cogsChangeBps,
  deterministicImportSignature,
  detectCogsColumnMapping,
  importRowReady,
  insertApprovedCogsRecord,
  previewApprovedCogsInsertion,
  reconcileCogsImportRowTimelines,
  resolveCurrentCogsRecord,
  summariseImportRows,
  titleSimilarity,
  type CogsActor,
  type CogsColumnMapping,
  type CogsImportBatch,
  type CogsImportAnomaly,
  type CogsImportRow,
  type CogsWorkspaceRow,
} from '@/src/domain/cogs';
import type { AuditEvent, COGSRecord, COGSSource, Product } from '@/src/domain/models';
import { resolveProductCogs as resolveProductGroupAwareCogs } from '@/src/domain/product-groups';
import { generateAnalyticsDataset, stableHash } from '@/src/fixtures/analytics-data';
import { aggregateDashboardAnalytics } from '@/src/services/analytics/analytics-aggregation';
import { aggregateProductPage } from '@/src/services/analytics/product-aggregation';
import type {
  CogsRepository,
  CogsWorkspaceQuery,
  CreateCogsImportInput,
  CreateCogsProposalBatchInput,
} from '@/src/services/contracts';
import { materializeApprovedCogsDataset } from '@/src/services/mock/cogs-dataset';
import { mockProductGroupsRepository } from '@/src/services/mock/product-groups-repository';
import { mockProductGroupsStore, organisationProductGroupsState } from '@/src/services/mock/product-groups-store';
import {
  mockCogsManagementStore,
  organisationCogsState,
  type CogsManagementState,
} from '@/src/services/mock/cogs-management-store';

const SOURCE_BY_FILE_TYPE: Record<CogsImportBatch['fileType'], COGSSource> = {
  csv: 'csv-import',
  xlsx: 'excel-import',
  paste: 'paste',
  bulk: 'bulk-edit',
  single: 'single-edit',
  percentage: 'percentage-adjustment',
};

function wait(key: string, signal?: AbortSignal) {
  const duration = 120 + stableHash(key) % 121;
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, duration);
    signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Request aborted', 'AbortError')); }, { once: true });
  });
}

function nowIso() {
  return new Date().toISOString();
}

function nextId(draft: CogsManagementState, prefix: string, now: string) {
  draft.sequence += 1;
  return `${prefix}-${now.replace(/[-:.TZ]/g, '').slice(0, 14)}-${String(draft.sequence).padStart(4, '0')}`;
}

function companyName(input: DashboardRepositoryInput, companyId: string) {
  return input.companies.find((company) => company.id === companyId)?.name ?? companyId;
}

function ensureCompanyAccess(input: DashboardRepositoryInput, companyId: string) {
  const company = input.companies.find((candidate) => candidate.id === companyId && candidate.organisationId === input.organisation.id);
  if (!company) throw new Error('The selected Company does not belong to this Organisation.');
  if (!input.authorisedCompanyIds.includes(companyId)) throw new Error('The selected Company is outside your assignment.');
  return company;
}

function ensurePreparationAccess(actor: CogsActor) {
  if (!actor.permissions.edit && !actor.permissions.import) throw new Error('Your role cannot prepare COGS changes.');
}

function ensureEditAccess(actor: CogsActor) {
  if (!actor.permissions.edit) throw new Error('Your role cannot edit COGS.');
}

function ensureImportAccess(actor: CogsActor) {
  if (!actor.permissions.import) throw new Error('Your role cannot import COGS files.');
}

function ensureMutableBatch(batch: CogsImportBatch) {
  if (batch.status === 'applied' || batch.status === 'cancelled') throw new Error('Applied or cancelled imports are immutable. Create a new effective-dated correction instead.');
}

function datasetKey(input: DashboardRepositoryInput) {
  return JSON.stringify({
    organisationId: input.organisation.id,
    companies: input.companies.map((company) => company.id),
    accounts: input.marketplaceAccounts.map((account) => [account.id, account.companyId, account.marketplace, account.status]),
  });
}

function productQuery(input: DashboardRepositoryInput, overrides: Partial<CogsWorkspaceQuery> = {}) {
  return {
    ...input,
    search: overrides.search ?? '',
    cogsStatus: overrides.status === 'pending_approval' ? 'all' : overrides.status ?? 'all',
    listingStatus: 'all' as const,
    profitabilityStatus: 'all' as const,
    categories: [],
    sorting: [{ field: 'product' as const, direction: 'asc' as const }],
    page: 0,
    pageSize: 5_000,
  };
}

function activeHistoryForProduct(dataset: AnalyticsDataset, input: DashboardRepositoryInput, product: Product) {
  const stored = organisationCogsState(mockCogsManagementStore.read(), input.organisation.id).recordsByProduct[product.id];
  if (stored) return stored.map((record) => ({ ...record }));
  const hasGroupMembership = Object.values(organisationProductGroupsState(mockProductGroupsStore.read(), input.organisation.id).membershipsByGroup)
    .flat()
    .some((membership) => membership.productId === product.id && membership.status === 'active');
  if (hasGroupMembership) return [];
  return canonicalRecordsFromHistory({
    organisationId: input.organisation.id,
    companyId: product.ownerCompanyId,
    productId: product.id,
    history: dataset.cogsHistory.filter((rate) => rate.productId === product.id),
  });
}

function attachGroupOverrideWarnings(
  input: DashboardRepositoryInput,
  rows: CogsImportRow[],
) {
  const state = organisationProductGroupsState(mockProductGroupsStore.read(), input.organisation.id);
  const memberships = Object.values(state.membershipsByGroup).flat();
  const costs = Object.values(state.costRecordsByGroup).flat();
  return rows.map((source) => {
    const anomalies = source.anomalies.filter((item) => item.code !== 'group_inheritance_override');
    const clear = () => ({
      ...source,
      anomalies,
      inheritedGroupId: undefined,
      inheritedGroupName: undefined,
      inheritedMembershipId: undefined,
      inheritedGroupCostRecordId: undefined,
      inheritedPackQuantity: undefined,
      inheritedBaseQuantity: undefined,
      inheritedBaseCostMinor: undefined,
      groupOverrideAcknowledged: undefined,
    });
    if (!source.proposedProductId || !source.proposedEffectiveDate) return clear();
    // Product identity and Company scope were already established by the
    // deterministic matcher. Resolve only records inside the active tenant.
    const resolution = resolveProductGroupAwareCogs({
      directHistory: organisationCogsState(mockCogsManagementStore.read(), input.organisation.id).recordsByProduct[source.proposedProductId] ?? [],
      groupCostHistory: costs,
      membershipHistory: memberships,
      date: source.proposedEffectiveDate,
      productId: source.proposedProductId,
      organisationId: input.organisation.id,
    });
    if (resolution.source !== 'inherited') return clear();
    const group = state.groups[resolution.membership.groupId];
    if (!group || !input.authorisedCompanyIds.includes(group.companyId)) return clear();
    const sameReviewedSource = source.inheritedGroupId === group.id
      && source.inheritedMembershipId === resolution.membership.id
      && source.inheritedGroupCostRecordId === resolution.groupCost.id
      && source.inheritedPackQuantity === resolution.membership.packQuantity
      && source.inheritedBaseQuantity === resolution.groupCost.baseQuantity
      && source.inheritedBaseCostMinor === resolution.groupCost.baseCostMinor;
    const warning: CogsImportAnomaly = {
      code: 'group_inheritance_override',
      label: 'Group inheritance override',
      detail: `This Product currently inherits COGS from “${group.name}”. Applying an individual Product cost will override Group inheritance from the selected effective date.`,
      severity: 'warning',
      blocking: false,
    };
    const nextAnomalies = [...anomalies];
    const change = cogsChangeBps(resolution.unitCostMinor, source.proposedUnitCostMinor);
    if (change !== null && !nextAnomalies.some((item) => item.code === 'large_increase') && change > LARGE_COGS_CHANGE_BPS) {
      nextAnomalies.push({ code: 'large_increase', label: 'Large cost increase', detail: `The proposed cost is ${(change / 100).toFixed(1)}% above the inherited cost effective on ${source.proposedEffectiveDate}.`, severity: 'warning', blocking: false });
    }
    if (change !== null && !nextAnomalies.some((item) => item.code === 'large_decrease') && change < -LARGE_COGS_CHANGE_BPS) {
      nextAnomalies.push({ code: 'large_decrease', label: 'Large cost decrease', detail: `The proposed cost is ${(Math.abs(change) / 100).toFixed(1)}% below the inherited cost effective on ${source.proposedEffectiveDate}.`, severity: 'warning', blocking: false });
    }
    if (source.proposedCurrency && source.proposedCurrency !== resolution.currency && !nextAnomalies.some((item) => item.code === 'currency_change')) {
      nextAnomalies.push({ code: 'currency_change', label: 'Currency changed', detail: `${resolution.currency} → ${source.proposedCurrency}. No automatic conversion will be applied to the stored unit cost.`, severity: 'warning', blocking: false });
    }
    nextAnomalies.push(warning);
    const comparisonEffectiveTo = [resolution.groupCost.effectiveTo, resolution.membership.effectiveTo]
      .filter((value): value is string => Boolean(value))
      .sort()[0] ?? null;
    return {
      ...source,
      currentUnitCostMinor: resolution.unitCostMinor,
      currentCurrency: resolution.currency,
      comparisonRecordId: resolution.groupCost.id,
      comparisonEffectiveFrom: resolution.groupCost.effectiveFrom > resolution.membership.effectiveFrom
        ? resolution.groupCost.effectiveFrom
        : resolution.membership.effectiveFrom,
      comparisonEffectiveTo,
      anomalies: nextAnomalies,
      inheritedGroupId: group.id,
      inheritedGroupName: group.name,
      inheritedMembershipId: resolution.membership.id,
      inheritedGroupCostRecordId: resolution.groupCost.id,
      inheritedPackQuantity: resolution.membership.packQuantity,
      inheritedBaseQuantity: resolution.groupCost.baseQuantity,
      inheritedBaseCostMinor: resolution.groupCost.baseCostMinor,
      groupOverrideAcknowledged: sameReviewedSource && source.groupOverrideAcknowledged === true,
      reviewStatus: sameReviewedSource && source.groupOverrideAcknowledged === true
        ? source.reviewStatus
        : source.reviewStatus === 'rejected' ? 'rejected' as const : 'pending' as const,
    };
  });
}

function previousRecord(history: readonly COGSRecord[], current: COGSRecord | null) {
  if (!current) return null;
  return history.filter((record) => record.status === 'active' && record.effectiveFrom < current.effectiveFrom)
    .sort((left, right) => right.effectiveFrom.localeCompare(left.effectiveFrom))[0] ?? null;
}

function batchCounts(batch: CogsImportBatch) {
  return { ...batch, ...summariseImportRows(batch.rows), updatedAt: nowIso() };
}

function recomputeBatchStatus(batch: CogsImportBatch) {
  if (['awaiting-approval', 'applying', 'applied', 'failed', 'cancelled'].includes(batch.status)) return batch;
  const activeRows = batch.rows.filter((row) => row.reviewStatus !== 'rejected');
  const unresolved = activeRows.some((row) => row.reviewStatus !== 'accepted' || row.anomalies.some((item) => item.blocking));
  const hasAccepted = activeRows.some(importRowReady);
  return { ...batch, status: unresolved || !hasAccepted ? 'needs-review' as const : 'ready-for-approval' as const };
}

function fullyReviewedRows(batch: CogsImportBatch) {
  const activeRows = batch.rows.filter((row) => row.reviewStatus !== 'rejected');
  if (activeRows.some((row) => !importRowReady(row))) throw new Error('Resolve or reject every pending or invalid row before approval.');
  if (!activeRows.length) throw new Error('No reviewed COGS changes are ready for approval.');
  return activeRows;
}

function reviewTimelineFingerprint(row: CogsImportRow) {
  return JSON.stringify([
    row.comparisonRecordId ?? null,
    row.currentUnitCostMinor ?? null,
    row.currentCurrency ?? null,
    row.comparisonEffectiveFrom ?? null,
    row.comparisonEffectiveTo ?? null,
    row.comparisonDisposition ?? null,
    row.projectedEffectiveTo ?? null,
    row.inheritedGroupId ?? null,
    row.inheritedMembershipId ?? null,
    row.inheritedGroupCostRecordId ?? null,
    row.inheritedPackQuantity ?? null,
    row.inheritedBaseQuantity ?? null,
    row.inheritedBaseCostMinor ?? null,
  ]);
}

function normaliseDuplicateRows(rows: CogsImportRow[]) {
  const cleaned = rows.map((row) => ({ ...row, anomalies: row.anomalies.filter((item) => item.code !== 'duplicate_row' && item.code !== 'conflicting_duplicate') }));
  const activeGroups = new Map<string, CogsImportRow[]>();
  cleaned.filter((row) => row.reviewStatus !== 'rejected' && row.proposedProductId && row.proposedEffectiveDate).forEach((row) => {
    const key = `${row.proposedProductId ?? row.sourceIdentifier}|${row.proposedEffectiveDate ?? ''}`;
    activeGroups.set(key, [...(activeGroups.get(key) ?? []), row]);
  });
  return cleaned.map((row) => {
    const key = `${row.proposedProductId ?? row.sourceIdentifier}|${row.proposedEffectiveDate ?? ''}`;
    const group = activeGroups.get(key) ?? [];
    if (group.length < 2) return row;
    const values = new Set(group.map((candidate) => `${candidate.proposedUnitCostMinor}|${candidate.proposedCurrency}`));
    const issue: CogsImportAnomaly = values.size === 1
      ? { code: 'duplicate_row', label: 'Duplicate row', detail: 'The same Product, effective date and cost appears more than once.', severity: 'error', blocking: true }
      : { code: 'conflicting_duplicate', label: 'Conflicting cost rows', detail: 'This batch proposes different costs for the same Product and effective date.', severity: 'error', blocking: true };
    return { ...row, anomalies: [...row.anomalies, issue], reviewStatus: row.reviewStatus === 'rejected' ? 'rejected' as const : 'pending' as const };
  });
}

function sanitiseFileName(value: string) {
  const leaf = value.replaceAll('\\', '/').split('/').at(-1) ?? 'cost-import';
  return leaf.replace(/[\u0000-\u001f<>:"|?*]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180) || 'cost-import';
}

function mappingValid(mapping: readonly CogsColumnMapping[], batchCurrency?: string, batchEffectiveDate?: string) {
  const hasIdentifier = mapping.some((candidate) => ['internalSku', 'marketplaceSku', 'asin', 'ean', 'title'].includes(candidate.field) && candidate.sourceColumn);
  const hasCost = mapping.some((candidate) => candidate.field === 'unitCost' && candidate.sourceColumn);
  const hasCurrency = mapping.some((candidate) => candidate.field === 'currency' && candidate.sourceColumn) || Boolean(batchCurrency);
  const hasDate = mapping.some((candidate) => candidate.field === 'effectiveDate' && candidate.sourceColumn) || Boolean(batchEffectiveDate);
  return hasIdentifier && hasCost && hasCurrency && hasDate;
}

function sourceRows(batch: CogsImportBatch) {
  return batch.rows.map((row) => ({ ...row.rawValues }));
}

export class MockCogsManagementRepository implements CogsRepository {
  private readonly datasets = new Map<string, AnalyticsDataset>();

  private baseDataset(input: DashboardRepositoryInput) {
    const key = datasetKey(input);
    let dataset = this.datasets.get(key);
    if (!dataset) {
      dataset = generateAnalyticsDataset({ organisation: input.organisation, companies: input.companies, marketplaceAccounts: input.marketplaceAccounts });
      this.datasets.set(key, dataset);
    }
    return dataset;
  }

  private dataset(input: DashboardRepositoryInput) {
    return materializeApprovedCogsDataset(this.baseDataset(input), input.organisation.id);
  }

  private saveBatch(batch: CogsImportBatch) {
    return mockCogsManagementStore.transaction((draft) => {
      const organisation = mockCogsManagementStore.ensureOrganisation(draft, batch.organisationId);
      organisation.batches[batch.id] = batch;
      return { ...batch, rows: batch.rows.map((row) => ({ ...row, rawValues: { ...row.rawValues }, anomalies: [...row.anomalies] })) };
    });
  }

  private requireBatch(input: DashboardRepositoryInput, batchId: string) {
    const state = organisationCogsState(mockCogsManagementStore.read(), input.organisation.id);
    const batch = state.batches[batchId];
    if (!batch) throw new Error('The COGS import could not be found.');
    ensureCompanyAccess(input, batch.companyId);
    return batch;
  }

  private reanalyse(input: DashboardRepositoryInput, batch: CogsImportBatch, mapping = batch.mapping, batchCurrency = batch.batchCurrency, batchEffectiveDate = batch.batchEffectiveDate) {
    const dataset = this.dataset(input);
    const products = dataset.products.filter((product) => product.ownerCompanyId === batch.companyId && input.authorisedCompanyIds.includes(product.ownerCompanyId));
    const listings = dataset.listings.filter((listing) => listing.companyId === batch.companyId && input.authorisedAccountIds.includes(listing.marketplaceAccountId));
    const histories = new Map(products.map((product) => [product.id, activeHistoryForProduct(dataset, input, product)]));
    let rows = buildCogsImportRows({
      batchId: batch.id,
      rawRows: sourceRows(batch),
      mapping,
      products,
      listings,
      selectedCompanyId: batch.companyId,
      companyName: companyName(input, batch.companyId),
      histories,
      batchCurrency,
      batchEffectiveDate,
    });
    const competingKeys = new Set(Object.values(organisationCogsState(mockCogsManagementStore.read(), input.organisation.id).batches)
      .filter((candidate) => candidate.id !== batch.id && !['applied', 'cancelled', 'failed'].includes(candidate.status))
      .flatMap((candidate) => candidate.rows.filter((row) => row.reviewStatus !== 'rejected' && row.proposedProductId && row.proposedEffectiveDate).map((row) => `${row.proposedProductId}|${row.proposedEffectiveDate}`)));
    rows = rows.map((row) => {
      const key = `${row.proposedProductId}|${row.proposedEffectiveDate}`;
      if (!row.proposedProductId || !row.proposedEffectiveDate || !competingKeys.has(key)) return row;
      const issue: CogsImportAnomaly = { code: 'repeated_product_match', label: 'Competing pending change', detail: 'Another active batch already proposes a COGS record for this Product and effective date.', severity: 'error', blocking: true };
      return { ...row, anomalies: [...row.anomalies, issue], reviewStatus: 'pending' as const };
    });
    rows = attachGroupOverrideWarnings(input, reconcileCogsImportRowTimelines(normaliseDuplicateRows(rows), histories));
    return recomputeBatchStatus(batchCounts({ ...batch, mapping, batchCurrency, batchEffectiveDate, rows }));
  }

  private reconcileRows(input: DashboardRepositoryInput, batch: CogsImportBatch, rows: CogsImportRow[]) {
    const dataset = this.dataset(input);
    const products = dataset.products.filter((product) => product.ownerCompanyId === batch.companyId && input.authorisedCompanyIds.includes(product.ownerCompanyId));
    const histories = new Map(products.map((product) => [product.id, activeHistoryForProduct(dataset, input, product)]));
    return attachGroupOverrideWarnings(input, reconcileCogsImportRowTimelines(rows, histories));
  }

  private scenarioRows(input: DashboardRepositoryInput, companyId: string, errors: boolean) {
    const dataset = this.baseDataset(input);
    // Keep the long-standing Phase 5 scenario fixtures focused on their original
    // approval/error cases. Group override acknowledgement is exercised by real
    // imports and by the dedicated Product Group validator.
    const groupedProductIds = new Set(
      Object.values(organisationProductGroupsState(mockProductGroupsStore.read(), input.organisation.id).membershipsByGroup)
        .flat()
        .filter((membership) => membership.status === 'active'
          && membership.effectiveFrom <= COGS_TODAY
          && (!membership.effectiveTo || COGS_TODAY < membership.effectiveTo))
        .map((membership) => membership.productId),
    );
    const products = dataset.products
      .filter((product) => product.ownerCompanyId === companyId && !groupedProductIds.has(product.id))
      .slice(0, 10);
    const cost = (product: Product, multiplier = 1) => {
      const current = dataset.cogsHistory.filter((rate) => rate.productId === product.id).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0]?.unitCostMinor ?? 500;
      return (current * multiplier / 100).toFixed(2);
    };
    if (!errors) return products.slice(0, 6).map((product, index) => ({ SKU: product.internalSku, Product: product.title, Cost: cost(product, 1.04 + index * .01), Currency: 'GBP', 'Effective Date': '2026-09-01' }));
    return [
      { SKU: products[0]?.internalSku ?? 'UNKNOWN', Product: products[0]?.title ?? '', Cost: cost(products[0], 1.61), Currency: 'GBP', 'Effective Date': '2026-08-01' },
      { SKU: '', Product: `${products[1]?.title ?? 'Blue Nitrile Gloves'} Extra Large`, Cost: cost(products[1], 1.08), Currency: 'GBP', 'Effective Date': '2026-09-01' },
      { SKU: 'NOT-IN-CATALOGUE', Product: 'Unlisted supplier sample', Cost: '9.40', Currency: 'GBP', 'Effective Date': '2026-09-01' },
      { SKU: products[2]?.internalSku ?? '', Product: products[2]?.title ?? '', Cost: '0.00', Currency: 'GBP', 'Effective Date': '2026-09-01' },
      { SKU: products[3]?.internalSku ?? '', Product: products[3]?.title ?? '', Cost: '-4.20', Currency: 'GBP', 'Effective Date': '2026-09-01' },
      { SKU: products[4]?.internalSku ?? '', Product: products[4]?.title ?? '', Cost: cost(products[4], .82), Currency: 'GBP', 'Effective Date': '2026-09-01' },
      { SKU: products[4]?.internalSku ?? '', Product: products[4]?.title ?? '', Cost: cost(products[4], 1.12), Currency: 'GBP', 'Effective Date': '2026-09-01' },
      { SKU: products[5]?.internalSku ?? '', Product: products[5]?.title ?? '', Cost: cost(products[5], 1.06), Currency: 'EUR', 'Effective Date': '2026-09-01' },
      { SKU: products[6]?.internalSku ?? '', Product: products[6]?.title ?? '', Cost: cost(products[6], 1.03), Currency: 'GBP', 'Effective Date': '2026-01-15' },
      { SKU: products[7]?.internalSku ?? '', Product: products[7]?.title ?? '', Cost: cost(products[7], 1.05), Currency: 'GBP', 'Effective Date': '2026-10-01' },
    ];
  }

  private ensureScenarioBatch(input: DashboardRepositoryInput) {
    if (input.scenarioId !== 'cogs-awaiting-approval' && input.scenarioId !== 'import-errors') return;
    const organisation = organisationCogsState(mockCogsManagementStore.read(), input.organisation.id);
    const marker = `scenario:${input.scenarioId}`;
    const batchId = `cogs-imp-${input.scenarioId}`;
    if (Object.values(organisation.batches).some((batch) => batch.id === batchId || batch.note === marker)) return;
    const preferredCompany = input.authorisedCompanyIds.includes('cmp-northbridge') ? 'cmp-northbridge' : input.authorisedCompanyIds[0];
    if (!preferredCompany) return;
    const rows = this.scenarioRows(input, preferredCompany, input.scenarioId === 'import-errors');
    const headers = Object.keys(rows[0] ?? {});
    const mapping = detectCogsColumnMapping(headers);
    const actor: CogsActor = { id: 'usr-daniel', name: 'Daniel Price', permissions: { edit: true, import: true, approve: false } };
    const seed: CogsImportBatch = {
      id: batchId,
      organisationId: input.organisation.id,
      companyId: preferredCompany,
      fileName: input.scenarioId === 'import-errors' ? 'supplier-costs-review-errors.csv' : 'Supplier Costs Sep 2026.xlsx',
      fileType: input.scenarioId === 'import-errors' ? 'csv' : 'xlsx',
      fileSize: input.scenarioId === 'import-errors' ? 18_420 : 82_134,
      sheetNames: input.scenarioId === 'import-errors' ? [] : ['Updated Costs', 'Discontinued', 'Notes'],
      selectedSheet: input.scenarioId === 'import-errors' ? null : 'Updated Costs',
      status: 'analysing',
      stage: input.scenarioId === 'import-errors' ? 'issues' : 'approval',
      createdByUserId: actor.id,
      createdByName: actor.name,
      createdAt: '2026-09-02T08:48:00.000Z',
      updatedAt: '2026-09-02T09:14:00.000Z',
      rowCount: rows.length,
      matchedCount: 0,
      suggestedCount: 0,
      unmatchedCount: 0,
      anomalyCount: 0,
      headers,
      mapping,
      rows: rows.map((rawValues, index) => ({
        id: `${batchId}:source-${index + 1}`, batchId, sourceRowNumber: index + 2, rawValues, sourceIdentifier: '', sourceTitle: '', matchType: 'unmatched', matchEvidence: [], anomalies: [], reviewStatus: 'pending',
      })),
      reason: 'September supplier pricing update',
      note: marker,
      signature: deterministicImportSignature(headers, rows),
    };
    let analysed = this.reanalyse(input, seed);
    if (input.scenarioId === 'cogs-awaiting-approval') {
      analysed = batchCounts({ ...analysed, status: 'awaiting-approval', stage: 'approval', rows: analysed.rows.map((row) => ({ ...row, reviewStatus: 'accepted', reviewedByUserId: actor.id, reviewedAt: '2026-09-02T09:12:00.000Z' })) });
    }
    this.saveBatch(analysed);
  }

  async getWorkspace(input: CogsWorkspaceQuery, signal?: AbortSignal) {
    await wait(`cogs-workspace:${JSON.stringify({ context: input.context, scenario: input.scenarioId, search: input.search })}`, signal);
    if (input.scenarioId === 'repository-error') throw new Error('The COGS workspace request failed.');
    this.ensureScenarioBatch(input);
    const dataset = this.dataset(input);
    const base = aggregateProductPage(dataset, productQuery(input));
    const state = organisationCogsState(mockCogsManagementStore.read(), input.organisation.id);
    const pendingBatches = Object.values(state.batches).filter((batch) => ['needs-review', 'ready-for-approval', 'awaiting-approval'].includes(batch.status));
    const pendingByProduct = new Map<string, { batchId: string; unitCostMinor?: number }>();
    pendingBatches.forEach((batch) => batch.rows.filter((row) => row.reviewStatus !== 'rejected' && row.proposedProductId).forEach((row) => pendingByProduct.set(row.proposedProductId!, { batchId: batch.id, unitCostMinor: row.proposedUnitCostMinor })));
    const allRows: CogsWorkspaceRow[] = base.rows.map((product) => {
      const history = activeHistoryForProduct(dataset, input, product.product);
      const projectedCurrent = resolveCurrentCogsRecord(history);
      const current = product.currentCogsMinor === null ? null : projectedCurrent;
      const scheduled = history.filter((record) => record.status === 'active' && record.effectiveFrom > COGS_TODAY).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))[0] ?? null;
      const pending = pendingByProduct.get(product.id);
      return {
        id: product.id,
        product,
        companyName: companyName(input, product.ownerCompanyId),
        current,
        previous: previousRecord(history, current),
        scheduled,
        history,
        status: pending?.batchId ? 'pending_approval' : product.cogsStatus,
        pendingBatchId: pending?.batchId,
        pendingUnitCostMinor: pending?.unitCostMinor,
      };
    });
    const currentCovered = allRows.filter((row) => row.current !== null).length;
    const summary = {
      products: allRows.length,
      complete: allRows.filter((row) => row.status === 'complete').length,
      missing: allRows.filter((row) => row.status === 'missing').length,
      partialHistory: allRows.filter((row) => row.status === 'partial_history').length,
      needsReview: allRows.filter((row) => row.status === 'needs_review').length,
      pendingApproval: allRows.filter((row) => row.status === 'pending_approval').length,
      productCoverageBps: allRows.length ? Math.round((currentCovered * 10_000) / allRows.length) : 0,
      profitabilityCoverageBps: base.summary.profitabilityCoverageBps,
    };
    let filtered = allRows;
    if (input.status !== 'all') filtered = filtered.filter((row) => row.status === input.status);
    if (input.source !== 'all') filtered = filtered.filter((row) => row.current?.source === input.source);
    if (input.effectiveDate === 'future') filtered = filtered.filter((row) => row.scheduled);
    if (input.effectiveDate === 'current') filtered = filtered.filter((row) => row.current);
    if (input.effectiveDate === 'historical') filtered = filtered.filter((row) => row.previous);
    if (input.changedBy !== 'all') filtered = filtered.filter((row) => row.current?.createdByUserId === input.changedBy);
    if (input.needsReview) filtered = filtered.filter((row) => row.status === 'needs_review' || row.status === 'pending_approval');
    const term = input.search.trim().toLocaleLowerCase('en-GB');
    if (term) filtered = filtered.filter((row) => [row.product.title, row.product.internalSku, ...row.product.listings.flatMap((listing) => [listing.marketplaceSku, listing.asin, listing.marketplaceProductId])].some((value) => value?.toLocaleLowerCase('en-GB').includes(term)));
    if (input.scenarioId === 'no-results') filtered = [];
    const pageCount = Math.max(1, Math.ceil(filtered.length / input.pageSize));
    const page = Math.min(Math.max(0, input.page), pageCount - 1);
    const rows = filtered.slice(page * input.pageSize, (page + 1) * input.pageSize);
    return {
      rows,
      allRows,
      summary,
      recentImports: Object.values(state.batches)
        .filter((batch) => input.authorisedCompanyIds.includes(batch.companyId))
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .slice(0, 8),
      total: filtered.length,
      page,
      pageSize: input.pageSize,
      pageCount,
    };
  }

  async getBatch(input: DashboardRepositoryInput, batchId: string, signal?: AbortSignal) {
    await wait(`cogs-batch:${batchId}`, signal);
    this.ensureScenarioBatch(input);
    const batch = organisationCogsState(mockCogsManagementStore.read(), input.organisation.id).batches[batchId];
    if (!batch) return null;
    ensureCompanyAccess(input, batch.companyId);
    return batch;
  }

  async createImport(input: CreateCogsImportInput, signal?: AbortSignal) {
    await wait(`cogs-create:${input.fileName}`, signal);
    ensureImportAccess(input.actor);
    ensureCompanyAccess(input, input.companyId);
    if (!input.headers.length || !input.rawRows.length) throw new Error('The selected sheet is empty.');
    if (input.rawRows.length > 5_000) throw new Error('This prototype supports up to 5,000 rows per import.');
    const now = nowIso();
    const batchId = mockCogsManagementStore.createId('cogs-imp');
    const existing = Object.values(organisationCogsState(mockCogsManagementStore.read(), input.organisation.id).batches);
    const signature = deterministicImportSignature(input.headers, input.rawRows);
    const batch: CogsImportBatch = {
      id: batchId,
      organisationId: input.organisation.id,
      companyId: input.companyId,
      fileName: sanitiseFileName(input.fileName),
      fileType: input.fileType,
      fileSize: input.fileSize,
      sheetNames: [...input.sheetNames],
      selectedSheet: input.selectedSheet,
      status: 'analysing',
      stage: 'mapping',
      createdByUserId: input.actor.id,
      createdByName: input.actor.name,
      createdAt: now,
      updatedAt: now,
      rowCount: input.rawRows.length,
      matchedCount: 0,
      suggestedCount: 0,
      unmatchedCount: 0,
      anomalyCount: 0,
      headers: [...input.headers],
      mapping: input.mapping.map((mapping) => ({ ...mapping })),
      rows: input.rawRows.map((rawValues, index) => ({ id: `${batchId}:source-${index + 1}`, batchId, sourceRowNumber: index + 2, rawValues: { ...rawValues }, sourceIdentifier: '', sourceTitle: '', matchType: 'unmatched', matchEvidence: [], anomalies: [], reviewStatus: 'pending' })),
      batchCurrency: input.batchCurrency,
      batchEffectiveDate: input.batchEffectiveDate,
      reason: input.reason?.trim() || '',
      note: input.note?.trim() || '',
      signature,
      duplicateOfBatchId: existing.find((candidate) => candidate.companyId === input.companyId && candidate.signature === signature && candidate.status !== 'cancelled')?.id,
    };
    const analysed = mappingValid(batch.mapping, batch.batchCurrency, batch.batchEffectiveDate) ? this.reanalyse(input, batch) : batchCounts({ ...batch, status: 'needs-review' });
    return this.saveBatch(analysed);
  }

  async createProposalBatch(input: CreateCogsProposalBatchInput, signal?: AbortSignal) {
    await wait(`cogs-proposals:${input.kind}:${input.proposals.length}`, signal);
    ensureEditAccess(input.actor);
    ensureCompanyAccess(input, input.companyId);
    if (!input.proposals.length) throw new Error('Add at least one proposed COGS change.');
    const dataset = this.dataset(input);
    const products = dataset.products.filter((product) => product.ownerCompanyId === input.companyId);
    const productById = new Map(products.map((product) => [product.id, product]));
    input.proposals.forEach((proposal) => {
      const product = productById.get(proposal.productId);
      if (!product) throw new Error('A proposed Product is outside the selected Company or assignment.');
      if (!Number.isInteger(proposal.unitCostMinor) || proposal.unitCostMinor < 0) throw new Error('Unit cost must be a non-negative integer in minor units.');
    });
    const headers = ['SKU', 'Product', 'Cost', 'Currency', 'Effective Date'];
    const rawRows = input.proposals.map((proposal) => {
      const product = productById.get(proposal.productId)!;
      return { SKU: product.internalSku, Product: product.title, Cost: (proposal.unitCostMinor / 100).toFixed(2), Currency: proposal.currency, 'Effective Date': proposal.effectiveFrom };
    });
    const created = await this.createImport({
      ...input,
      // Direct edit flows are authorised by cogs.edit above. Reuse the import
      // analyser internally without widening the public file-import permission.
      actor: { ...input.actor, permissions: { ...input.actor.permissions, import: true } },
      fileName: input.label,
      fileType: input.kind === 'single' ? 'paste' : 'paste',
      fileSize: 0,
      sheetNames: [],
      selectedSheet: null,
      headers,
      rawRows,
      mapping: detectCogsColumnMapping(headers),
      reason: input.proposals[0]?.reason,
      note: `direct:${input.kind}`,
    }, signal);
    const fileType = input.kind === 'single' ? 'single' : input.kind === 'percentage' ? 'percentage' : 'bulk';
    const ready = batchCounts({
      ...created,
      fileType,
      status: 'ready-for-approval',
      stage: 'changes',
      rows: created.rows.map((row, index) => ({ ...row, reviewStatus: row.anomalies.some((item) => item.blocking) ? 'pending' : 'accepted', reason: input.proposals[index]?.reason, reviewedByUserId: input.actor.id, reviewedAt: nowIso() })),
    });
    return this.saveBatch(recomputeBatchStatus(ready));
  }

  async updateMapping(input: DashboardRepositoryInput, batchId: string, mapping: CogsColumnMapping[], actor: CogsActor, batchCurrency?: string, batchEffectiveDate?: string) {
    const batch = this.requireBatch(input, batchId);
    ensurePreparationAccess(actor);
    if (batch.status === 'applied' || batch.status === 'cancelled') throw new Error('Applied or cancelled imports cannot be remapped.');
    const updated = mappingValid(mapping, batchCurrency, batchEffectiveDate)
      ? this.reanalyse(input, batch, mapping, batchCurrency, batchEffectiveDate)
      : batchCounts({ ...batch, mapping, batchCurrency, batchEffectiveDate, status: 'needs-review' });
    return this.saveBatch(updated);
  }

  async updateBatchDetails(input: DashboardRepositoryInput, batchId: string, values: { reason?: string; note?: string; stage?: CogsImportBatch['stage'] }, actor: CogsActor) {
    const batch = this.requireBatch(input, batchId);
    ensurePreparationAccess(actor);
    if (batch.status === 'applied' || batch.status === 'cancelled') throw new Error('Applied or cancelled imports are immutable.');
    return this.saveBatch({ ...batch, ...values, updatedAt: nowIso() });
  }

  async reviewRow(input: DashboardRepositoryInput, batchId: string, rowId: string, status: 'pending' | 'accepted' | 'rejected', actor: CogsActor) {
    const batch = this.requireBatch(input, batchId);
    ensurePreparationAccess(actor);
    ensureMutableBatch(batch);
    const source = batch.rows.find((row) => row.id === rowId);
    if (!source) throw new Error('The import row could not be found.');
    if (status === 'accepted' && source.anomalies.some((item) => item.blocking)) throw new Error('Resolve blocking errors before accepting this row.');
    const rows = this.reconcileRows(input, batch, normaliseDuplicateRows(batch.rows.map((row) => row.id === rowId ? {
      ...row,
      reviewStatus: status,
      groupOverrideAcknowledged: status === 'accepted' && row.anomalies.some((item) => item.code === 'group_inheritance_override')
        ? true
        : status === 'accepted' ? row.groupOverrideAcknowledged : false,
      reviewedByUserId: actor.id,
      reviewedAt: nowIso(),
    } : row)));
    const updated = recomputeBatchStatus(batchCounts({ ...batch, rows }));
    return this.saveBatch(updated.status === 'ready-for-approval' ? { ...updated, failureMessage: undefined } : updated);
  }

  async manualMatch(input: DashboardRepositoryInput, batchId: string, rowId: string, productId: string, actor: CogsActor) {
    const batch = this.requireBatch(input, batchId);
    ensurePreparationAccess(actor);
    ensureMutableBatch(batch);
    const source = batch.rows.find((row) => row.id === rowId);
    if (!source) throw new Error('The import row could not be found.');
    const dataset = this.dataset(input);
    const product = dataset.products.find((candidate) => candidate.id === productId && candidate.ownerCompanyId === batch.companyId && input.authorisedCompanyIds.includes(candidate.ownerCompanyId));
    if (!product) throw new Error('The selected Product is outside this Company or assignment.');
    const history = activeHistoryForProduct(dataset, input, product);
    const insertionPreview = source.proposedEffectiveDate ? previewApprovedCogsInsertion(history, source.proposedEffectiveDate) : null;
    const comparison = insertionPreview?.predecessor ?? null;
    const change = cogsChangeBps(comparison?.unitCostMinor, source.proposedUnitCostMinor);
    const recalculated = source.anomalies.filter((item) => !['unmatched_product', 'ambiguous_identifier', 'blank_identifier', 'title_mismatch', 'large_increase', 'large_decrease', 'currency_change', 'existing_cost_conflict', 'duplicate_row', 'conflicting_duplicate'].includes(item.code));
    if (change !== null && change > LARGE_COGS_CHANGE_BPS) recalculated.push({ code: 'large_increase', label: 'Large cost increase', detail: `The proposed cost is ${(change / 100).toFixed(1)}% above the selected Product cost effective on this date.`, severity: 'warning', blocking: false });
    if (change !== null && change < -LARGE_COGS_CHANGE_BPS) recalculated.push({ code: 'large_decrease', label: 'Large cost decrease', detail: `The proposed cost is ${(Math.abs(change) / 100).toFixed(1)}% below the selected Product cost effective on this date.`, severity: 'warning', blocking: false });
    if (comparison && source.proposedCurrency && comparison.currency !== source.proposedCurrency) recalculated.push({ code: 'currency_change', label: 'Currency changed', detail: `${comparison.currency} → ${source.proposedCurrency}. No automatic conversion will be applied.`, severity: 'warning', blocking: false });
    if (source.proposedEffectiveDate) {
      const sameDate = history.find((record) => record.status === 'active' && record.effectiveFrom === source.proposedEffectiveDate);
      if (sameDate && (sameDate.unitCostMinor !== source.proposedUnitCostMinor || sameDate.currency !== source.proposedCurrency)) recalculated.push({ code: 'existing_cost_conflict', label: 'Existing COGS conflict', detail: 'An approved cost already starts on this date. Approval creates an audited correction.', severity: 'warning', blocking: false });
    }
    if (source.sourceTitle && titleSimilarity(source.sourceTitle, product.title) < 35) recalculated.push({ code: 'title_mismatch', label: 'Title differs from selected Product', detail: 'The source title looks materially different from the manually selected Product.', severity: 'warning', blocking: false });
    const rows = this.reconcileRows(input, batch, normaliseDuplicateRows(batch.rows.map((row) => row.id === rowId ? {
      ...row,
      proposedProductId: product.id,
      proposedProductTitle: product.title,
      proposedProductSku: product.internalSku,
      matchType: 'manual' as const,
      matchConfidence: 100,
      matchEvidence: [{ kind: 'manual' as const, detail: `${actor.name} chose this company-owned Product.` }],
      currentUnitCostMinor: comparison?.unitCostMinor ?? null,
      currentCurrency: comparison?.currency ?? null,
      comparisonRecordId: comparison?.id,
      comparisonEffectiveFrom: comparison?.effectiveFrom,
      comparisonEffectiveTo: comparison ? comparison.effectiveTo : undefined,
      comparisonDisposition: insertionPreview?.predecessorDisposition,
      projectedEffectiveTo: insertionPreview ? insertionPreview.incomingEffectiveTo : undefined,
      anomalies: recalculated,
      reviewStatus: recalculated.length ? 'pending' as const : 'accepted' as const,
      reviewedByUserId: actor.id,
      reviewedAt: nowIso(),
    } : row)));
    return this.saveBatch(recomputeBatchStatus(batchCounts({ ...batch, rows })));
  }

  async acceptSafeExact(input: DashboardRepositoryInput, batchId: string, actor: CogsActor) {
    const batch = this.requireBatch(input, batchId);
    ensurePreparationAccess(actor);
    ensureMutableBatch(batch);
    const reviewedAt = nowIso();
    const rows = this.reconcileRows(input, batch, batch.rows.map((row) => row.matchType === 'exact' && row.anomalies.length === 0
      ? { ...row, reviewStatus: 'accepted' as const, reviewedByUserId: actor.id, reviewedAt }
      : row));
    return this.saveBatch(recomputeBatchStatus(batchCounts({ ...batch, rows })));
  }

  async submitForApproval(input: DashboardRepositoryInput, batchId: string, actor: CogsActor) {
    const batch = this.requireBatch(input, batchId);
    ensurePreparationAccess(actor);
    ensureMutableBatch(batch);
    fullyReviewedRows(batch);
    return this.saveBatch({ ...batch, status: 'awaiting-approval', stage: 'approval', updatedAt: nowIso(), note: batch.note || `Prepared by ${actor.name}`, failureMessage: undefined });
  }

  private impact(dataset: AnalyticsDataset, input: DashboardRepositoryInput) {
    const dashboard = aggregateDashboardAnalytics(dataset, input);
    const products = aggregateProductPage(dataset, productQuery(input));
    return {
      productCoverageBps: products.summary.cogsCoverageBps,
      profitabilityCoverageBps: dashboard.current.profitabilityCoverageBps,
      knownNetProfitMinor: dashboard.current.knownNetProfitMinor,
    };
  }

  async applyBatch(input: DashboardRepositoryInput, batchId: string, actor: CogsActor, canApprove: boolean, simulateFailure = false) {
    const batch = this.requireBatch(input, batchId);
    if (!canApprove || !actor.permissions.approve) throw new Error('An authorised user with cogs.approve must approve these financial changes.');
    if (batch.status === 'applied') return batch;
    if (batch.status === 'cancelled') throw new Error('A cancelled import cannot be applied.');
    if (batch.status !== 'ready-for-approval' && batch.status !== 'awaiting-approval' && batch.status !== 'failed') throw new Error('Resolve or reject every pending row before approval.');
    const reviewedRows = fullyReviewedRows(batch);
    const refreshedRows = this.reconcileRows(input, batch, batch.rows);
    const refreshedById = new Map(refreshedRows.map((row) => [row.id, row]));
    const staleRowIds = new Set(reviewedRows.filter((row) => {
      const refreshed = refreshedById.get(row.id);
      return !refreshed
        || refreshed.reviewStatus !== 'accepted'
        || reviewTimelineFingerprint(refreshed) !== reviewTimelineFingerprint(row);
    }).map((row) => row.id));
    if (staleRowIds.size) {
      const failureMessage = 'Another approved COGS change altered this Product timeline after review. Re-review the refreshed rows before approval; no COGS records were applied.';
      this.saveBatch(batchCounts({
        ...batch,
        status: 'needs-review',
        stage: 'changes',
        failureMessage,
        rows: refreshedRows.map((row) => staleRowIds.has(row.id) ? {
          ...row,
          reviewStatus: 'pending' as const,
          reviewedByUserId: undefined,
          reviewedAt: undefined,
        } : row),
      }));
      throw new Error(failureMessage);
    }
    const rows = reviewedRows.map((row) => refreshedById.get(row.id) ?? row).sort((left, right) =>
      (left.proposedProductId ?? '').localeCompare(right.proposedProductId ?? '')
      || (left.proposedEffectiveDate ?? '').localeCompare(right.proposedEffectiveDate ?? '')
      || left.sourceRowNumber - right.sourceRowNumber);
    const base = this.dataset(input);
    const before = this.impact(base, input);
    const appliedAt = nowIso();
    const computed = new Map<string, COGSRecord[]>();
    const insertionByRow = new Map<string, ReturnType<typeof insertApprovedCogsRecord>>();
    let adjustedRanges = 0;
    const touchedBackdated = new Set<string>();
    let futureCosts = 0;
    for (const row of rows) {
      const product = base.products.find((candidate) => candidate.id === row.proposedProductId && candidate.ownerCompanyId === batch.companyId);
      if (!product || row.proposedUnitCostMinor === undefined || !row.proposedCurrency || !row.proposedEffectiveDate) throw new Error('A reviewed row no longer resolves safely inside the selected Company.');
      const existing = computed.get(product.id) ?? activeHistoryForProduct(base, input, product);
      const record: COGSRecord = {
        id: `${batch.id}:cogs:${row.id.split(':').at(-1)}`,
        organisationId: input.organisation.id,
        companyId: product.ownerCompanyId,
        productId: product.id,
        unitCostMinor: row.proposedUnitCostMinor,
        currency: row.proposedCurrency,
        effectiveFrom: row.proposedEffectiveDate,
        effectiveTo: null,
        status: 'active',
        source: SOURCE_BY_FILE_TYPE[batch.fileType],
        sourceReferenceId: batch.id,
        reason: row.reason?.trim() || batch.reason.trim() || 'Approved COGS change',
        createdByUserId: batch.createdByUserId,
        createdByName: batch.createdByName,
        createdAt: batch.createdAt,
        changedByUserId: batch.createdByUserId,
        approvedByUserId: actor.id,
        approvedByName: actor.name,
        approvedAt: appliedAt,
        approvalStatus: 'approved',
      };
      const inserted = insertApprovedCogsRecord(existing, record);
      computed.set(product.id, inserted.history);
      insertionByRow.set(row.id, inserted);
      adjustedRanges += inserted.adjustedRecordIds.length;
      if (row.proposedEffectiveDate < COGS_TODAY) touchedBackdated.add(product.id);
      if (row.proposedEffectiveDate > COGS_TODAY) futureCosts += 1;
    }
    const projectedRecordsByProduct: Record<string, readonly COGSRecord[]> = {
      ...organisationCogsState(mockCogsManagementStore.read(), input.organisation.id).recordsByProduct,
    };
    computed.forEach((history, productId) => { projectedRecordsByProduct[productId] = history; });
    let after: ReturnType<MockCogsManagementRepository['impact']>;
    try {
      const projectedDataset = materializeApprovedCogsDataset(this.baseDataset(input), input.organisation.id, projectedRecordsByProduct);
      after = this.impact(projectedDataset, input);
      if (simulateFailure || input.scenarioId === 'repository-error') throw new Error('Simulated profitability recalculation failure.');
    } catch {
      return this.saveBatch({ ...batch, status: 'failed', stage: 'approval', failureMessage: 'Import failed while applying changes. The atomic batch was rolled back; no COGS records were committed.', updatedAt: appliedAt });
    }
    const result = {
      recordsCreated: rows.length,
      historicalRangesAdjusted: adjustedRanges,
      backdatedProductsRecalculated: touchedBackdated.size,
      futureCostsScheduled: futureCosts,
      rowsSkipped: batch.rows.filter((row) => row.reviewStatus === 'rejected').length,
      unmatchedRows: batch.rows.filter((row) => row.matchType === 'unmatched' && row.reviewStatus !== 'rejected').length,
      before,
      after,
    };
    const appliedBatch: CogsImportBatch = { ...batch, status: 'applied', stage: 'results', approvedByUserId: actor.id, approvedByName: actor.name, approvedAt: appliedAt, appliedAt, updatedAt: appliedAt, failureMessage: undefined, result };
    mockCogsManagementStore.transaction((draft) => {
      const organisation = mockCogsManagementStore.ensureOrganisation(draft, input.organisation.id);
      computed.forEach((history, productId) => { organisation.recordsByProduct[productId] = history; });
      for (const row of rows) {
        const product = base.products.find((candidate) => candidate.id === row.proposedProductId)!;
        const insertion = insertionByRow.get(row.id);
        const previous = insertion?.previous ?? null;
        const finalCreated = computed.get(product.id)?.find((record) => record.id === insertion?.created.id);
        const event: AuditEvent = {
          id: nextId(draft, 'audit-cogs', appliedAt),
          organisationId: input.organisation.id,
          actor: { type: 'user', userId: actor.id },
          action: 'cogs.changed',
          target: { type: 'product', id: product.id },
          occurredAt: appliedAt,
          previousValue: previous ? { id: previous.id, unitCostMinor: previous.unitCostMinor, currency: previous.currency, effectiveFrom: previous.effectiveFrom, effectiveTo: previous.effectiveTo } : null,
          newValue: { product: product.title, internalSku: product.internalSku, unitCostMinor: row.proposedUnitCostMinor, currency: row.proposedCurrency, effectiveFrom: row.proposedEffectiveDate, effectiveTo: finalCreated?.effectiveTo ?? null, source: batch.fileName, approvedBy: actor.name },
          reason: row.reason?.trim() || batch.reason.trim() || 'Approved COGS change',
        };
        organisation.auditEvents.unshift(event);
      }
      organisation.auditEvents.unshift({
        id: nextId(draft, 'audit-import', appliedAt),
        organisationId: input.organisation.id,
        actor: { type: 'user', userId: actor.id },
        action: 'cogs.import.approved',
        target: { type: 'cogs-import', id: batch.id },
        occurredAt: appliedAt,
        previousValue: { status: batch.status, preparedBy: batch.createdByName },
        newValue: { status: 'applied', company: companyName(input, batch.companyId), rowsApplied: rows.length, approvedBy: actor.name },
        reason: batch.reason || 'Approved COGS import',
      });
      organisation.batches[batch.id] = appliedBatch;
    });
    await Promise.all(rows.map(async (row) => {
      const product = base.products.find((candidate) => candidate.id === row.proposedProductId)!;
      const inserted = insertionByRow.get(row.id);
      const created = computed.get(product.id)?.find((record) => record.id === inserted?.created.id);
      if (!created) return;
      await mockProductGroupsRepository.recordDirectOverride(input, created, {
        id: actor.id,
        name: actor.name,
        companyIds: input.authorisedCompanyIds,
        permissions: { edit: actor.permissions.edit, approve: actor.permissions.approve },
      });
    }));
    return appliedBatch;
  }

  async cancelBatch(input: DashboardRepositoryInput, batchId: string, actor: CogsActor) {
    const batch = this.requireBatch(input, batchId);
    ensurePreparationAccess(actor);
    if (batch.status === 'applied') throw new Error('Applied financial imports are immutable. Create a new effective-dated correction instead.');
    if (batch.status === 'cancelled') return batch;
    const cancelled = this.saveBatch({ ...batch, status: 'cancelled', cancelledAt: nowIso(), updatedAt: nowIso() });
    mockCogsManagementStore.transaction((draft) => {
      const organisation = mockCogsManagementStore.ensureOrganisation(draft, input.organisation.id);
      organisation.auditEvents.unshift({ id: nextId(draft, 'audit-import', nowIso()), organisationId: input.organisation.id, actor: { type: 'user', userId: actor.id }, action: 'cogs.import.cancelled', target: { type: 'cogs-import', id: batch.id }, occurredAt: nowIso(), previousValue: { status: batch.status }, newValue: { status: 'cancelled' }, reason: null });
    });
    return cancelled;
  }

  async getAuditEvents(organisationId: string) {
    return structuredClone(organisationCogsState(mockCogsManagementStore.read(), organisationId).auditEvents);
  }
}

export function cogsRecordDisplaySource(record: COGSRecord | null) {
  return record ? cogsSourceLabel(record.source) : '—';
}
