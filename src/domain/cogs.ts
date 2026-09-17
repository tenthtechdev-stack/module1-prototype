import type { HistoricalCogsRate } from '@/src/domain/analytics';
import type { COGSRecord, MarketplaceListing, Product } from '@/src/domain/models';
import type { ProductCogsStatus, ProductListItem } from '@/src/domain/products';

/** Deterministic prototype clock used by financial fixtures and validators. */
export const COGS_TODAY = '2026-09-02';
export const LARGE_COGS_CHANGE_BPS = 3_000;
export const SUPPORTED_COGS_CURRENCIES = ['GBP', 'EUR', 'USD'] as const;

export type CogsImportFileType = 'csv' | 'xlsx' | 'paste' | 'bulk' | 'single' | 'percentage';
export type CogsImportStatus = 'draft' | 'analysing' | 'needs-review' | 'ready-for-approval' | 'awaiting-approval' | 'applying' | 'applied' | 'failed' | 'cancelled';
export type CogsImportStage = 'company' | 'upload' | 'mapping' | 'matching' | 'issues' | 'changes' | 'approval' | 'results';
export type CogsMatchType = 'exact' | 'suggested' | 'manual' | 'unmatched';
export type CogsReviewStatus = 'pending' | 'accepted' | 'rejected';
export type CogsMappedField = 'internalSku' | 'marketplaceSku' | 'asin' | 'ean' | 'title' | 'unitCost' | 'currency' | 'effectiveDate' | 'company';

export type CogsAnomalyCode =
  | 'blank_identifier'
  | 'invalid_cost'
  | 'zero_cost'
  | 'negative_cost'
  | 'missing_currency'
  | 'unsupported_currency'
  | 'missing_effective_date'
  | 'invalid_date'
  | 'unmatched_product'
  | 'ambiguous_identifier'
  | 'company_mismatch'
  | 'duplicate_row'
  | 'conflicting_duplicate'
  | 'existing_cost_conflict'
  | 'large_increase'
  | 'large_decrease'
  | 'currency_change'
  | 'future_date'
  | 'backdated_date'
  | 'title_mismatch'
  | 'repeated_product_match'
  | 'group_inheritance_override';

export interface CogsImportAnomaly {
  code: CogsAnomalyCode;
  label: string;
  detail: string;
  severity: 'warning' | 'error';
  blocking: boolean;
}

export interface CogsColumnMapping {
  field: CogsMappedField;
  sourceColumn: string | null;
  confidence: number;
  detectedBy: 'copilot' | 'manual';
}

export interface CogsMatchEvidence {
  kind: 'internal-sku' | 'marketplace-sku' | 'asin' | 'ean' | 'title' | 'manual';
  detail: string;
}

export interface CogsImportRow {
  id: string;
  batchId: string;
  sourceRowNumber: number;
  rawValues: Record<string, string>;
  sourceIdentifier: string;
  sourceTitle: string;
  proposedProductId?: string;
  proposedProductTitle?: string;
  proposedProductSku?: string;
  matchType: CogsMatchType;
  matchConfidence?: number;
  matchEvidence: CogsMatchEvidence[];
  proposedUnitCostMinor?: number;
  proposedCurrency?: string;
  proposedEffectiveDate?: string;
  /** Cost effective on the proposed date; retained names support persisted v1 batches. */
  currentUnitCostMinor?: number | null;
  currentCurrency?: string | null;
  comparisonRecordId?: string;
  comparisonEffectiveFrom?: string;
  comparisonEffectiveTo?: string | null;
  comparisonDisposition?: 'none' | 'shortened' | 'superseded';
  /** Exclusive end date the proposed record will receive after canonical insertion. */
  projectedEffectiveTo?: string | null;
  /** Effective inherited source captured at review time for explicit override acknowledgement. */
  inheritedGroupId?: string;
  inheritedGroupName?: string;
  inheritedMembershipId?: string;
  inheritedGroupCostRecordId?: string;
  inheritedPackQuantity?: number;
  inheritedBaseQuantity?: number;
  inheritedBaseCostMinor?: number;
  groupOverrideAcknowledged?: boolean;
  anomalies: CogsImportAnomaly[];
  reviewStatus: CogsReviewStatus;
  reviewedByUserId?: string;
  reviewedAt?: string;
  reason?: string;
}

export interface CogsImpactSnapshot {
  productCoverageBps: number;
  profitabilityCoverageBps: number;
  knownNetProfitMinor: number | null;
}

export interface CogsApplyResult {
  recordsCreated: number;
  historicalRangesAdjusted: number;
  backdatedProductsRecalculated: number;
  futureCostsScheduled: number;
  rowsSkipped: number;
  unmatchedRows: number;
  before: CogsImpactSnapshot;
  after: CogsImpactSnapshot;
}

export interface CogsImportBatch {
  id: string;
  organisationId: string;
  companyId: string;
  fileName: string;
  fileType: CogsImportFileType;
  fileSize: number;
  sheetNames: string[];
  selectedSheet: string | null;
  status: CogsImportStatus;
  stage: CogsImportStage;
  createdByUserId: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  approvedByUserId?: string;
  approvedByName?: string;
  approvedAt?: string;
  appliedAt?: string;
  cancelledAt?: string;
  rowCount: number;
  matchedCount: number;
  suggestedCount: number;
  unmatchedCount: number;
  anomalyCount: number;
  headers: string[];
  mapping: CogsColumnMapping[];
  rows: CogsImportRow[];
  batchCurrency?: string;
  batchEffectiveDate?: string;
  reason: string;
  note: string;
  signature: string;
  duplicateOfBatchId?: string;
  result?: CogsApplyResult;
  failureMessage?: string;
}

