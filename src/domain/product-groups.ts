import type {
  COGSRecord,
  Marketplace,
  MarketplaceListing,
  Product,
} from '@/src/domain/models';

export type ProductGroupStatus = 'active' | 'inactive';
export type ProductGroupRecordStatus = 'active' | 'superseded';
export type ProductGroupCogsStatus = 'complete' | 'missing' | 'scheduled';

export interface ProductGroupProductReference {
  id: string;
  internalSku: string;
  title: string;
}

/** A Company-owned costing construct; it is deliberately not a Product master. */
export interface ProductGroup {
  id: string;
  organisationId: string;
  companyId: string;
  name: string;
  description: string;
  baseProduct: ProductGroupProductReference;
  /** Current snapshot for list/edit UX. Historical calculations use the cost record. */
  baseQuantity: number;
  unitOfMeasure: string;
  /** Current/default ISO 4217 currency. Historical calculations use the cost record. */
  currency: string;
  status: ProductGroupStatus;
  createdByUserId: string;
  createdByName: string;
  createdAt: string;
  updatedByUserId: string;
  updatedByName: string;
  updatedAt: string;
}

/**
 * One approved effective-dated costing basis for a Product Group.
 * `baseQuantity` lives on the record so later quantity changes cannot rewrite
 * historical profitability.
 */
export interface ProductGroupCostRecord {
  id: string;
  organisationId: string;
  companyId: string;
  groupId: string;
  baseCostMinor: number;
  baseQuantity: number;
  /** ISO 4217 currency code for baseCostMinor. */
  currency: string;
  effectiveFrom: string;
  /** Exclusive end date; null means the record remains effective indefinitely. */
  effectiveTo: string | null;
  status: ProductGroupRecordStatus;
  source: string;
  reason: string;
  createdByUserId: string;
  createdByName: string;
  createdAt: string;
  approvedByUserId: string;
  approvedByName: string;
  approvedAt: string;
  approvalStatus: 'approved';
}

/**
 * A Product's effective-dated membership. Pack quantity is recorded here—not
 * on Product—so joins, leaves and pack changes preserve historical results.
 */
export interface ProductGroupMembership {
  id: string;
  organisationId: string;
  companyId: string;
  groupId: string;
  productId: string;
  packQuantity: number;
  effectiveFrom: string;
  /** Exclusive end date; null means the membership remains effective. */
  effectiveTo: string | null;
  status: ProductGroupRecordStatus;
  reason: string;
  createdByUserId: string;
  createdByName: string;
  createdAt: string;
  approvedByUserId: string;
  approvedByName: string;
  approvedAt: string;
  approvalStatus: 'approved';
}

export interface ProductGroupActor {
  id: string;
  name: string;
  /** Company assignments are a mandatory server/repository boundary. */
  companyIds: 'all' | string[];
  permissions: {
    edit: boolean;
    approve: boolean;
  };
}

export interface ProductGroupMemberInput {
  productId: string;
  packQuantity: number;
  /** Defaults to the Group's first cost date. */
  effectiveFrom?: string;
}

export interface CreateProductGroupInput {
  organisationId: string;
  companyId: string;
  name: string;
  description: string;
  baseProductId: string;
  baseQuantity: number;
  unitOfMeasure: string;
  currency: string;
  baseCostMinor: number;
  effectiveFrom: string;
  source: string;
  reason: string;
  members: ProductGroupMemberInput[];
  actor: ProductGroupActor;
}

export interface ProductGroupCostProposalInput {
  organisationId: string;
  companyId: string;
  groupId: string;
  baseCostMinor: number;
  /** Defaults to the currently-effective basis when omitted. */
  baseQuantity?: number;
  /** Defaults to the currently-effective currency when omitted. */
  currency?: string;
  effectiveFrom: string;
  source: string;
  reason: string;
  financiallyConfirmed: boolean;
  actor: ProductGroupActor;
}

export interface ProductGroupMemberCostImpact {
  productId: string;
  productName: string;
  internalSku: string;
  packQuantity: number;
  currentCostMinor: number | null;
  proposedCostMinor: number;
}

