import { materializeExpensesDataset } from '@/src/services/mock/expenses-store';
import type { AnalyticsDataset, CurrencyCode, HistoricalCogsRate } from '@/src/domain/analytics';
import type { COGSRecord } from '@/src/domain/models';
import { deriveInheritedCogsMinor, type ProductGroupCostRecord, type ProductGroupMembership } from '@/src/domain/product-groups';
import { resolveHistoricalUnitCogs } from '@/src/domain/financial-calculations';
import { mockCogsManagementStore, organisationCogsState } from '@/src/services/mock/cogs-management-store';
import { mockProductGroupsRepository } from '@/src/services/mock/product-groups-repository';
import { mockProductGroupsStore, organisationProductGroupsState } from '@/src/services/mock/product-groups-store';

const REPORTING_RATE_BPS: Record<CurrencyCode, number> = { GBP: 10_000, EUR: 8_600, USD: 7_800 };

export function historicalRateFromRecord(record: COGSRecord): HistoricalCogsRate {
  return {
    id: record.id,
    productId: record.productId,
    unitCostMinor: record.unitCostMinor,
    currency: record.currency as CurrencyCode,
    effectiveFrom: record.effectiveFrom,
    effectiveTo: record.effectiveTo,
    source: record.source,
    sourceReferenceId: record.sourceReferenceId,
    reason: record.reason,
    createdByUserId: record.createdByUserId,
    createdByName: record.createdByName,
    createdAt: record.createdAt,
    approvedByUserId: record.approvedByUserId,
    approvedByName: record.approvedByName,
    approvedAt: record.approvedAt,
  };
}

function reportingUnitCost(history: HistoricalCogsRate[], productId: string, occurredOn: string) {
  const sourceMinor = resolveHistoricalUnitCogs(history, productId, occurredOn);
  if (sourceMinor === null) return null;
  const date = occurredOn.slice(0, 10);
  const rate = history
    .filter((candidate) => candidate.productId === productId && candidate.effectiveFrom <= date && (candidate.effectiveTo === null || date < candidate.effectiveTo))
    .sort((left, right) => right.effectiveFrom.localeCompare(left.effectiveFrom))[0];
  return Math.round((sourceMinor * REPORTING_RATE_BPS[rate?.currency ?? 'GBP']) / 10_000);
}

function minimumEnd(left: string | null, right: string | null) {
  if (left === null) return right;
  if (right === null) return left;
  return left < right ? left : right;
}

function rangesOverlap(
  left: Pick<HistoricalCogsRate, 'effectiveFrom' | 'effectiveTo'>,
  right: Pick<HistoricalCogsRate, 'effectiveFrom' | 'effectiveTo'>,
) {
  return (left.effectiveTo === null || right.effectiveFrom < left.effectiveTo)
    && (right.effectiveTo === null || left.effectiveFrom < right.effectiveTo);
}

function inheritedRate(
  membership: ProductGroupMembership,
  cost: ProductGroupCostRecord,
  groupName: string,
): HistoricalCogsRate | null {
  const effectiveFrom = membership.effectiveFrom > cost.effectiveFrom ? membership.effectiveFrom : cost.effectiveFrom;
  const effectiveTo = minimumEnd(membership.effectiveTo, cost.effectiveTo);
  if (effectiveTo !== null && effectiveFrom >= effectiveTo) return null;
  const currency = cost.currency as CurrencyCode;
  return {
    id: `inherited:${membership.id}:${cost.id}:${effectiveFrom}`,
    productId: membership.productId,
    unitCostMinor: deriveInheritedCogsMinor(cost.baseCostMinor, membership.packQuantity, cost.baseQuantity),
    currency,
    effectiveFrom,
    effectiveTo,
    sourceReferenceId: `product-group:${membership.groupId}`,
    reason: cost.reason,
    createdByUserId: cost.createdByUserId,
    createdByName: cost.createdByName,
    createdAt: cost.createdAt,
    approvedByUserId: cost.approvedByUserId,
    approvedByName: cost.approvedByName,
    approvedAt: cost.approvedAt,
    inheritance: {
      productGroupId: membership.groupId,
      productGroupName: groupName,
      membershipId: membership.id,
      groupCostRecordId: cost.id,
      packQuantity: membership.packQuantity,
      baseQuantity: cost.baseQuantity,
      baseCostMinor: cost.baseCostMinor,
      currency,
      membershipEffectiveFrom: membership.effectiveFrom,
      groupCostEffectiveFrom: cost.effectiveFrom,
    },
  };
}

/** Removes every direct-COGS interval from an inherited interval. */
function subtractDirectRanges(inherited: HistoricalCogsRate, directRates: HistoricalCogsRate[]) {
  let pieces: HistoricalCogsRate[] = [inherited];
  directRates.forEach((direct) => {
    pieces = pieces.flatMap((piece) => {
      if (!rangesOverlap(piece, direct)) return [piece];
      const next: HistoricalCogsRate[] = [];
      if (piece.effectiveFrom < direct.effectiveFrom) {
        next.push({ ...piece, id: `${piece.id}:before:${direct.id}`, effectiveTo: direct.effectiveFrom });
      }
      if (direct.effectiveTo !== null && (piece.effectiveTo === null || direct.effectiveTo < piece.effectiveTo)) {
        next.push({ ...piece, id: `${piece.id}:after:${direct.id}`, effectiveFrom: direct.effectiveTo });
      }
      return next;
    });
  });
  return pieces;
}