export interface CogsActor {
  id: string;
  name: string;
  permissions: {
    edit: boolean;
    import: boolean;
    approve: boolean;
  };
}

export interface CogsProposalInput {
  productId: string;
  unitCostMinor: number;
  currency: string;
  effectiveFrom: string;
  reason: string;
}

export type CogsWorkspaceStatus = ProductCogsStatus | 'pending_approval';

export interface CogsWorkspaceRow {
  id: string;
  product: ProductListItem;
  companyName: string;
  current: COGSRecord | null;
  previous: COGSRecord | null;
  scheduled: COGSRecord | null;
  history: COGSRecord[];
  status: CogsWorkspaceStatus;
  pendingBatchId?: string;
  pendingUnitCostMinor?: number;
}

export interface CogsWorkspaceSummary {
  products: number;
  complete: number;
  missing: number;
  partialHistory: number;
  needsReview: number;
  pendingApproval: number;
  productCoverageBps: number;
  profitabilityCoverageBps: number;
}

export interface CogsWorkspaceResult {
  rows: CogsWorkspaceRow[];
  allRows: CogsWorkspaceRow[];
  summary: CogsWorkspaceSummary;
  recentImports: CogsImportBatch[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export interface ParsedTabularData {
  headers: string[];
  rows: Record<string, string>[];
}

const FIELD_ALIASES: Record<CogsMappedField, RegExp[]> = {
  internalSku: [/^sku$/i, /internal.?sku/i, /our.?sku/i, /item.?code/i, /product.?code/i],
  marketplaceSku: [/marketplace.?sku/i, /seller.?sku/i, /amazon.?sku/i, /ebay.?sku/i],
  asin: [/^asin$/i, /amazon.?id/i],
  ean: [/^ean$/i, /barcode/i, /gtin/i, /upc/i],
  title: [/product.?title/i, /^product$/i, /^title$/i, /product.?name/i, /^description$/i],
  unitCost: [/unit.?cost/i, /^cost$/i, /buy.?price/i, /purchase.?price/i, /new.?cost/i, /new.?buy.?price/i],
  currency: [/^currency$/i, /currency.?code/i, /^ccy$/i],
  effectiveDate: [/effective.?date/i, /effective.?from/i, /start.?date/i, /^date$/i],
  company: [/^company$/i, /legal.?entity/i, /business.?unit/i],
};

function normaliseHeader(value: string) {
  return value.trim().replace(/[\s_-]+/g, ' ');
}

export function detectCogsColumnMapping(headers: readonly string[]): CogsColumnMapping[] {
  const claimed = new Set<string>();
  return (Object.keys(FIELD_ALIASES) as CogsMappedField[]).map((field) => {
    const candidates = headers
      .map((header) => ({ header, normalised: normaliseHeader(header) }))
      .filter(({ header, normalised }) => !claimed.has(header) && FIELD_ALIASES[field].some((pattern) => pattern.test(normalised)));
    const exact = candidates.find(({ normalised }) => FIELD_ALIASES[field][0]?.test(normalised));
    const selected = exact ?? candidates[0];
    if (selected) claimed.add(selected.header);
    return { field, sourceColumn: selected?.header ?? null, confidence: selected ? exact ? 99 : 92 : 0, detectedBy: 'copilot' };
  });
}

export function parseDelimitedText(input: string): ParsedTabularData {
  const lines = input.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (!lines.length) return { headers: [], rows: [] };
  const delimiter = lines[0].includes('\t') ? '\t' : ',';
  function cells(line: string) {
    if (delimiter === '\t') return line.split('\t').map((cell) => cell.trim());
    const values: string[] = [];
    let current = '';
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];
      if (character === '"') {
        if (quoted && line[index + 1] === '"') { current += '"'; index += 1; }
        else quoted = !quoted;
      } else if (character === ',' && !quoted) { values.push(current.trim()); current = ''; }
      else current += character;
    }
    values.push(current.trim());
    return values;
  }
  const first = cells(lines[0]);
  const recognisedHeaders = detectCogsColumnMapping(first).filter((mapping) => mapping.sourceColumn).length;
  const hasHeaders = recognisedHeaders >= 2;
  const headers = hasHeaders ? first.map((value, index) => value || `Column ${index + 1}`) : first.map((_, index) => `Column ${index + 1}`);
  const dataLines = hasHeaders ? lines.slice(1) : lines;
  return {
    headers,
    rows: dataLines.map((line) => {
      const values = cells(line);
      return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
    }),
  };
}

export function parseCostMinor(value: string): number | null {
  const cleaned = value.trim().replace(/[£€$]/g, '').replace(/,/g, '');
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(cleaned)) return null;
  const numeric = Number(cleaned);
  return Number.isFinite(numeric) ? Math.round(numeric * 100) : null;
}

export function isIsoCogsDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