export type ProductGroupCostProposalStatus =
  | 'draft'
  | 'awaiting-approval'
  | 'applying'
  | 'recalculating'
  | 'applied'
  | 'failed'
  | 'cancelled';

export interface ProductGroupCostProposal {
  id: string;
  organisationId: string;
  companyId: string;
  groupId: string;
  currentCost: ProductGroupCostRecord | null;
  proposedBaseCostMinor: number;
  proposedBaseQuantity: number;
  proposedCurrency: string;
  effectiveFrom: string;
  source: string;
  reason: string;
  financiallyConfirmed: boolean;
  memberImpacts: ProductGroupMemberCostImpact[];
  status: ProductGroupCostProposalStatus;
  createdByUserId: string;
  createdByName: string;
  createdAt: string;
  approvedByUserId?: string;
  approvedByName?: string;
  approvedAt?: string;
  appliedAt?: string;
  failureMessage?: string;
}

export interface ProductGroupMembershipChangeInput {
  organisationId: string;
  companyId: string;
  groupId: string;
  productId: string;
  action: 'add' | 'remove' | 'change-pack-quantity';
  effectiveFrom: string;
  packQuantity?: number;
  reason: string;
  actor: ProductGroupActor;
}

export type ProductGroupAuditAction =
  | 'product-group.created'
  | 'product-group.member-added'
  | 'product-group.member-removed'
  | 'product-group.pack-quantity-changed'
  | 'product-group.base-quantity-changed'
  | 'product-group.base-cost-changed'
  | 'product-group.direct-override-created';

export interface ProductGroupAuditEvent {
  id: string;
  organisationId: string;
  companyId: string;
  groupId: string;
  actorUserId: string;
  actorName: string;
  action: ProductGroupAuditAction;
  targetType: 'product-group' | 'product-group-cost' | 'product-group-membership' | 'product-cogs';
  targetId: string;
  occurredAt: string;
  previousValue: unknown;
  newValue: unknown;
  reason: string;
}

export interface ProductGroupListQuery {
  organisationId: string;
  authorisedCompanyIds: string[];
  authorisedAccountIds: string[];
  search: string;
  companyId: string | 'all';
  marketplace: Marketplace | 'all';
  marketplaceAccountId: string | 'all';
  status: ProductGroupCogsStatus | ProductGroupStatus | 'all';
  asOf: string;
  page: number;
  pageSize: number;
}

export interface ProductGroupCostRatio {
  numeratorMinor: number;
  denominator: number;
}

export interface ProductGroupListItem {
  group: ProductGroup;
  companyName: string;
  currentCost: ProductGroupCostRecord | null;
  baseUnitCost: ProductGroupCostRatio | null;
  memberCount: number;
  listingCount: number;
  marketplaces: Marketplace[];
  marketplaceAccountIds: string[];
  effectiveFrom: string | null;
  cogsStatus: ProductGroupCogsStatus;
}

export interface ProductGroupListResult {
  rows: ProductGroupListItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export interface ProductGroupProfitability {
  revenueMinor: number;
  cogsMinor: number | null;
  knownNetProfitMinor: number | null;
  marginBps: number | null;
  profitabilityCoverageBps: number;
  complete: boolean;
}

export interface ProductGroupMemberDetail {
  membership: ProductGroupMembership;
  product: Product;
  listings: MarketplaceListing[];
  inheritedCostMinor: number | null;
  resolvedCogs: ResolvedProductCogs;
  profitability: ProductGroupProfitability;
}

export interface ProductGroupDetail {
  group: ProductGroup;
  companyName: string;
  currentCost: ProductGroupCostRecord | null;
  costHistory: ProductGroupCostRecord[];
  members: ProductGroupMemberDetail[];
  profitability: ProductGroupProfitability;
  activity: ProductGroupAuditEvent[];
  pendingProposal: ProductGroupCostProposal | null;
}

export type ProductGroupDomainErrorCode =
  | 'invalid-base-cost'
  | 'invalid-base-quantity'
  | 'invalid-pack-quantity'
  | 'invalid-effective-date'
  | 'ambiguous-group-cost'
  | 'ambiguous-membership'
  | 'unsafe-derived-cost'
  | 'invalid-history';

export class ProductGroupDomainError extends Error {
  readonly code: ProductGroupDomainErrorCode;