/**
 * Builds the single canonical Product COGS timeline used by Dashboard, Products
 * and COGS. Direct approved Product records win for their own intervals;
 * otherwise Group membership and Group cost must both be effective. A Group
 * membership without a cost intentionally produces a gap rather than zero.
 */
export function materializeProductGroupCogsHistory(
  base: AnalyticsDataset,
  organisationId: string,
  recordsByProduct: Readonly<Record<string, readonly COGSRecord[]>>,
) {
  mockProductGroupsRepository.ensureSeeded(
    organisationId,
    base,
    [...new Set(base.products.filter((product) => product.organisationId === organisationId).map((product) => product.ownerCompanyId))],
  );
  const state = organisationProductGroupsState(mockProductGroupsStore.read(), organisationId);
  const memberships = Object.values(state.membershipsByGroup).flat()
    .filter((membership) => membership.organisationId === organisationId && membership.status === 'active');
  const costs = Object.values(state.costRecordsByGroup).flat()
    .filter((cost) => cost.organisationId === organisationId && cost.status === 'active');
  const groupedProductIds = new Set(memberships.map((membership) => membership.productId));
  const directlyOverriddenProductIds = new Set(Object.keys(recordsByProduct));
  const affectedProductIds = new Set([...groupedProductIds, ...directlyOverriddenProductIds]);
  if (!affectedProductIds.size) return base.cogsHistory;

  const unaffected = base.cogsHistory.filter((rate) => !affectedProductIds.has(rate.productId));
  const projected: HistoricalCogsRate[] = [];
  affectedProductIds.forEach((productId) => {
    const product = base.products.find((candidate) => candidate.id === productId && candidate.organisationId === organisationId);
    if (!product) return;
    const productMemberships = memberships.filter((membership) => membership.productId === productId
      && membership.companyId === product.ownerCompanyId);
    const directRates = (recordsByProduct[productId] ?? [])
      .filter((record) => record.organisationId === organisationId
        && record.companyId === product.ownerCompanyId
        && record.approvalStatus === 'approved'
        && record.status === 'active'
        && Number.isSafeInteger(record.unitCostMinor)
        && record.unitCostMinor >= 0)
      .map(historicalRateFromRecord);

    if (!productMemberships.length) {
      projected.push(...directRates);
      return;
    }

    // Synthetic fixture COGS remains useful before a Product first joins a
    // Group, but it is not allowed to shadow Group inheritance afterwards.
    const firstMembershipDate = [...productMemberships]
      .sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom))[0].effectiveFrom;
    projected.push(...base.cogsHistory
      .filter((rate) => rate.productId === productId && rate.effectiveFrom < firstMembershipDate)
      .flatMap((rate) => {
        const effectiveTo = minimumEnd(rate.effectiveTo, firstMembershipDate);
        return effectiveTo !== null && rate.effectiveFrom >= effectiveTo ? [] : [{ ...rate, effectiveTo }];
      }));

    const inherited = productMemberships.flatMap((membership) => {
      const group = state.groups[membership.groupId];
      if (!group || group.organisationId !== organisationId || group.companyId !== product.ownerCompanyId) return [];
      return costs
        .filter((cost) => cost.groupId === group.id && cost.companyId === group.companyId)
        .flatMap((cost) => {
          const rate = inheritedRate(membership, cost, group.name);
          return rate ? [rate] : [];
        });
    });
    projected.push(...inherited.flatMap((rate) => subtractDirectRanges(rate, directRates)), ...directRates);
  });
  return [...unaffected, ...projected].sort((left, right) => left.productId.localeCompare(right.productId)
    || left.effectiveFrom.localeCompare(right.effectiveFrom)
    || left.id.localeCompare(right.id));
}

/**
 * Applies only approved canonical records. Draft imports never enter this
 * projection, so Dashboard and Product profitability cannot observe proposals.
 */
export function materializeApprovedCogsDataset(
  base: AnalyticsDataset,
  organisationId: string,
  projectedRecordsByProduct?: Readonly<Record<string, readonly COGSRecord[]>>,
): AnalyticsDataset {
  const recordsByProduct = projectedRecordsByProduct
    ?? organisationCogsState(mockCogsManagementStore.read(), organisationId).recordsByProduct;
  const cogsHistory = materializeProductGroupCogsHistory(base, organisationId, recordsByProduct);
  const records = base.records.map((record) => {
    const unitCostMinor = reportingUnitCost(cogsHistory, record.productId, record.occurredOn);
    return { ...record, cogsMinor: unitCostMinor === null ? null : unitCostMinor * record.units };
  });
  return materializeExpensesDataset({ ...base, cogsHistory, records }, organisationId);
}