export function normaliseCogsCurrency(value: string) {
  const currency = value.trim().toUpperCase();
  return (SUPPORTED_COGS_CURRENCIES as readonly string[]).includes(currency) ? currency : null;
}

export function percentageAdjustedMinor(currentMinor: number, adjustmentBps: number) {
  return Math.round((currentMinor * (10_000 + adjustmentBps)) / 10_000);
}

export function cogsChangeBps(previousMinor: number | null | undefined, nextMinor: number | null | undefined) {
  if (previousMinor == null || nextMinor == null || previousMinor === 0) return null;
  return Math.round(((nextMinor - previousMinor) * 10_000) / Math.abs(previousMinor));
}

export function resolveCurrentCogsRecord(history: readonly COGSRecord[], onDate = COGS_TODAY) {
  return history
    .filter((record) => record.status === 'active' && record.effectiveFrom <= onDate && (record.effectiveTo === null || onDate < record.effectiveTo))
    .sort((left, right) => right.effectiveFrom.localeCompare(left.effectiveFrom))[0] ?? null;
}

export interface CogsInsertionPreview {
  predecessor: COGSRecord | null;
  predecessorDisposition: 'none' | 'shortened' | 'superseded';
  predecessorEffectiveToAfter: string | null;
  incomingEffectiveTo: string | null;
  next: COGSRecord | null;
}

/**
 * Projects the exact half-open ranges produced by an approved insertion.
 * Keeping review and mutation on this one rule prevents backdated previews
 * from comparing against today's cost instead of the cost effective then.
 */
export function previewApprovedCogsInsertion(history: readonly COGSRecord[], effectiveFrom: string): CogsInsertionPreview {
  const active = history.filter((record) => record.status === 'active').sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom));
  const next = active.find((record) => record.effectiveFrom > effectiveFrom) ?? null;
  const replaced = active.find((record) => record.effectiveFrom === effectiveFrom) ?? null;
  const covering = active.find((record) => record.effectiveFrom < effectiveFrom && (record.effectiveTo === null || effectiveFrom < record.effectiveTo)) ?? null;
  const predecessor = replaced ?? covering;
  return {
    predecessor,
    predecessorDisposition: replaced ? 'superseded' : covering ? 'shortened' : 'none',
    predecessorEffectiveToAfter: covering ? effectiveFrom : replaced?.effectiveTo ?? null,
    incomingEffectiveTo: next?.effectiveFrom ?? replaced?.effectiveTo ?? null,
    next,
  };
}

export function validateCogsHistory(history: readonly Pick<COGSRecord, 'id' | 'effectiveFrom' | 'effectiveTo' | 'status'>[]) {
  const active = history.filter((record) => record.status === 'active').sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom));
  const errors: string[] = [];
  active.forEach((record, index) => {
    if (!isIsoCogsDate(record.effectiveFrom)) errors.push(`${record.id}: invalid effective-from date`);
    if (record.effectiveTo && (!isIsoCogsDate(record.effectiveTo) || record.effectiveTo <= record.effectiveFrom)) errors.push(`${record.id}: invalid effective range`);
    const next = active[index + 1];
    if (next && (record.effectiveTo === null || record.effectiveTo > next.effectiveFrom)) errors.push(`${record.id}: overlaps ${next.id}`);
  });
  return errors;
}

export function insertApprovedCogsRecord(history: readonly COGSRecord[], incoming: COGSRecord) {
  const preview = previewApprovedCogsInsertion(history, incoming.effectiveFrom);
  const replaced = preview.predecessorDisposition === 'superseded' ? preview.predecessor : null;
  const covering = preview.predecessorDisposition === 'shortened' ? preview.predecessor : null;
  const updated = history.map((record): COGSRecord => {
    if (replaced && record.id === replaced.id) return { ...record, status: 'superseded' };
    if (covering && record.id === covering.id) return { ...record, effectiveTo: preview.predecessorEffectiveToAfter };
    return { ...record };
  });
  const created: COGSRecord = { ...incoming, status: 'active', effectiveTo: preview.incomingEffectiveTo };
  const result = [...updated, created];
  const errors = validateCogsHistory(result);
  if (errors.length) throw new Error(`Invalid COGS history: ${errors.join('; ')}`);
  return {
    history: result,
    created,
    previous: preview.predecessor,
    adjustedRecordIds: [replaced?.id, covering?.id].filter((value): value is string => Boolean(value)),
  };
}

export function canonicalRecordsFromHistory(input: {
  organisationId: string;
  companyId: string;
  productId: string;
  history: readonly HistoricalCogsRate[];
}): COGSRecord[] {
  return input.history.map((rate, index) => ({
    id: rate.id,
    organisationId: input.organisationId,
    companyId: input.companyId,
    productId: input.productId,
    unitCostMinor: rate.unitCostMinor,
    currency: rate.currency,
    effectiveFrom: rate.effectiveFrom,
    effectiveTo: rate.effectiveTo,
    status: 'active',
    source: rate.source ?? (index === 0 ? 'initial-import' : index === 1 ? 'bulk-edit' : 'csv-import'),
    sourceReferenceId: rate.sourceReferenceId,
    reason: rate.reason ?? (index === 0 ? 'Initial approved product cost.' : 'Supplier pricing update approved for the effective period.'),
    createdByUserId: rate.createdByUserId ?? (index === 1 ? 'usr-james-carter' : 'usr-emma-richardson'),
    createdByName: rate.createdByName ?? (index === 1 ? 'James Carter' : 'Emma Richardson'),
    createdAt: rate.createdAt ?? `${rate.effectiveFrom}T09:15:00.000Z`,
    changedByUserId: rate.createdByUserId ?? (index === 1 ? 'usr-james-carter' : 'usr-emma-richardson'),
    approvedByUserId: rate.approvedByUserId ?? 'usr-emma-richardson',
    approvedByName: rate.approvedByName ?? 'Emma Richardson',
    approvedAt: rate.approvedAt ?? `${rate.effectiveFrom}T09:15:00.000Z`,
    approvalStatus: 'approved',
  }));
}