  constructor(
    code: ProductGroupDomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ProductGroupDomainError';
    this.code = code;
  }
}

export function isProductGroupIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

export function validateProductGroupDefinition(
  group: Pick<ProductGroup, 'id' | 'name' | 'baseProduct' | 'baseQuantity' | 'unitOfMeasure' | 'currency'>,
) {
  const errors: string[] = [];
  if (!group.name.trim()) errors.push(`${group.id}: Group name is required`);
  if (!group.baseProduct.id) errors.push(`${group.id}: Base Product is required`);
  if (!Number.isFinite(group.baseQuantity) || group.baseQuantity <= 0) errors.push(`${group.id}: base quantity must be greater than zero`);
  if (!group.unitOfMeasure.trim()) errors.push(`${group.id}: unit of measure is required`);
  if (!group.currency.trim()) errors.push(`${group.id}: currency is required`);
  return errors;
}

export function isEffectiveProductGroupRecord(
  record: Pick<ProductGroupCostRecord | ProductGroupMembership, 'status' | 'effectiveFrom' | 'effectiveTo'>,
  onDate: string,
) {
  return record.status === 'active'
    && record.effectiveFrom <= onDate
    && (record.effectiveTo === null || onDate < record.effectiveTo);
}

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let first = left < BigInt(0) ? -left : left;
  let second = right < BigInt(0) ? -right : right;
  while (second !== BigInt(0)) {
    const remainder = first % second;
    first = second;
    second = remainder;
  }
  return first;
}

/** Converts the canonical decimal spelling of a finite Number to a ratio. */
function quantityRatio(value: number, code: 'invalid-base-quantity' | 'invalid-pack-quantity', label: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new ProductGroupDomainError(code, `${label} must be greater than zero.`);
  }

  const [coefficient, exponentText] = value.toString().toLowerCase().split('e');
  const exponent = exponentText ? Number(exponentText) : 0;
  const [whole, fraction = ''] = coefficient.split('.');
  const digits = `${whole}${fraction}`;
  let numerator = BigInt(digits);
  let denominator = BigInt(1);
  const scale = fraction.length - exponent;
  if (scale > 0) denominator = BigInt(10) ** BigInt(scale);
  else if (scale < 0) numerator *= BigInt(10) ** BigInt(-scale);

  const divisor = greatestCommonDivisor(numerator, denominator);
  return { numerator: numerator / divisor, denominator: denominator / divisor };
}

/**
 * Exact inherited-cost calculation. The rational calculation is performed in
 * minor units and rounded once, at the final Product cost boundary.
 */
export function deriveInheritedCogsMinor(
  baseCostMinor: number,
  packQuantity: number,
  baseQuantity: number,
) {
  if (!Number.isSafeInteger(baseCostMinor) || baseCostMinor <= 0) {
    throw new ProductGroupDomainError('invalid-base-cost', 'Base cost must be a positive safe integer in minor units.');
  }
  const pack = quantityRatio(packQuantity, 'invalid-pack-quantity', 'Pack quantity');
  const base = quantityRatio(baseQuantity, 'invalid-base-quantity', 'Base quantity');
  const numerator = BigInt(baseCostMinor) * pack.numerator * base.denominator;
  const denominator = pack.denominator * base.numerator;
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  const rounded = remainder * BigInt(2) >= denominator ? quotient + BigInt(1) : quotient;
  const result = Number(rounded);
  if (!Number.isSafeInteger(result)) {
    throw new ProductGroupDomainError('unsafe-derived-cost', 'Derived Product COGS exceeds the safe minor-unit range.');
  }
  return result;
}

/** Exposes the unrounded base-unit ratio for presentation without making it an input to derivation. */
export function productGroupBaseUnitCostRatio(cost: ProductGroupCostRecord): ProductGroupCostRatio {
  return { numeratorMinor: cost.baseCostMinor, denominator: cost.baseQuantity };
}

function activeRangesOverlap(
  left: Pick<ProductGroupCostRecord | ProductGroupMembership, 'effectiveFrom' | 'effectiveTo'>,
  right: Pick<ProductGroupCostRecord | ProductGroupMembership, 'effectiveFrom' | 'effectiveTo'>,
) {
  return (left.effectiveTo === null || right.effectiveFrom < left.effectiveTo)
    && (right.effectiveTo === null || left.effectiveFrom < right.effectiveTo);
}

export function validateProductGroupCostHistory(history: readonly ProductGroupCostRecord[]) {
  const errors: string[] = [];
  history.forEach((record) => {
    if (!Number.isSafeInteger(record.baseCostMinor) || record.baseCostMinor <= 0) errors.push(`${record.id}: base cost must be a positive safe integer`);
    if (!Number.isFinite(record.baseQuantity) || record.baseQuantity <= 0) errors.push(`${record.id}: base quantity must be greater than zero`);
    if (!isProductGroupIsoDate(record.effectiveFrom)) errors.push(`${record.id}: invalid effective-from date`);
    if (record.effectiveTo !== null && (!isProductGroupIsoDate(record.effectiveTo) || record.effectiveTo <= record.effectiveFrom)) {
      errors.push(`${record.id}: invalid effective range`);
    }
    if (!record.currency.trim()) errors.push(`${record.id}: currency is required`);
  });

  const activeByGroup = new Map<string, ProductGroupCostRecord[]>();
  history.filter((record) => record.status === 'active').forEach((record) => {
    const key = JSON.stringify([record.organisationId, record.companyId, record.groupId]);
    activeByGroup.set(key, [...(activeByGroup.get(key) ?? []), record]);
  });
  activeByGroup.forEach((records) => {
    const sorted = [...records].sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom));
    sorted.forEach((record, index) => {
      const next = sorted[index + 1];
      if (next && activeRangesOverlap(record, next)) errors.push(`${record.id}: overlaps ${next.id}`);
    });
  });
  return errors;
}

export function validateProductGroupMemberships(history: readonly ProductGroupMembership[]) {
  const errors: string[] = [];
  history.forEach((record) => {
    if (!Number.isFinite(record.packQuantity) || record.packQuantity <= 0) errors.push(`${record.id}: pack quantity must be greater than zero`);
    if (!isProductGroupIsoDate(record.effectiveFrom)) errors.push(`${record.id}: invalid effective-from date`);
    if (record.effectiveTo !== null && (!isProductGroupIsoDate(record.effectiveTo) || record.effectiveTo <= record.effectiveFrom)) {
      errors.push(`${record.id}: invalid effective range`);
    }
  });

  const activeByProduct = new Map<string, ProductGroupMembership[]>();
  history.filter((record) => record.status === 'active').forEach((record) => {
    // Product IDs are tenant-stable. Company is intentionally not part of this
    // key, so corrupt cross-Company memberships cannot evade the cardinality rule.
    const key = JSON.stringify([record.organisationId, record.productId]);
    activeByProduct.set(key, [...(activeByProduct.get(key) ?? []), record]);
  });
  activeByProduct.forEach((records) => {
    const sorted = [...records].sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom));
    sorted.forEach((record, index) => {
      for (let nextIndex = index + 1; nextIndex < sorted.length; nextIndex += 1) {
        const next = sorted[nextIndex];
        if (activeRangesOverlap(record, next)) errors.push(`${record.id}: overlaps ${next.id}; a Product can belong to only one active Group on a date`);
      }
    });
  });
  return errors;
}

export interface ProductGroupCompanyScopeViolation {
  code:
    | 'group-organisation-mismatch'
    | 'base-product-not-found'
    | 'base-product-company-mismatch'
    | 'cost-scope-mismatch'
    | 'membership-scope-mismatch'
    | 'member-product-not-found'
    | 'member-product-company-mismatch';
  entityId: string;
  relatedEntityId?: string;
}