export function cogsSourceLabel(source: COGSRecord['source']) {
  const labels: Record<COGSRecord['source'], string> = {
    'initial-import': 'Initial import',
    'csv-import': 'CSV import',
    'excel-import': 'Excel import',
    paste: 'Paste from Excel',
    'bulk-edit': 'Bulk update',
    'single-edit': 'Single edit',
    'percentage-adjustment': 'Percentage adjustment',
    'copilot-assisted-import': 'Copilot-assisted import',
  };
  return labels[source];
}

function mappedValue(rawValues: Record<string, string>, mapping: readonly CogsColumnMapping[], field: CogsMappedField) {
  const column = mapping.find((candidate) => candidate.field === field)?.sourceColumn;
  return column ? String(rawValues[column] ?? '').trim() : '';
}

function normaliseIdentifier(value: string) {
  return value.trim().toUpperCase();
}

function titleTokens(value: string) {
  return new Set(value.toLocaleLowerCase('en-GB').replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter((token) => token.length > 1));
}

export function titleSimilarity(left: string, right: string) {
  const leftTokens = titleTokens(left);
  const rightTokens = titleTokens(right);
  if (!leftTokens.size || !rightTokens.size) return 0;
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return Math.round((intersection / union) * 100);
}

export function deterministicImportSignature(headers: readonly string[], rows: readonly Record<string, string>[]) {
  const source = JSON.stringify([headers, rows.map((row) => headers.map((header) => row[header] ?? ''))]);
  let hash = 2_166_136_261;
  for (let index = 0; index < source.length; index += 1) { hash ^= source.charCodeAt(index); hash = Math.imul(hash, 16_777_619); }
  return (hash >>> 0).toString(36);
}

function anomaly(code: CogsAnomalyCode, label: string, detail: string, severity: 'warning' | 'error', blocking = severity === 'error'): CogsImportAnomaly {
  return { code, label, detail, severity, blocking };
}

const TIMELINE_ANOMALY_CODES = new Set<CogsAnomalyCode>([
  'existing_cost_conflict',
  'large_increase',
  'large_decrease',
  'currency_change',
]);

/**
 * Replays every valid, non-rejected row against a deterministic per-Product
 * timeline. This keeps cost-on-date comparisons and projected end dates exact
 * when one governed batch contains several effective dates for the same Product.
 */
export function reconcileCogsImportRowTimelines(
  sourceRows: readonly CogsImportRow[],
  histories: ReadonlyMap<string, readonly COGSRecord[]>,
) {
  const rows = sourceRows.map((row) => ({ ...row, anomalies: [...row.anomalies] }));
  const previousTimelineCodes = new Map(sourceRows.map((row) => [
    row.id,
    row.anomalies.filter((item) => TIMELINE_ANOMALY_CODES.has(item.code)).map((item) => item.code).sort().join('|'),
  ]));
  const groups = new Map<string, CogsImportRow[]>();
  rows.filter((row) => row.reviewStatus !== 'rejected'
    && row.proposedProductId
    && row.proposedEffectiveDate
    && row.proposedUnitCostMinor !== undefined
    && row.proposedUnitCostMinor >= 0
    && row.proposedCurrency
    && !row.anomalies.some((item) => item.blocking))
    .forEach((row) => groups.set(row.proposedProductId!, [...(groups.get(row.proposedProductId!) ?? []), row]));

  const updates = new Map<string, CogsImportRow>();
  groups.forEach((group, productId) => {
    const baseHistory = (histories.get(productId) ?? []).map((record) => ({ ...record }));
    let timeline = baseHistory;
    const ordered = [...group].sort((left, right) =>
      left.proposedEffectiveDate!.localeCompare(right.proposedEffectiveDate!)
      || left.sourceRowNumber - right.sourceRowNumber);
    ordered.forEach((row) => {
      const effectiveFrom = row.proposedEffectiveDate!;
      const unitCostMinor = row.proposedUnitCostMinor!;
      const currency = row.proposedCurrency!;
      const projectedRecordId = `${row.batchId}:cogs:${row.id.split(':').at(-1)}`;
      const insertion = previewApprovedCogsInsertion(timeline, effectiveFrom);
      const comparison = insertion.predecessor;
      const anomalies = row.anomalies.filter((item) => !TIMELINE_ANOMALY_CODES.has(item.code));
      const change = cogsChangeBps(comparison?.unitCostMinor, unitCostMinor);
      if (change !== null && change > LARGE_COGS_CHANGE_BPS) anomalies.push(anomaly('large_increase', 'Large cost increase', `The proposed cost is ${(change / 100).toFixed(1)}% above the cost effective on ${effectiveFrom}.`, 'warning'));
      if (change !== null && change < -LARGE_COGS_CHANGE_BPS) anomalies.push(anomaly('large_decrease', 'Large cost decrease', `The proposed cost is ${(Math.abs(change) / 100).toFixed(1)}% below the cost effective on ${effectiveFrom}.`, 'warning'));
      if (comparison && comparison.currency !== currency) anomalies.push(anomaly('currency_change', 'Currency changed', `${comparison.currency} → ${currency}. No automatic conversion will be applied to the stored unit cost.`, 'warning'));
      const sameDate = baseHistory.find((record) => record.status === 'active' && record.effectiveFrom === effectiveFrom);
      if (sameDate && (sameDate.unitCostMinor !== unitCostMinor || sameDate.currency !== currency)) anomalies.push(anomaly('existing_cost_conflict', 'Existing COGS conflict', 'An approved cost already starts on this effective date. Approval will create an audited correction.', 'warning'));
      const timelineCodes = anomalies.filter((item) => TIMELINE_ANOMALY_CODES.has(item.code)).map((item) => item.code).sort().join('|');
      const reviewStatus = row.reviewStatus === 'accepted'
        && timelineCodes
        && timelineCodes !== previousTimelineCodes.get(row.id)
        ? 'pending' as const
        : row.reviewStatus;
      const nextRow: CogsImportRow = {
        ...row,
        currentUnitCostMinor: comparison?.unitCostMinor ?? null,
        currentCurrency: comparison?.currency ?? null,
        comparisonRecordId: comparison?.id,
        comparisonEffectiveFrom: comparison?.effectiveFrom,
        comparisonEffectiveTo: comparison ? comparison.effectiveTo : undefined,
        comparisonDisposition: insertion.predecessorDisposition,
        projectedEffectiveTo: insertion.incomingEffectiveTo,
        anomalies,
        reviewStatus,
      };
      const simulated: COGSRecord = {
        id: projectedRecordId,
        organisationId: 'preview',
        companyId: 'preview',
        productId,
        unitCostMinor,
        currency,
        effectiveFrom,
        effectiveTo: null,
        status: 'active',
        source: 'csv-import',
        reason: 'Governed batch preview',
        createdByUserId: 'preview',
        createdByName: 'Preview',
        createdAt: `${effectiveFrom}T00:00:00.000Z`,
        changedByUserId: 'preview',
        approvedByUserId: 'preview',
        approvedByName: 'Preview',
        approvedAt: `${effectiveFrom}T00:00:00.000Z`,
        approvalStatus: 'approved',
      };
      timeline = insertApprovedCogsRecord(timeline, simulated).history;
      updates.set(row.id, nextRow);
    });
    ordered.forEach((row) => {
      const update = updates.get(row.id);
      const projectedRecordId = `${row.batchId}:cogs:${row.id.split(':').at(-1)}`;
      const finalRecord = timeline.find((record) => record.id === projectedRecordId);
      if (update && finalRecord) updates.set(row.id, { ...update, projectedEffectiveTo: finalRecord.effectiveTo });
    });
  });
  return rows.map((row) => updates.get(row.id) ?? row);
}