/** Pure Company/tenant boundary validation for create, direct URL and mutation paths. */
export function validateProductGroupCompanyScope(input: {
  organisationId: string;
  group: ProductGroup;
  products: readonly Pick<Product, 'id' | 'organisationId' | 'ownerCompanyId'>[];
  costs?: readonly ProductGroupCostRecord[];
  memberships?: readonly ProductGroupMembership[];
}) {
  const violations: ProductGroupCompanyScopeViolation[] = [];
  const { group } = input;
  if (group.organisationId !== input.organisationId) {
    violations.push({ code: 'group-organisation-mismatch', entityId: group.id, relatedEntityId: group.organisationId });
  }
  const productsById = new Map(input.products.map((product) => [product.id, product]));
  const baseProduct = productsById.get(group.baseProduct.id);
  if (!baseProduct) violations.push({ code: 'base-product-not-found', entityId: group.id, relatedEntityId: group.baseProduct.id });
  else if (baseProduct.organisationId !== group.organisationId || baseProduct.ownerCompanyId !== group.companyId) {
    violations.push({ code: 'base-product-company-mismatch', entityId: group.id, relatedEntityId: baseProduct.id });
  }

  (input.costs ?? []).forEach((cost) => {
    if (cost.groupId !== group.id || cost.organisationId !== group.organisationId || cost.companyId !== group.companyId) {
      violations.push({ code: 'cost-scope-mismatch', entityId: cost.id, relatedEntityId: group.id });
    }
  });
  (input.memberships ?? []).forEach((membership) => {
    if (membership.groupId !== group.id || membership.organisationId !== group.organisationId || membership.companyId !== group.companyId) {
      violations.push({ code: 'membership-scope-mismatch', entityId: membership.id, relatedEntityId: group.id });
    }
    const product = productsById.get(membership.productId);
    if (!product) violations.push({ code: 'member-product-not-found', entityId: membership.id, relatedEntityId: membership.productId });
    else if (product.organisationId !== group.organisationId || product.ownerCompanyId !== group.companyId) {
      violations.push({ code: 'member-product-company-mismatch', entityId: membership.id, relatedEntityId: product.id });
    }
  });
  return violations;
}

export function resolveProductGroupCost(
  history: readonly ProductGroupCostRecord[],
  onDate: string,
) {
  if (!isProductGroupIsoDate(onDate)) {
    throw new ProductGroupDomainError('invalid-effective-date', 'Use an ISO effective date in YYYY-MM-DD format.');
  }
  const matches = history
    .filter((record) => isEffectiveProductGroupRecord(record, onDate))
    .sort((left, right) => right.effectiveFrom.localeCompare(left.effectiveFrom));
  if (matches.length > 1) {
    throw new ProductGroupDomainError('ambiguous-group-cost', `Multiple Product Group costs are effective on ${onDate}.`);
  }
  return matches[0] ?? null;
}

export function resolveProductGroupMembership(
  history: readonly ProductGroupMembership[],
  onDate: string,
  productId?: string,
) {
  if (!isProductGroupIsoDate(onDate)) {
    throw new ProductGroupDomainError('invalid-effective-date', 'Use an ISO effective date in YYYY-MM-DD format.');
  }
  const matches = history
    .filter((record) => (!productId || record.productId === productId) && isEffectiveProductGroupRecord(record, onDate))
    .sort((left, right) => right.effectiveFrom.localeCompare(left.effectiveFrom));
  if (matches.length > 1) {
    throw new ProductGroupDomainError('ambiguous-membership', `A Product has multiple Group memberships effective on ${onDate}.`);
  }
  return matches[0] ?? null;
}

interface InsertionPreview<T> {
  predecessor: T | null;
  predecessorDisposition: 'none' | 'shortened' | 'superseded';
  predecessorEffectiveToAfter: string | null;
  incomingEffectiveTo: string | null;
  next: T | null;
}

function previewEffectiveInsertion<T extends { effectiveFrom: string; effectiveTo: string | null; status: ProductGroupRecordStatus }>(
  history: readonly T[],
  effectiveFrom: string,
): InsertionPreview<T> {
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

export function insertProductGroupCost(
  history: readonly ProductGroupCostRecord[],
  incoming: ProductGroupCostRecord,
) {
  const relevant = history.filter((record) => record.groupId === incoming.groupId);
  const foreign = relevant.find((record) => record.organisationId !== incoming.organisationId || record.companyId !== incoming.companyId);
  if (foreign) throw new ProductGroupDomainError('invalid-history', `${foreign.id}: Product Group cost scope does not match the incoming record.`);
  const preview = previewEffectiveInsertion(relevant, incoming.effectiveFrom);
  const replaced = preview.predecessorDisposition === 'superseded' ? preview.predecessor : null;
  const covering = preview.predecessorDisposition === 'shortened' ? preview.predecessor : null;
  const updated = history.map((record): ProductGroupCostRecord => {
    if (replaced && record.id === replaced.id) return { ...record, status: 'superseded' };
    if (covering && record.id === covering.id) return { ...record, effectiveTo: preview.predecessorEffectiveToAfter };
    return { ...record };
  });
  const created: ProductGroupCostRecord = { ...incoming, status: 'active', effectiveTo: preview.incomingEffectiveTo };
  const result = [...updated, created];
  const errors = validateProductGroupCostHistory(result.filter((record) => record.groupId === incoming.groupId));
  if (errors.length) throw new ProductGroupDomainError('invalid-history', `Invalid Product Group cost history: ${errors.join('; ')}`);
  return {
    history: result,
    created,
    previous: preview.predecessor,
    adjustedRecordIds: [replaced?.id, covering?.id].filter((value): value is string => Boolean(value)),
  };
}

export function insertProductGroupMembership(
  history: readonly ProductGroupMembership[],
  incoming: ProductGroupMembership,
) {
  const relevant = history.filter((record) => record.organisationId === incoming.organisationId && record.productId === incoming.productId);
  const foreign = relevant.find((record) => record.companyId !== incoming.companyId);
  if (foreign) throw new ProductGroupDomainError('invalid-history', `${foreign.id}: Product Group membership Company does not match the incoming record.`);
  const preview = previewEffectiveInsertion(relevant, incoming.effectiveFrom);
  const replaced = preview.predecessorDisposition === 'superseded' ? preview.predecessor : null;
  const covering = preview.predecessorDisposition === 'shortened' ? preview.predecessor : null;
  const updated = history.map((record): ProductGroupMembership => {
    if (replaced && record.id === replaced.id) return { ...record, status: 'superseded' };
    if (covering && record.id === covering.id) return { ...record, effectiveTo: preview.predecessorEffectiveToAfter };
    return { ...record };
  });
  const created: ProductGroupMembership = { ...incoming, status: 'active', effectiveTo: preview.incomingEffectiveTo };
  const result = [...updated, created];
  const errors = validateProductGroupMemberships(result.filter((record) => record.organisationId === incoming.organisationId && record.productId === incoming.productId));
  if (errors.length) throw new ProductGroupDomainError('invalid-history', `Invalid Product Group membership history: ${errors.join('; ')}`);
  return {
    history: result,
    created,
    previous: preview.predecessor,
    adjustedRecordIds: [replaced?.id, covering?.id].filter((value): value is string => Boolean(value)),
  };
}

/** Ends a membership on an exclusive ISO date without deleting its history. */
export function closeProductGroupMembership(
  history: readonly ProductGroupMembership[],
  membershipId: string,
  effectiveTo: string,
) {
  const membership = history.find((record) => record.id === membershipId && record.status === 'active');
  if (!membership) throw new ProductGroupDomainError('invalid-history', 'Active Product Group membership was not found.');
  if (!isProductGroupIsoDate(effectiveTo) || effectiveTo <= membership.effectiveFrom || (membership.effectiveTo !== null && effectiveTo > membership.effectiveTo)) {
    throw new ProductGroupDomainError('invalid-effective-date', 'Membership end must be after its start and inside its existing effective range.');
  }
  const result = history.map((record) => record.id === membership.id ? { ...record, effectiveTo } : { ...record });
  const errors = validateProductGroupMemberships(result.filter((record) => record.organisationId === membership.organisationId && record.productId === membership.productId));
  if (errors.length) throw new ProductGroupDomainError('invalid-history', `Invalid Product Group membership history: ${errors.join('; ')}`);
  return { history: result, closed: result.find((record) => record.id === membership.id)! };
}

export type ResolvedProductCogs =
  | {
      source: 'direct';
      label: 'Manual COGS' | 'Imported COGS';
      unitCostMinor: number;
      currency: string;
      directRecord: COGSRecord;
      membership: ProductGroupMembership | null;
      groupCost: null;
    }
  | {
      source: 'inherited';
      label: 'Inherited from Product Group';
      unitCostMinor: number;
      currency: string;
      directRecord: null;
      membership: ProductGroupMembership;
      groupCost: ProductGroupCostRecord;
    }
  | {
      source: 'missing';
      label: 'Missing COGS';
      unitCostMinor: null;
      currency: null;
      directRecord: null;
      membership: ProductGroupMembership | null;
      groupCost: null;
      reason: 'no-cost-source' | 'missing-group-cost' | 'ambiguous-membership' | 'ambiguous-group-cost';
    };

function directCogsLabel(record: COGSRecord): 'Manual COGS' | 'Imported COGS' {
  return record.source === 'single-edit' || record.source === 'bulk-edit' || record.source === 'percentage-adjustment'
    ? 'Manual COGS'
    : 'Imported COGS';
}

/**
 * Canonical precedence for one Product/date: valid direct COGS, otherwise the
 * effective membership's Group cost, otherwise unknown. Missing is never zero.
 */
export function resolveProductCogs(input: {
  directHistory: readonly COGSRecord[];
  groupCostHistory: readonly ProductGroupCostRecord[];
  membershipHistory: readonly ProductGroupMembership[];
  date: string;
  productId?: string;
  organisationId?: string;
  companyId?: string;
}): ResolvedProductCogs {
  if (!isProductGroupIsoDate(input.date)) {
    throw new ProductGroupDomainError('invalid-effective-date', 'Use an ISO effective date in YYYY-MM-DD format.');
  }
  const inScope = <T extends { organisationId: string; companyId: string }>(record: T) =>
    (!input.organisationId || record.organisationId === input.organisationId)
    && (!input.companyId || record.companyId === input.companyId);
  const memberships = input.membershipHistory.filter((record) =>
    inScope(record)
    && (!input.productId || record.productId === input.productId)
    && isEffectiveProductGroupRecord(record, input.date));
  const membership = memberships.length === 1 ? memberships[0] : null;

  const direct = input.directHistory
    .filter((record) =>
      inScope(record)
      && (!input.productId || record.productId === input.productId)
      && record.status === 'active'
      && record.approvalStatus === 'approved'
      && Number.isSafeInteger(record.unitCostMinor)
      && record.unitCostMinor >= 0
      && Boolean(record.currency.trim())
      && record.effectiveFrom <= input.date
      && (record.effectiveTo === null || input.date < record.effectiveTo))
    .sort((left, right) => right.effectiveFrom.localeCompare(left.effectiveFrom))[0];
  if (direct) {
    return {
      source: 'direct',
      label: directCogsLabel(direct),
      unitCostMinor: direct.unitCostMinor,
      currency: direct.currency,
      directRecord: direct,
      membership,
      groupCost: null,
    };
  }

  if (memberships.length > 1) {
    return { source: 'missing', label: 'Missing COGS', unitCostMinor: null, currency: null, directRecord: null, membership: null, groupCost: null, reason: 'ambiguous-membership' };
  }
  if (!membership) {
    return { source: 'missing', label: 'Missing COGS', unitCostMinor: null, currency: null, directRecord: null, membership: null, groupCost: null, reason: 'no-cost-source' };
  }

  const groupCosts = input.groupCostHistory.filter((record) =>
    inScope(record)
    && record.groupId === membership.groupId
    && isEffectiveProductGroupRecord(record, input.date));
  if (groupCosts.length > 1) {
    return { source: 'missing', label: 'Missing COGS', unitCostMinor: null, currency: null, directRecord: null, membership, groupCost: null, reason: 'ambiguous-group-cost' };
  }
  const groupCost = groupCosts[0];
  if (!groupCost) {
    return { source: 'missing', label: 'Missing COGS', unitCostMinor: null, currency: null, directRecord: null, membership, groupCost: null, reason: 'missing-group-cost' };
  }
  return {
    source: 'inherited',
    label: 'Inherited from Product Group',
    unitCostMinor: deriveInheritedCogsMinor(groupCost.baseCostMinor, membership.packQuantity, groupCost.baseQuantity),
    currency: groupCost.currency,
    directRecord: null,
    membership,
    groupCost,
  };
}