export function buildCogsImportRows(input: {
  batchId: string;
  rawRows: readonly Record<string, string>[];
  mapping: readonly CogsColumnMapping[];
  products: readonly Product[];
  listings: readonly MarketplaceListing[];
  selectedCompanyId: string;
  companyName: string;
  histories: ReadonlyMap<string, readonly COGSRecord[]>;
  batchCurrency?: string;
  batchEffectiveDate?: string;
  today?: string;
}) {
  const today = input.today ?? COGS_TODAY;
  const companyProducts = input.products.filter((product) => product.ownerCompanyId === input.selectedCompanyId);
  const productById = new Map(companyProducts.map((product) => [product.id, product]));
  const companyListings = input.listings.filter((listing) => listing.companyId === input.selectedCompanyId && productById.has(listing.productId));
  const bySku = new Map<string, Product[]>();
  companyProducts.forEach((product) => bySku.set(normaliseIdentifier(product.internalSku), [...(bySku.get(normaliseIdentifier(product.internalSku)) ?? []), product]));
  function productsForListing(field: 'marketplaceSku' | 'asin' | 'ean', value: string) {
    const ids = companyListings.filter((listing) => normaliseIdentifier(String(listing[field] ?? '')) === normaliseIdentifier(value)).map((listing) => listing.productId);
    return [...new Set(ids)].map((id) => productById.get(id)).filter((product): product is Product => Boolean(product));
  }

  const rows: CogsImportRow[] = input.rawRows.map((rawValues, rowIndex) => {
    const internalSku = mappedValue(rawValues, input.mapping, 'internalSku');
    const marketplaceSku = mappedValue(rawValues, input.mapping, 'marketplaceSku');
    const asin = mappedValue(rawValues, input.mapping, 'asin');
    const ean = mappedValue(rawValues, input.mapping, 'ean');
    const sourceTitle = mappedValue(rawValues, input.mapping, 'title');
    const rawCost = mappedValue(rawValues, input.mapping, 'unitCost');
    const rawCurrency = mappedValue(rawValues, input.mapping, 'currency') || input.batchCurrency || '';
    const rawDate = mappedValue(rawValues, input.mapping, 'effectiveDate') || input.batchEffectiveDate || '';
    const sourceCompany = mappedValue(rawValues, input.mapping, 'company');
    const anomalies: CogsImportAnomaly[] = [];
    let matches: Product[] = [];
    let matchType: CogsMatchType = 'unmatched';
    let confidence: number | undefined;
    const evidence: CogsMatchEvidence[] = [];

    if (sourceCompany && normaliseIdentifier(sourceCompany) !== normaliseIdentifier(input.companyName)) anomalies.push(anomaly('company_mismatch', 'Company mismatch', `The row names ${sourceCompany}; this batch is restricted to ${input.companyName}.`, 'error'));
    if (internalSku) {
      matches = bySku.get(normaliseIdentifier(internalSku)) ?? [];
      if (matches.length === 1) { matchType = 'exact'; confidence = 100; evidence.push({ kind: 'internal-sku', detail: `Internal SKU matches inside ${input.companyName}.` }); }
    }
    if (!matches.length && marketplaceSku) {
      matches = productsForListing('marketplaceSku', marketplaceSku);
      if (matches.length === 1) { matchType = 'exact'; confidence = 99; evidence.push({ kind: 'marketplace-sku', detail: `Marketplace SKU resolves through a ${input.companyName} listing.` }); }
    }
    if (!matches.length && asin) {
      matches = productsForListing('asin', asin);
      if (matches.length === 1) { matchType = 'exact'; confidence = 97; evidence.push({ kind: 'asin', detail: `ASIN resolves to one Product inside ${input.companyName}.` }); }
    }
    if (!matches.length && ean) {
      matches = productsForListing('ean', ean);
      if (matches.length === 1) { matchType = 'exact'; confidence = 96; evidence.push({ kind: 'ean', detail: `EAN resolves to one Product inside ${input.companyName}.` }); }
    }
    if (!matches.length && sourceTitle) {
      const suggestions = companyProducts.map((product) => ({ product, score: titleSimilarity(sourceTitle, product.title) })).sort((left, right) => right.score - left.score);
      if (suggestions[0]?.score >= 50 && (suggestions[0].score - (suggestions[1]?.score ?? 0) >= 8)) {
        matches = [suggestions[0].product]; matchType = 'suggested'; confidence = Math.min(94, suggestions[0].score); evidence.push({ kind: 'title', detail: `Product-title similarity is ${suggestions[0].score}%.` });
      }
    }
    if (matches.length > 1) { matchType = 'unmatched'; confidence = undefined; anomalies.push(anomaly('ambiguous_identifier', 'Ambiguous identifier', 'More than one Product in the selected Company uses this marketplace identifier.', 'error')); }
    if (!internalSku && !marketplaceSku && !asin && !ean && !sourceTitle) anomalies.push(anomaly('blank_identifier', 'Identifier required', 'Map an internal SKU, marketplace SKU, ASIN, EAN or Product title.', 'error'));
    const product = matches.length === 1 ? matches[0] : undefined;
    if (!product && !anomalies.some((item) => item.code === 'ambiguous_identifier')) anomalies.push(anomaly('unmatched_product', 'Product match required', 'No Product in the selected Company matched this row.', 'error'));

    const unitCostMinor = parseCostMinor(rawCost);
    if (unitCostMinor === null) anomalies.push(anomaly('invalid_cost', 'Invalid cost', 'Enter a decimal unit cost using a dot, for example 7.20.', 'error'));
    else if (unitCostMinor < 0) anomalies.push(anomaly('negative_cost', 'Invalid negative cost', 'Negative unit cost cannot be approved.', 'error'));
    else if (unitCostMinor === 0) anomalies.push(anomaly('zero_cost', 'Zero cost', 'Zero may be legitimate, but it requires explicit financial review.', 'warning'));

    const currency = normaliseCogsCurrency(rawCurrency);
    if (!rawCurrency) anomalies.push(anomaly('missing_currency', 'Currency required', 'Map a currency column or explicitly confirm a batch currency.', 'error'));
    else if (!currency) anomalies.push(anomaly('unsupported_currency', 'Currency code not recognised', `${rawCurrency} is not supported by this prototype.`, 'error'));
    if (!rawDate) anomalies.push(anomaly('missing_effective_date', 'Effective date required', 'Map a date column or explicitly set a batch effective date.', 'error'));
    else if (!isIsoCogsDate(rawDate)) anomalies.push(anomaly('invalid_date', 'Invalid effective date', 'Use an unambiguous ISO date such as 2026-09-01.', 'error'));

    const history = product ? input.histories.get(product.id) ?? [] : [];
    const insertionPreview = product && rawDate && isIsoCogsDate(rawDate)
      ? previewApprovedCogsInsertion(history, rawDate)
      : null;
    const effectiveRecord = insertionPreview?.predecessor ?? null;
    const change = cogsChangeBps(effectiveRecord?.unitCostMinor, unitCostMinor);
    if (change !== null && change > LARGE_COGS_CHANGE_BPS) anomalies.push(anomaly('large_increase', 'Large cost increase', `The proposed cost is ${(change / 100).toFixed(1)}% above the cost effective on ${rawDate}.`, 'warning'));
    if (change !== null && change < -LARGE_COGS_CHANGE_BPS) anomalies.push(anomaly('large_decrease', 'Large cost decrease', `The proposed cost is ${(Math.abs(change) / 100).toFixed(1)}% below the cost effective on ${rawDate}.`, 'warning'));
    if (effectiveRecord && currency && effectiveRecord.currency !== currency) anomalies.push(anomaly('currency_change', 'Currency changed', `${effectiveRecord.currency} → ${currency}. No automatic conversion will be applied to the stored unit cost.`, 'warning'));
    if (rawDate && isIsoCogsDate(rawDate) && rawDate > today) anomalies.push(anomaly('future_date', 'Scheduled cost', `This cost becomes effective ${rawDate}; today’s cost remains current until then.`, 'warning', false));
    if (rawDate && isIsoCogsDate(rawDate) && rawDate < today) anomalies.push(anomaly('backdated_date', 'Backdated cost', `This cost starts before ${today}; historical profitability will be recalculated for its exact effective range.`, 'warning'));
    if (product && sourceTitle && titleSimilarity(sourceTitle, product.title) < 35 && matchType === 'exact') anomalies.push(anomaly('title_mismatch', 'Title differs from matched Product', 'A strong identifier matched, but the source title looks materially different.', 'warning'));
    if (product && unitCostMinor !== null && currency && rawDate && isIsoCogsDate(rawDate)) {
      const sameDate = history.find((record) => record.status === 'active' && record.effectiveFrom === rawDate);
      if (sameDate && (sameDate.unitCostMinor !== unitCostMinor || sameDate.currency !== currency)) anomalies.push(anomaly('existing_cost_conflict', 'Existing COGS conflict', 'An approved cost already starts on this effective date. Approval will create an audited correction.', 'warning'));
    }

    return {
      id: `${input.batchId}:row-${String(rowIndex + 1).padStart(4, '0')}`,
      batchId: input.batchId,
      sourceRowNumber: rowIndex + 2,
      rawValues: { ...rawValues },
      sourceIdentifier: internalSku || marketplaceSku || asin || '—',
      sourceTitle,
      proposedProductId: product?.id,
      proposedProductTitle: product?.title,
      proposedProductSku: product?.internalSku,
      matchType,
      matchConfidence: confidence,
      matchEvidence: evidence,
      proposedUnitCostMinor: unitCostMinor ?? undefined,
      proposedCurrency: currency ?? undefined,
      proposedEffectiveDate: isIsoCogsDate(rawDate) ? rawDate : undefined,
      currentUnitCostMinor: effectiveRecord?.unitCostMinor ?? null,
      currentCurrency: effectiveRecord?.currency ?? null,
      comparisonRecordId: effectiveRecord?.id,
      comparisonEffectiveFrom: effectiveRecord?.effectiveFrom,
      comparisonEffectiveTo: effectiveRecord ? effectiveRecord.effectiveTo : undefined,
      comparisonDisposition: insertionPreview?.predecessorDisposition,
      projectedEffectiveTo: insertionPreview ? insertionPreview.incomingEffectiveTo : undefined,
      anomalies,
      reviewStatus: matchType === 'exact' && anomalies.length === 0 ? 'accepted' : 'pending',
    };
  });

  const grouped = new Map<string, CogsImportRow[]>();
  rows.forEach((row) => {
    const key = `${row.proposedProductId ?? normaliseIdentifier(row.sourceIdentifier)}|${row.proposedEffectiveDate ?? ''}`;
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  });

  /*
   * Preview valid rows in the same source-row order used by atomic apply. A
   * later proposal for the same Product must therefore compare with (and may
   * shorten) an earlier proposal in this batch, rather than every row being
   * projected independently against the persisted history. Same-date groups
   * are deliberately excluded: duplicate/conflicting rows remain blocking and
   * no arbitrary member is allowed to influence another row's preview.
   */
  const duplicateKeys = new Set([...grouped.entries()].filter(([, group]) => group.length > 1).map(([key]) => key));
  const simulatedHistories = new Map<string, COGSRecord[]>();
  const simulatedRecordIds = new Map<string, string>();
  const comparisonAnomalyCodes = new Set<CogsAnomalyCode>(['large_increase', 'large_decrease', 'currency_change', 'existing_cost_conflict']);
  rows.forEach((row) => {
    const key = `${row.proposedProductId ?? normaliseIdentifier(row.sourceIdentifier)}|${row.proposedEffectiveDate ?? ''}`;
    if (duplicateKeys.has(key)
      || !row.proposedProductId
      || row.proposedUnitCostMinor === undefined
      || row.proposedUnitCostMinor < 0
      || !row.proposedCurrency
      || !row.proposedEffectiveDate
      || row.anomalies.some((item) => item.blocking)) return;

    const product = productById.get(row.proposedProductId);
    if (!product) return;
    row.anomalies = row.anomalies.filter((item) => !comparisonAnomalyCodes.has(item.code));
    const history = simulatedHistories.get(product.id) ?? [...(input.histories.get(product.id) ?? [])];
    const insertionPreview = previewApprovedCogsInsertion(history, row.proposedEffectiveDate);
    const effectiveRecord = insertionPreview.predecessor;
    const change = cogsChangeBps(effectiveRecord?.unitCostMinor, row.proposedUnitCostMinor);
    if (change !== null && change > LARGE_COGS_CHANGE_BPS) row.anomalies.push(anomaly('large_increase', 'Large cost increase', `The proposed cost is ${(change / 100).toFixed(1)}% above the cost effective on ${row.proposedEffectiveDate}.`, 'warning'));
    if (change !== null && change < -LARGE_COGS_CHANGE_BPS) row.anomalies.push(anomaly('large_decrease', 'Large cost decrease', `The proposed cost is ${(Math.abs(change) / 100).toFixed(1)}% below the cost effective on ${row.proposedEffectiveDate}.`, 'warning'));
    if (effectiveRecord && effectiveRecord.currency !== row.proposedCurrency) row.anomalies.push(anomaly('currency_change', 'Currency changed', `${effectiveRecord.currency} → ${row.proposedCurrency}. No automatic conversion will be applied to the stored unit cost.`, 'warning'));
    if (insertionPreview.predecessorDisposition === 'superseded') row.anomalies.push(anomaly('existing_cost_conflict', 'Existing COGS conflict', 'An approved cost already starts on this effective date. Approval will create an audited correction.', 'warning'));

    row.currentUnitCostMinor = effectiveRecord?.unitCostMinor ?? null;
    row.currentCurrency = effectiveRecord?.currency ?? null;
    row.comparisonRecordId = effectiveRecord?.id;
    row.comparisonEffectiveFrom = effectiveRecord?.effectiveFrom;
    row.comparisonEffectiveTo = effectiveRecord ? effectiveRecord.effectiveTo : undefined;
    row.comparisonDisposition = insertionPreview.predecessorDisposition;
    row.projectedEffectiveTo = insertionPreview.incomingEffectiveTo;
    row.reviewStatus = row.matchType === 'exact' && row.anomalies.length === 0 ? 'accepted' : 'pending';

    const simulatedRecordId = `${input.batchId}:cogs:${row.id.split(':').at(-1)}`;
    const inserted = insertApprovedCogsRecord(history, {
      id: simulatedRecordId,
      organisationId: product.organisationId,
      companyId: product.ownerCompanyId,
      productId: product.id,
      unitCostMinor: row.proposedUnitCostMinor,
      currency: row.proposedCurrency,
      effectiveFrom: row.proposedEffectiveDate,
      effectiveTo: null,
      status: 'active',
      source: 'csv-import',
      sourceReferenceId: input.batchId,
      reason: 'Batch range preview',
      createdByUserId: 'cogs-range-preview',
      createdByName: 'COGS range preview',
      createdAt: `${today}T00:00:00.000Z`,
      changedByUserId: 'cogs-range-preview',
      approvedByUserId: 'cogs-range-preview',
      approvedByName: 'COGS range preview',
      approvedAt: `${today}T00:00:00.000Z`,
      approvalStatus: 'approved',
    });
    simulatedHistories.set(product.id, inserted.history);
    simulatedRecordIds.set(row.id, simulatedRecordId);
  });

  // A later source row may shorten an earlier proposal, so persist the final
  // projected end date after the complete per-Product simulation has settled.
  rows.forEach((row) => {
    const simulatedRecordId = simulatedRecordIds.get(row.id);
    if (!simulatedRecordId || !row.proposedProductId) return;
    const finalRecord = simulatedHistories.get(row.proposedProductId)?.find((record) => record.id === simulatedRecordId);
    if (finalRecord) row.projectedEffectiveTo = finalRecord.effectiveTo;
  });

  grouped.forEach((group) => {
    if (group.length < 2) return;
    const values = new Set(group.map((row) => `${row.proposedUnitCostMinor}|${row.proposedCurrency}`));
    group.forEach((row) => {
      row.anomalies.push(values.size === 1
        ? anomaly('duplicate_row', 'Duplicate row', 'The same Product, effective date and cost appears more than once.', 'error')
        : anomaly('conflicting_duplicate', 'Conflicting cost rows', 'This file proposes different costs for the same Product and effective date.', 'error'));
      row.reviewStatus = 'pending';
    });
  });
  return reconcileCogsImportRowTimelines(rows, input.histories);
}

export function summariseImportRows(rows: readonly CogsImportRow[]) {
  return {
    rowCount: rows.length,
    matchedCount: rows.filter((row) => row.matchType === 'exact' || row.matchType === 'manual').length,
    suggestedCount: rows.filter((row) => row.matchType === 'suggested').length,
    unmatchedCount: rows.filter((row) => row.matchType === 'unmatched').length,
    anomalyCount: rows.filter((row) => row.anomalies.length > 0).length,
  };
}

export function importRowReady(row: CogsImportRow) {
  return row.reviewStatus === 'accepted'
    && Boolean(row.proposedProductId)
    && row.proposedUnitCostMinor !== undefined
    && row.proposedUnitCostMinor >= 0
    && Boolean(row.proposedCurrency)
    && Boolean(row.proposedEffectiveDate)
    && (!row.inheritedGroupId || row.groupOverrideAcknowledged === true)
    && !row.anomalies.some((item) => item.blocking);
}
