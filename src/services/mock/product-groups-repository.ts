import { financialDisclosureAllowed, redactFinancialDisclosure } from '@/src/services/mappers/financial-disclosure';
import type { AnalyticsDataset, DashboardFinancialTotals, DashboardRepositoryInput } from '@/src/domain/analytics';
import { COGS_TODAY } from '@/src/domain/cogs';
import type { COGSRecord, Product } from '@/src/domain/models';
import {
  closeProductGroupMembership,
  deriveInheritedCogsMinor,
  insertProductGroupCost,
  insertProductGroupMembership,
  isProductGroupIsoDate,
  productGroupBaseUnitCostRatio,
  resolveProductCogs as resolveCanonicalProductCogs,
  resolveProductGroupCost,
  resolveProductGroupMembership,
  validateProductGroupCompanyScope,
  type ProductGroup,
  type ProductGroupActor,
  type ProductGroupAuditAction,
  type ProductGroupAuditEvent,
  type ProductGroupCostProposal,
  type ProductGroupCostRecord,
  type ProductGroupDetail,
  type ProductGroupListItem,
  type ProductGroupMembership,
  type ProductGroupProfitability,
} from '@/src/domain/product-groups';
import { generateAnalyticsDataset, stableHash } from '@/src/fixtures/analytics-data';
import {
  calculateDashboardTotals,
  filterProfitabilityRecords,
  prepareProfitabilityRecords,
} from '@/src/services/analytics/analytics-aggregation';
import type {
  ChangeProductGroupMembershipRepositoryInput,
  CreateProductGroupCostProposalRepositoryInput,
  CreateProductGroupRepositoryInput,
  ProductGroupDetailRepositoryInput,
  ProductGroupListRepositoryInput,
  ProductGroupProductOption,
  ProductGroupProductSearchInput,
  ProductGroupRepository,
  ProductGroupResolvedProductCost,
} from '@/src/services/product-groups-contracts';
import { mockCogsManagementStore, organisationCogsState } from '@/src/services/mock/cogs-management-store';
import {
  mockProductGroupsStore,
  organisationProductGroupsState,
  type OrganisationProductGroupsState,
  type ProductGroupsState,
  type MockProductGroupsStore,
} from '@/src/services/mock/product-groups-store';

const REPORTING_RATE_BPS: Record<string, number> = { GBP: 10_000, EUR: 8_600, USD: 7_800 };
const TERMINAL_PROPOSAL_STATUSES = new Set<ProductGroupCostProposal['status']>(['applied', 'failed', 'cancelled']);

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function nowIso() {
  return new Date().toISOString();
}

function delay(key: string, signal?: AbortSignal) {
  const duration = 100 + stableHash(key) % 101;
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, duration);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Request aborted', 'AbortError'));
    }, { once: true });
  });
}

function nextId(draft: ProductGroupsState, prefix: string, timestamp: string) {
  draft.sequence += 1;
  return `${prefix}-${timestamp.replace(/[-:.TZ]/g, '').slice(0, 14)}-${String(draft.sequence).padStart(4, '0')}`;
}

function ensureIsoDate(value: string, label = 'Effective date') {
  if (!isProductGroupIsoDate(value)) throw new Error(`${label} must be an ISO date.`);
}

function ensurePositiveQuantity(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be greater than zero.`);
}

function ensurePositiveMinor(value: number) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error('Base cost must be a positive integer in minor units.');
}

function ensureCurrency(value: string) {
  const currency = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Currency must be a three-letter ISO 4217 code.');
  return currency;
}

function ensureEdit(actor: ProductGroupActor) {
  if (!actor.permissions.edit) throw new Error('Your role cannot manage Product Groups.');
}

function ensureApprove(actor: ProductGroupActor, canApprove: boolean) {
  if (!canApprove || !actor.permissions.approve) {
    throw new Error('An authorised user with cogs.approve must approve this financial change.');
  }
}

function actorAssignedToCompany(actor: ProductGroupActor, companyId: string) {
  return actor.companyIds === 'all' || actor.companyIds.includes(companyId);
}

function ensureCompanyAccess(input: DashboardRepositoryInput, companyId: string, actor?: ProductGroupActor) {
  const company = input.companies.find((candidate) => candidate.id === companyId
    && candidate.organisationId === input.organisation.id);
  if (!company || !input.authorisedCompanyIds.includes(companyId) || (actor && !actorAssignedToCompany(actor, companyId))) {
    throw new Error('The Product Group is outside your Company assignment.');
  }
  return company;
}

function allMemberships(state: OrganisationProductGroupsState) {
  return Object.values(state.membershipsByGroup).flat();
}

function allCostRecords(state: OrganisationProductGroupsState) {
  return Object.values(state.costRecordsByGroup).flat();
}

function directHistory(organisationId: string, productId: string) {
  return organisationCogsState(mockCogsManagementStore.read(), organisationId).recordsByProduct[productId] ?? [];
}

function profitabilityFromTotals(totals: DashboardFinancialTotals): ProductGroupProfitability {
  return {
    revenueMinor: totals.revenueMinor,
    cogsMinor: totals.cogsCoverageBps === 0 ? null : totals.cogsKnownMinor,
    knownNetProfitMinor: totals.knownNetProfitMinor,
    marginBps: totals.marginBps,
    profitabilityCoverageBps: totals.profitabilityCoverageBps,
    complete: totals.profitabilityComplete,
  };
}

function emptyProfitability(): ProductGroupProfitability {
  return profitabilityFromTotals(calculateDashboardTotals([]));
}

function accessibleListings(input: DashboardRepositoryInput, dataset: AnalyticsDataset) {
  const companyIds = new Set(input.authorisedCompanyIds);
  const accountIds = new Set(input.authorisedAccountIds);
  return dataset.listings.filter((listing) => companyIds.has(listing.companyId)
    && accountIds.has(listing.marketplaceAccountId));
}

function currentMembers(state: OrganisationProductGroupsState, groupId: string, asOf: string) {
  return (state.membershipsByGroup[groupId] ?? []).filter((membership) =>
    membership.status === 'active'
    && membership.effectiveFrom <= asOf
    && (membership.effectiveTo === null || asOf < membership.effectiveTo));
}

function costState(state: OrganisationProductGroupsState, groupId: string, asOf: string) {
  const history = state.costRecordsByGroup[groupId] ?? [];
  const current = resolveProductGroupCost(history, asOf);
  if (current) return { current, status: 'complete' as const };
  const scheduled = history.some((record) => record.status === 'active' && record.effectiveFrom > asOf);
  return { current: null, status: scheduled ? 'scheduled' as const : 'missing' as const };
}

function auditEvent(
  draft: ProductGroupsState,
  input: {
    organisationId: string;
    companyId: string;
    groupId: string;
    actor: ProductGroupActor;
    action: ProductGroupAuditAction;
    targetType: ProductGroupAuditEvent['targetType'];
    targetId: string;
    timestamp: string;
    previousValue: unknown;
    newValue: unknown;
    reason: string;
  },
): ProductGroupAuditEvent {
  return {
    id: nextId(draft, 'audit-product-group', input.timestamp),
    organisationId: input.organisationId,
    companyId: input.companyId,
    groupId: input.groupId,
    actorUserId: input.actor.id,
    actorName: input.actor.name,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    occurredAt: input.timestamp,
    previousValue: input.previousValue,
    newValue: input.newValue,
    reason: input.reason,
  };
}

function reportingUnitCost(unitCostMinor: number, currency: string) {
  const rate = REPORTING_RATE_BPS[currency] ?? (currency === 'GBP' ? 10_000 : 0);
  return rate > 0 ? Math.round((unitCostMinor * rate) / 10_000) : null;
}

function normaliseGroupRecords(
  dataset: AnalyticsDataset,
  input: DashboardRepositoryInput,
  state: OrganisationProductGroupsState,
) {
  const memberships = allMemberships(state);
  const costs = allCostRecords(state);
  return dataset.records.map((record) => {
    const resolution = resolveCanonicalProductCogs({
      directHistory: directHistory(input.organisation.id, record.productId),
      groupCostHistory: costs,
      membershipHistory: memberships,
      date: record.occurredOn,
      productId: record.productId,
      organisationId: input.organisation.id,
      companyId: record.companyId,
    });
    if (resolution.source === 'missing') {
      const hasMembership = memberships.some((membership) => membership.productId === record.productId);
      return hasMembership ? { ...record, cogsMinor: null } : record;
    }
    const reportingMinor = reportingUnitCost(resolution.unitCostMinor, resolution.currency);
    return { ...record, cogsMinor: reportingMinor === null ? null : reportingMinor * record.units };
  });
}

function groupPreparedRecords(
  dataset: AnalyticsDataset,
  input: DashboardRepositoryInput,
  state: OrganisationProductGroupsState,
  groupId: string,
) {
  const memberships = state.membershipsByGroup[groupId] ?? [];
  if (!memberships.length) return [];
  const withResolvedCogs: AnalyticsDataset = {
    ...dataset,
    records: normaliseGroupRecords(dataset, input, state),
  };
  return filterProfitabilityRecords(prepareProfitabilityRecords(withResolvedCogs, input), input.context)
    .filter((record) => memberships.some((membership) => membership.productId === record.productId
      && membership.status === 'active'
      && membership.effectiveFrom <= record.occurredOn
      && (membership.effectiveTo === null || record.occurredOn < membership.effectiveTo)));
}

interface SeedDefinition {
  id: string;
  companyId: string;
  name: string;
  description: string;
  productIndexes: [number, number, number];
  packs: [number, number, number];
  baseQuantity: number;
  initialBaseCostMinor: number;
  currentBaseCostMinor: number;
  unitOfMeasure: string;
}

const SEED_DEFINITIONS: readonly SeedDefinition[] = [
  {
    id: 'grp-disposable-gloves',
    companyId: 'cmp-stock',
    name: 'Disposable Gloves',
    description: 'Shared purchasing basis for disposable glove pack sizes.',
    productIndexes: [0, 9, 18],
    packs: [25, 50, 100],
    baseQuantity: 1_000,
    initialBaseCostMinor: 10_000,
    currentBaseCostMinor: 11_000,
    unitOfMeasure: 'gloves',
  },
  {
    id: 'grp-packaging-materials',
    companyId: 'cmp-proserve',
    name: 'Packaging Materials',
    description: 'Standard purchasing basis for packaging consumables.',
    productIndexes: [5, 6, 15],
    packs: [1, 6, 12],
    baseQuantity: 24,
    initialBaseCostMinor: 4_500,
    currentBaseCostMinor: 4_800,
    unitOfMeasure: 'items',
  },
  {
    id: 'grp-paper-hygiene',
    companyId: 'cmp-northbridge',
    name: 'Paper Hygiene',
    description: 'Shared basis for towels and hygiene paper pack sizes.',
    productIndexes: [3, 10, 17],
    packs: [1, 6, 12],
    baseQuantity: 12,
    initialBaseCostMinor: 3_400,
    currentBaseCostMinor: 3_600,
    unitOfMeasure: 'rolls',
  },
] as const;

export class MockProductGroupsRepository implements ProductGroupRepository {
  private readonly datasets = new Map<string, AnalyticsDataset>();

  constructor(private readonly store: MockProductGroupsStore = mockProductGroupsStore) {}

  private dataset(input: DashboardRepositoryInput) {
    const key = JSON.stringify({
      organisationId: input.organisation.id,
      companies: input.companies.map((company) => company.id),
      accounts: input.marketplaceAccounts.map((account) => [account.id, account.companyId, account.marketplace]),
    });
    let dataset = this.datasets.get(key);
    if (!dataset) {
      dataset = generateAnalyticsDataset({
        organisation: input.organisation,
        companies: input.companies,
        marketplaceAccounts: input.marketplaceAccounts,
      });
      this.datasets.set(key, dataset);
    }
    return dataset;
  }

  ensureSeeded(organisationId: string, dataset: AnalyticsDataset, companyIds: readonly string[]) {
    if (organisationId !== 'org-stock-supplies') return;
    const existing = organisationProductGroupsState(this.store.read(), organisationId);
    if (SEED_DEFINITIONS.every((definition) => Boolean(existing.groups[definition.id]))) return;
    this.store.transaction((draft) => {
      const state = this.store.ensureOrganisation(draft, organisationId);
      for (const definition of SEED_DEFINITIONS) {
        if (state.groups[definition.id]) continue;
        const companyExists = companyIds.includes(definition.companyId);
        const products = dataset.products.filter((product) => product.ownerCompanyId === definition.companyId);
        const members = definition.productIndexes.map((index) => products[index]).filter((product): product is Product => Boolean(product));
        if (!companyExists || members.length !== definition.productIndexes.length) continue;
        const actor: ProductGroupActor = {
          id: 'usr-emma-richardson',
          name: 'Emma Richardson',
          companyIds: 'all',
          permissions: { edit: true, approve: true },
        };
        const createdAt = '2026-01-01T09:00:00.000Z';
        const updatedAt = '2026-04-01T09:00:00.000Z';
        const group: ProductGroup = {
          id: definition.id,
          organisationId,
          companyId: definition.companyId,
          name: definition.name,
          description: definition.description,
          baseProduct: { id: members[0].id, internalSku: members[0].internalSku, title: members[0].title },
          baseQuantity: definition.baseQuantity,
          unitOfMeasure: definition.unitOfMeasure,
          currency: 'GBP',
          status: 'active',
          createdByUserId: actor.id,
          createdByName: actor.name,
          createdAt,
          updatedByUserId: actor.id,
          updatedByName: actor.name,
          updatedAt,
        };
        state.groups[group.id] = group;
        state.costRecordsByGroup[group.id] = [
          {
            id: `${group.id}:cost:2026-01-01`, organisationId: group.organisationId, companyId: group.companyId,
            groupId: group.id, baseCostMinor: definition.initialBaseCostMinor, baseQuantity: definition.baseQuantity,
            currency: 'GBP', effectiveFrom: '2026-01-01', effectiveTo: '2026-04-01', status: 'active',
            source: 'Supplier price list', reason: 'Opening Product Group cost', createdByUserId: actor.id,
            createdByName: actor.name, createdAt, approvedByUserId: actor.id, approvedByName: actor.name,
            approvedAt: createdAt, approvalStatus: 'approved',
          },
          {
            id: `${group.id}:cost:2026-04-01`, organisationId: group.organisationId, companyId: group.companyId,
            groupId: group.id, baseCostMinor: definition.currentBaseCostMinor, baseQuantity: definition.baseQuantity,
            currency: 'GBP', effectiveFrom: '2026-04-01', effectiveTo: null, status: 'active',
            source: 'Supplier price list', reason: 'Quarterly supplier price update', createdByUserId: actor.id,
            createdByName: actor.name, createdAt: updatedAt, approvedByUserId: actor.id, approvedByName: actor.name,
            approvedAt: updatedAt, approvalStatus: 'approved',
          },
        ];
        state.membershipsByGroup[group.id] = members.flatMap((product, index): ProductGroupMembership[] => {
          const currentPack = definition.packs[index];
          if (group.id === 'grp-disposable-gloves' && index === 2) {
            return [
              {
                id: `${group.id}:member:${product.id}:2026-01-01`, organisationId: group.organisationId,
                companyId: group.companyId, groupId: group.id, productId: product.id, packQuantity: 80,
                effectiveFrom: '2026-01-01', effectiveTo: '2026-04-01', status: 'active', reason: 'Initial pack specification',
                createdByUserId: actor.id, createdByName: actor.name, createdAt, approvedByUserId: actor.id,
                approvedByName: actor.name, approvedAt: createdAt, approvalStatus: 'approved',
              },
              {
                id: `${group.id}:member:${product.id}:2026-04-01`, organisationId: group.organisationId,
                companyId: group.companyId, groupId: group.id, productId: product.id, packQuantity: currentPack,
                effectiveFrom: '2026-04-01', effectiveTo: null, status: 'active', reason: 'Pack quantity corrected',
                createdByUserId: actor.id, createdByName: actor.name, createdAt: updatedAt, approvedByUserId: actor.id,
                approvedByName: actor.name, approvedAt: updatedAt, approvalStatus: 'approved',
              },
            ];
          }
          return [{
            id: `${group.id}:member:${product.id}:2026-01-01`, organisationId: group.organisationId,
            companyId: group.companyId, groupId: group.id, productId: product.id, packQuantity: currentPack,
            effectiveFrom: '2026-01-01', effectiveTo: null, status: 'active', reason: 'Initial Product Group membership',
            createdByUserId: actor.id, createdByName: actor.name, createdAt, approvedByUserId: actor.id,
            approvedByName: actor.name, approvedAt: createdAt, approvalStatus: 'approved',
          }];
        });
        state.auditEvents.unshift(auditEvent(draft, {
          organisationId: group.organisationId,
          companyId: group.companyId,
          groupId: group.id,
          actor,
          action: 'product-group.created',
          targetType: 'product-group',
          targetId: group.id,
          timestamp: createdAt,
          previousValue: null,
          newValue: { name: group.name, baseQuantity: group.baseQuantity, memberCount: members.length },
          reason: 'Initial governed Product Group setup',
        }));
      }
    });
  }

  private state(input: DashboardRepositoryInput) {
    this.ensureSeeded(
      input.organisation.id,
      this.dataset(input),
      input.companies.filter((company) => company.organisationId === input.organisation.id).map((company) => company.id),
    );
    return organisationProductGroupsState(this.store.read(), input.organisation.id);
  }

  private findAccessibleGroup(input: DashboardRepositoryInput, groupId: string, actor?: ProductGroupActor) {
    const group = this.state(input).groups[groupId];
    if (!group || group.organisationId !== input.organisation.id) return null;
    try {
      ensureCompanyAccess(input, group.companyId, actor);
    } catch {
      return null;
    }
    return group;
  }

  private buildDetail(input: DashboardRepositoryInput, group: ProductGroup, asOf = COGS_TODAY): ProductGroupDetail {
    ensureIsoDate(asOf, 'As-of date');
    const state = this.state(input);
    const dataset = this.dataset(input);
    const company = ensureCompanyAccess(input, group.companyId);
    const costHistory = [...(state.costRecordsByGroup[group.id] ?? [])]
      .sort((left, right) => right.effectiveFrom.localeCompare(left.effectiveFrom));
    const currentCost = resolveProductGroupCost(costHistory, asOf);
    const memberships = currentMembers(state, group.id, asOf);
    const listings = accessibleListings(input, dataset);
    const prepared = groupPreparedRecords(dataset, input, state, group.id);
    const members = memberships.flatMap((membership) => {
      const product = dataset.products.find((candidate) => candidate.id === membership.productId
        && candidate.organisationId === group.organisationId
        && candidate.ownerCompanyId === group.companyId);
      if (!product) return [];
      const productListings = listings.filter((listing) => listing.productId === product.id);
      const resolvedCogs = resolveCanonicalProductCogs({
        directHistory: directHistory(group.organisationId, product.id),
        groupCostHistory: costHistory,
        membershipHistory: state.membershipsByGroup[group.id] ?? [],
        date: asOf,
        productId: product.id,
        organisationId: group.organisationId,
        companyId: group.companyId,
      });
      const inheritedCostMinor = currentCost
        ? deriveInheritedCogsMinor(currentCost.baseCostMinor, membership.packQuantity, currentCost.baseQuantity)
        : null;
      const memberRecords = prepared.filter((record) => record.productId === product.id);
      return [{
        membership,
        product,
        listings: productListings,
        inheritedCostMinor,
        resolvedCogs,
        profitability: profitabilityFromTotals(calculateDashboardTotals(memberRecords)),
      }];
    });
    const activity = state.auditEvents.filter((event) => event.groupId === group.id)
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
    const pendingProposal = Object.values(state.proposals)
      .filter((proposal) => proposal.groupId === group.id && !TERMINAL_PROPOSAL_STATUSES.has(proposal.status))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;
    return {
      group: clone(group),
      companyName: company.name,
      currentCost: currentCost ? clone(currentCost) : null,
      costHistory: clone(costHistory),
      members: clone(members),
      profitability: prepared.length ? profitabilityFromTotals(calculateDashboardTotals(prepared)) : emptyProfitability(),
      activity: clone(activity),
      pendingProposal: pendingProposal ? clone(pendingProposal) : null,
    };
  }

  async list(input: ProductGroupListRepositoryInput, signal?: AbortSignal) {
    await delay(`product-groups:list:${JSON.stringify({ organisationId: input.organisationId, search: input.search, page: input.page })}`, signal);
    if (input.organisationId !== input.organisation.id || input.context.organisationId !== input.organisation.id) {
      return { rows: [], total: 0, page: 0, pageSize: input.pageSize, pageCount: 0 };
    }
    ensureIsoDate(input.asOf, 'As-of date');
    const state = this.state(input);
    const dataset = this.dataset(input);
    const authorisedCompanies = new Set(input.authorisedCompanyIds);
    const authorisedAccounts = new Set(input.authorisedAccountIds);
    const listings = accessibleListings(input, dataset);
    const productById = new Map(dataset.products.map((product) => [product.id, product]));
    const requestedCompanyAllowed = input.companyId === 'all' || authorisedCompanies.has(input.companyId);
    const requestedAccountAllowed = input.marketplaceAccountId === 'all' || authorisedAccounts.has(input.marketplaceAccountId);
    if (!requestedCompanyAllowed || !requestedAccountAllowed) {
      return { rows: [], total: 0, page: Math.max(0, input.page), pageSize: input.pageSize, pageCount: 0 };
    }
    const search = input.search.trim().toLocaleLowerCase('en-GB');
    let rows: ProductGroupListItem[] = Object.values(state.groups)
      .filter((group) => group.organisationId === input.organisation.id && authorisedCompanies.has(group.companyId))
      .filter((group) => input.context.companyId === 'all' || group.companyId === input.context.companyId)
      .filter((group) => input.companyId === 'all' || group.companyId === input.companyId)
      .flatMap((group) => {
        const company = input.companies.find((candidate) => candidate.id === group.companyId);
        if (!company) return [];
        const memberships = currentMembers(state, group.id, input.asOf);
        const memberIds = new Set(memberships.map((membership) => membership.productId));
        const groupListings = listings.filter((listing) => memberIds.has(listing.productId));
        const marketplaces = [...new Set(groupListings.map((listing) => listing.marketplace))];
        const marketplaceAccountIds = [...new Set(groupListings.map((listing) => listing.marketplaceAccountId))];
        const effectiveMarketplace = input.marketplace === 'all' ? input.context.marketplace : input.marketplace;
        if (effectiveMarketplace !== 'all' && !marketplaces.includes(effectiveMarketplace)) return [];
        if (input.marketplaceAccountId !== 'all' && !marketplaceAccountIds.includes(input.marketplaceAccountId)) return [];
        if (input.context.marketplaceAccountIds.length > 0
          && !marketplaceAccountIds.some((id) => input.context.marketplaceAccountIds.includes(id))) return [];
        const resolved = costState(state, group.id, input.asOf);
        if (input.status !== 'all' && input.status !== group.status && input.status !== resolved.status) return [];
        if (search) {
          const memberText = memberships.flatMap((membership) => {
            const product = productById.get(membership.productId);
            return product ? [product.title, product.internalSku] : [];
          });
          const haystack = [group.name, group.description, group.baseProduct.title, group.baseProduct.internalSku, company.name, ...memberText]
            .join(' ').toLocaleLowerCase('en-GB');
          if (!haystack.includes(search)) return [];
        }
        return [{
          group: clone(group),
          companyName: company.name,
          currentCost: resolved.current ? clone(resolved.current) : null,
          baseUnitCost: resolved.current ? productGroupBaseUnitCostRatio(resolved.current) : null,
          memberCount: memberships.length,
          listingCount: groupListings.length,
          marketplaces,
          marketplaceAccountIds,
          effectiveFrom: resolved.current?.effectiveFrom ?? null,
          cogsStatus: resolved.status,
        }];
      })
      .sort((left, right) => left.group.name.localeCompare(right.group.name));
    const pageSize = Math.min(100, Math.max(1, Math.trunc(input.pageSize)));
    const page = Math.max(0, Math.trunc(input.page));
    const total = rows.length;
    rows = rows.slice(page * pageSize, page * pageSize + pageSize);
    return redactFinancialDisclosure({ rows, total, page, pageSize, pageCount: Math.ceil(total / pageSize) }, financialDisclosureAllowed(input));
  }

  async getById(input: ProductGroupDetailRepositoryInput, signal?: AbortSignal) {
    await delay(`product-groups:detail:${input.groupId}:${input.asOf ?? COGS_TODAY}`, signal);
    const group = this.findAccessibleGroup(input, input.groupId);
    return redactFinancialDisclosure(group ? this.buildDetail(input, group, input.asOf ?? COGS_TODAY) : null, financialDisclosureAllowed(input));
  }

  async searchCompanyProducts(input: ProductGroupProductSearchInput, signal?: AbortSignal) {
    await delay(`product-groups:products:${input.companyId}:${input.search ?? ''}`, signal);
    ensureCompanyAccess(input, input.companyId);
    const asOf = input.asOf ?? COGS_TODAY;
    ensureIsoDate(asOf, 'As-of date');
    const dataset = this.dataset(input);
    const state = this.state(input);
    const memberships = allMemberships(state);
    const listings = accessibleListings(input, dataset);
    const search = (input.search ?? '').trim().toLocaleLowerCase('en-GB');
    const limit = Math.min(100, Math.max(1, Math.trunc(input.limit ?? 50)));
    return dataset.products
      .filter((product) => product.organisationId === input.organisation.id && product.ownerCompanyId === input.companyId)
      .map((product): ProductGroupProductOption => {
        const membership = resolveProductGroupMembership(memberships, asOf, product.id);
        const activeGroup = membership ? state.groups[membership.groupId] : null;
        const productListings = listings.filter((listing) => listing.productId === product.id);
        return {
          product: clone(product),
          listingCount: productListings.length,
          marketplaces: [...new Set(productListings.map((listing) => listing.marketplace))],
          marketplaceAccountIds: [...new Set(productListings.map((listing) => listing.marketplaceAccountId))],
          activeGroupId: activeGroup?.id ?? null,
          activeGroupName: activeGroup?.name ?? null,
        };
      })
      .filter((option) => !option.activeGroupId || option.activeGroupId === input.groupId)
      .filter((option) => !search || `${option.product.title} ${option.product.internalSku}`.toLocaleLowerCase('en-GB').includes(search))
      .sort((left, right) => left.product.title.localeCompare(right.product.title))
      .slice(0, limit);
  }

  async create(input: CreateProductGroupRepositoryInput, signal?: AbortSignal) {
    await delay(`product-groups:create:${input.companyId}:${input.name}`, signal);
    ensureEdit(input.actor);
    if (input.organisationId !== input.organisation.id) throw new Error('The Product Group Organisation does not match the active tenant.');
    ensureCompanyAccess(input, input.companyId, input.actor);
    ensurePositiveMinor(input.baseCostMinor);
    ensurePositiveQuantity(input.baseQuantity, 'Base quantity');
    ensureIsoDate(input.effectiveFrom);
    const currency = ensureCurrency(input.currency);
    const name = input.name.trim();
    const reason = input.reason.trim();
    if (!name) throw new Error('Group name is required.');
    if (!input.unitOfMeasure.trim()) throw new Error('Unit of measure is required.');
    if (!input.source.trim()) throw new Error('Cost source is required.');
    if (!reason) throw new Error('A reason is required for the financial audit.');
    if (!input.members.length) throw new Error('Select at least one company-owned Product.');
    const dataset = this.dataset(input);
    const companyProducts = dataset.products.filter((product) => product.organisationId === input.organisation.id
      && product.ownerCompanyId === input.companyId);
    const productById = new Map(companyProducts.map((product) => [product.id, product]));
    const baseProduct = productById.get(input.baseProductId);
    if (!baseProduct) throw new Error('The Base Product is outside the selected Company or assignment.');
    const memberIds = new Set<string>();
    input.members.forEach((member) => {
      if (memberIds.has(member.productId)) throw new Error('A Product can be selected only once.');
      memberIds.add(member.productId);
      if (!productById.has(member.productId)) throw new Error('Every member must be owned by the selected Company.');
      ensurePositiveQuantity(member.packQuantity, 'Pack quantity');
      ensureIsoDate(member.effectiveFrom ?? input.effectiveFrom);
      // Executes the exact minor-unit boundary validation as part of create.
      deriveInheritedCogsMinor(input.baseCostMinor, member.packQuantity, input.baseQuantity);
    });
    const existingMemberships = allMemberships(this.state(input));
    input.members.forEach((member) => {
      const effectiveMembership = resolveProductGroupMembership(
        existingMemberships,
        member.effectiveFrom ?? input.effectiveFrom,
        member.productId,
      );
      if (effectiveMembership) {
        throw new Error('A Product can belong to only one active Group on a date. Remove it from its current Group before adding it here.');
      }
    });
    const timestamp = nowIso();
    const group = this.store.transaction((draft) => {
      const state = this.store.ensureOrganisation(draft, input.organisation.id);
      if (Object.values(state.groups).some((candidate) => candidate.companyId === input.companyId
        && candidate.name.trim().toLocaleLowerCase('en-GB') === name.toLocaleLowerCase('en-GB'))) {
        throw new Error('A Product Group with this name already exists in the selected Company.');
      }
      const groupId = nextId(draft, 'product-group', timestamp);
      const created: ProductGroup = {
        id: groupId,
        organisationId: input.organisation.id,
        companyId: input.companyId,
        name,
        description: input.description.trim(),
        baseProduct: { id: baseProduct.id, internalSku: baseProduct.internalSku, title: baseProduct.title },
        baseQuantity: input.baseQuantity,
        unitOfMeasure: input.unitOfMeasure.trim(),
        currency,
        status: 'active',
        createdByUserId: input.actor.id,
        createdByName: input.actor.name,
        createdAt: timestamp,
        updatedByUserId: input.actor.id,
        updatedByName: input.actor.name,
        updatedAt: timestamp,
      };
      const cost: ProductGroupCostRecord = {
        id: nextId(draft, 'product-group-cost', timestamp),
        organisationId: created.organisationId,
        companyId: created.companyId,
        groupId,
        baseCostMinor: input.baseCostMinor,
        baseQuantity: input.baseQuantity,
        currency,
        effectiveFrom: input.effectiveFrom,
        effectiveTo: null,
        status: 'active',
        source: input.source.trim(),
        reason,
        createdByUserId: input.actor.id,
        createdByName: input.actor.name,
        createdAt: timestamp,
        approvedByUserId: input.actor.id,
        approvedByName: input.actor.name,
        approvedAt: timestamp,
        approvalStatus: 'approved',
      };
      let combinedMemberships = allMemberships(state);
      const createdMemberships: ProductGroupMembership[] = [];
      input.members.forEach((member) => {
        const membership: ProductGroupMembership = {
          id: nextId(draft, 'product-group-member', timestamp),
          organisationId: created.organisationId,
          companyId: created.companyId,
          groupId,
          productId: member.productId,
          packQuantity: member.packQuantity,
          effectiveFrom: member.effectiveFrom ?? input.effectiveFrom,
          effectiveTo: null,
          status: 'active',
          reason,
          createdByUserId: input.actor.id,
          createdByName: input.actor.name,
          createdAt: timestamp,
          approvedByUserId: input.actor.id,
          approvedByName: input.actor.name,
          approvedAt: timestamp,
          approvalStatus: 'approved',
        };
        const inserted = insertProductGroupMembership(combinedMemberships, membership);
        combinedMemberships = inserted.history;
        createdMemberships.push(inserted.created);
      });
      const violations = validateProductGroupCompanyScope({
        organisationId: input.organisation.id,
        group: created,
        products: companyProducts,
        costs: [cost],
        memberships: createdMemberships,
      });
      if (violations.length) throw new Error('The Product Group contains a Product or record outside its Company boundary.');
      state.groups[groupId] = created;
      state.costRecordsByGroup[groupId] = [cost];
      state.membershipsByGroup = Object.fromEntries(
        [...new Set(combinedMemberships.map((membership) => membership.groupId))]
          .map((id) => [id, combinedMemberships.filter((membership) => membership.groupId === id)]),
      );
      state.auditEvents.unshift(auditEvent(draft, {
        organisationId: created.organisationId,
        companyId: created.companyId,
        groupId,
        actor: input.actor,
        action: 'product-group.created',
        targetType: 'product-group',
        targetId: groupId,
        timestamp,
        previousValue: null,
        newValue: { name, baseProduct: created.baseProduct, baseQuantity: input.baseQuantity, baseCostMinor: input.baseCostMinor, currency, memberIds: [...memberIds] },
        reason,
      }));
      createdMemberships.forEach((membership) => state.auditEvents.unshift(auditEvent(draft, {
        organisationId: created.organisationId,
        companyId: created.companyId,
        groupId,
        actor: input.actor,
        action: 'product-group.member-added',
        targetType: 'product-group-membership',
        targetId: membership.id,
        timestamp,
        previousValue: null,
        newValue: { productId: membership.productId, packQuantity: membership.packQuantity, effectiveFrom: membership.effectiveFrom },
        reason,
      })));
      return created;
    });
    return redactFinancialDisclosure(this.buildDetail(input, group, COGS_TODAY), financialDisclosureAllowed(input));
  }

  async createCostProposal(input: CreateProductGroupCostProposalRepositoryInput, signal?: AbortSignal) {
    await delay(`product-groups:proposal:${input.groupId}:${input.effectiveFrom}`, signal);
    ensureEdit(input.actor);
    if (!input.financiallyConfirmed) throw new Error('Confirm the financial impact before submitting this Group cost.');
    if (input.organisationId !== input.organisation.id) throw new Error('The Product Group Organisation does not match the active tenant.');
    ensureCompanyAccess(input, input.companyId, input.actor);
    ensurePositiveMinor(input.baseCostMinor);
    ensureIsoDate(input.effectiveFrom);
    const group = this.findAccessibleGroup(input, input.groupId, input.actor);
    if (!group || group.companyId !== input.companyId) throw new Error('The Product Group is outside your Company assignment.');
    const state = this.state(input);
    const history = state.costRecordsByGroup[group.id] ?? [];
    const current = resolveProductGroupCost(history, input.effectiveFrom);
    const baseQuantity = input.baseQuantity ?? current?.baseQuantity ?? group.baseQuantity;
    const currency = ensureCurrency(input.currency ?? current?.currency ?? group.currency);
    ensurePositiveQuantity(baseQuantity, 'Base quantity');
    const reason = input.reason.trim();
    if (!reason) throw new Error('A reason is required for the financial audit.');
    if (!input.source.trim()) throw new Error('Cost source is required.');
    const dataset = this.dataset(input);
    const productById = new Map(dataset.products.map((product) => [product.id, product]));
    const memberImpacts = currentMembers(state, group.id, input.effectiveFrom).flatMap((membership) => {
      const product = productById.get(membership.productId);
      if (!product) return [];
      return [{
        productId: product.id,
        productName: product.title,
        internalSku: product.internalSku,
        packQuantity: membership.packQuantity,
        currentCostMinor: current ? deriveInheritedCogsMinor(current.baseCostMinor, membership.packQuantity, current.baseQuantity) : null,
        proposedCostMinor: deriveInheritedCogsMinor(input.baseCostMinor, membership.packQuantity, baseQuantity),
      }];
    });
    const timestamp = nowIso();
    return this.store.transaction((draft) => {
      const organisation = this.store.ensureOrganisation(draft, input.organisation.id);
      const competing = Object.values(organisation.proposals).some((proposal) => proposal.groupId === group.id
        && !TERMINAL_PROPOSAL_STATUSES.has(proposal.status));
      if (competing) throw new Error('This Product Group already has a financial change awaiting approval.');
      const proposal: ProductGroupCostProposal = {
        id: nextId(draft, 'product-group-proposal', timestamp),
        organisationId: input.organisation.id,
        companyId: group.companyId,
        groupId: group.id,
        currentCost: current ? clone(current) : null,
        proposedBaseCostMinor: input.baseCostMinor,
        proposedBaseQuantity: baseQuantity,
        proposedCurrency: currency,
        effectiveFrom: input.effectiveFrom,
        source: input.source.trim(),
        reason,
        financiallyConfirmed: true,
        memberImpacts,
        status: 'awaiting-approval',
        createdByUserId: input.actor.id,
        createdByName: input.actor.name,
        createdAt: timestamp,
      };
      organisation.proposals[proposal.id] = proposal;
      return proposal;
    });
  }

  async applyCostProposal(
    input: DashboardRepositoryInput,
    proposalId: string,
    actor: ProductGroupActor,
    canApprove: boolean,
    signal?: AbortSignal,
  ) {
    await delay(`product-groups:apply:${proposalId}`, signal);
    ensureApprove(actor, canApprove);
    const initialState = this.state(input);
    const proposal = initialState.proposals[proposalId];
    if (!proposal || proposal.organisationId !== input.organisation.id) throw new Error('The Product Group cost proposal could not be found.');
    ensureCompanyAccess(input, proposal.companyId, actor);
    if (proposal.status === 'applied') return clone(proposal);
    if (proposal.status !== 'awaiting-approval' && proposal.status !== 'failed') throw new Error('This Product Group cost proposal is not awaiting approval.');
    const group = this.findAccessibleGroup(input, proposal.groupId, actor);
    if (!group || group.companyId !== proposal.companyId) throw new Error('The Product Group is outside your Company assignment.');
    const current = resolveProductGroupCost(initialState.costRecordsByGroup[group.id] ?? [], proposal.effectiveFrom);
    const reviewedFingerprint = JSON.stringify(proposal.currentCost
      ? [proposal.currentCost.id, proposal.currentCost.baseCostMinor, proposal.currentCost.baseQuantity, proposal.currentCost.currency, proposal.currentCost.effectiveFrom, proposal.currentCost.effectiveTo]
      : null);
    const currentFingerprint = JSON.stringify(current
      ? [current.id, current.baseCostMinor, current.baseQuantity, current.currency, current.effectiveFrom, current.effectiveTo]
      : null);
    if (reviewedFingerprint !== currentFingerprint) {
      const failed = { ...proposal, status: 'failed' as const, failureMessage: 'The Group cost timeline changed after review. Create a new impact preview before approval.' };
      this.store.transaction((draft) => {
        this.store.ensureOrganisation(draft, input.organisation.id).proposals[proposal.id] = failed;
      });
      return failed;
    }
    if (input.scenarioId === 'repository-error') {
      const failed = { ...proposal, status: 'failed' as const, failureMessage: 'Profitability recalculation failed. No Product Group cost was committed.' };
      this.store.transaction((draft) => {
        this.store.ensureOrganisation(draft, input.organisation.id).proposals[proposal.id] = failed;
      });
      return failed;
    }
    const timestamp = nowIso();
    return this.store.transaction((draft) => {
      const state = this.store.ensureOrganisation(draft, input.organisation.id);
      const live = state.proposals[proposal.id];
      if (!live) throw new Error('The Product Group cost proposal could not be found.');
      if (live.status === 'applied') return live;
      const cost: ProductGroupCostRecord = {
        id: nextId(draft, 'product-group-cost', timestamp),
        organisationId: group.organisationId,
        companyId: group.companyId,
        groupId: group.id,
        baseCostMinor: proposal.proposedBaseCostMinor,
        baseQuantity: proposal.proposedBaseQuantity,
        currency: proposal.proposedCurrency,
        effectiveFrom: proposal.effectiveFrom,
        effectiveTo: null,
        status: 'active',
        source: proposal.source,
        reason: proposal.reason,
        createdByUserId: proposal.createdByUserId,
        createdByName: proposal.createdByName,
        createdAt: proposal.createdAt,
        approvedByUserId: actor.id,
        approvedByName: actor.name,
        approvedAt: timestamp,
        approvalStatus: 'approved',
      };
      const inserted = insertProductGroupCost(state.costRecordsByGroup[group.id] ?? [], cost);
      state.costRecordsByGroup[group.id] = inserted.history;
      const currentAtToday = resolveProductGroupCost(inserted.history, COGS_TODAY);
      state.groups[group.id] = {
        ...state.groups[group.id],
        baseQuantity: currentAtToday?.baseQuantity ?? state.groups[group.id].baseQuantity,
        currency: currentAtToday?.currency ?? state.groups[group.id].currency,
        updatedByUserId: actor.id,
        updatedByName: actor.name,
        updatedAt: timestamp,
      };
      const applied: ProductGroupCostProposal = {
        ...live,
        status: 'applied',
        approvedByUserId: actor.id,
        approvedByName: actor.name,
        approvedAt: timestamp,
        appliedAt: timestamp,
        failureMessage: undefined,
      };
      state.proposals[proposal.id] = applied;
      state.auditEvents.unshift(auditEvent(draft, {
        organisationId: group.organisationId,
        companyId: group.companyId,
        groupId: group.id,
        actor,
        action: 'product-group.base-cost-changed',
        targetType: 'product-group-cost',
        targetId: cost.id,
        timestamp,
        previousValue: inserted.previous ? { baseCostMinor: inserted.previous.baseCostMinor, currency: inserted.previous.currency, effectiveFrom: inserted.previous.effectiveFrom, effectiveTo: inserted.previous.effectiveTo } : null,
        newValue: { baseCostMinor: cost.baseCostMinor, currency: cost.currency, effectiveFrom: cost.effectiveFrom, effectiveTo: inserted.created.effectiveTo },
        reason: proposal.reason,
      }));
      if (inserted.previous?.baseQuantity !== cost.baseQuantity) {
        state.auditEvents.unshift(auditEvent(draft, {
          organisationId: group.organisationId,
          companyId: group.companyId,
          groupId: group.id,
          actor,
          action: 'product-group.base-quantity-changed',
          targetType: 'product-group-cost',
          targetId: cost.id,
          timestamp,
          previousValue: inserted.previous?.baseQuantity ?? null,
          newValue: cost.baseQuantity,
          reason: proposal.reason,
        }));
      }
      return applied;
    });
  }

  async changeMembership(input: ChangeProductGroupMembershipRepositoryInput, signal?: AbortSignal) {
    await delay(`product-groups:membership:${input.groupId}:${input.productId}:${input.effectiveFrom}`, signal);
    ensureEdit(input.actor);
    if (input.organisationId !== input.organisation.id) throw new Error('The Product Group Organisation does not match the active tenant.');
    ensureCompanyAccess(input, input.companyId, input.actor);
    ensureIsoDate(input.effectiveFrom);
    const group = this.findAccessibleGroup(input, input.groupId, input.actor);
    if (!group || group.companyId !== input.companyId) throw new Error('The Product Group is outside your Company assignment.');
    const product = this.dataset(input).products.find((candidate) => candidate.id === input.productId
      && candidate.organisationId === group.organisationId
      && candidate.ownerCompanyId === group.companyId);
    if (!product) throw new Error('The Product is outside this Group Company or assignment.');
    if (input.action !== 'remove') ensurePositiveQuantity(input.packQuantity ?? 0, 'Pack quantity');
    const reason = input.reason.trim();
    if (!reason) throw new Error('A reason is required for the audit history.');
    const timestamp = nowIso();
    this.store.transaction((draft) => {
      const state = this.store.ensureOrganisation(draft, input.organisation.id);
      let memberships = allMemberships(state);
      const effective = resolveProductGroupMembership(memberships, input.effectiveFrom, product.id);
      let action: ProductGroupAuditAction;
      let previousValue: unknown = effective ? { groupId: effective.groupId, packQuantity: effective.packQuantity, effectiveFrom: effective.effectiveFrom, effectiveTo: effective.effectiveTo } : null;
      let newValue: unknown;
      let targetId: string;
      if (input.action === 'remove') {
        if (!effective || effective.groupId !== group.id) throw new Error('The Product is not an active member of this Group on the selected date.');
        const closed = closeProductGroupMembership(memberships, effective.id, input.effectiveFrom);
        memberships = closed.history;
        action = 'product-group.member-removed';
        targetId = effective.id;
        newValue = { effectiveTo: input.effectiveFrom };
      } else {
        if (input.action === 'add' && effective) throw new Error('The Product already belongs to an active Group on the selected date.');
        if (input.action === 'change-pack-quantity' && (!effective || effective.groupId !== group.id)) {
          throw new Error('Pack quantity can change only while the Product belongs to this Group.');
        }
        const membership: ProductGroupMembership = {
          id: nextId(draft, 'product-group-member', timestamp),
          organisationId: group.organisationId,
          companyId: group.companyId,
          groupId: group.id,
          productId: product.id,
          packQuantity: input.packQuantity!,
          effectiveFrom: input.effectiveFrom,
          effectiveTo: null,
          status: 'active',
          reason,
          createdByUserId: input.actor.id,
          createdByName: input.actor.name,
          createdAt: timestamp,
          approvedByUserId: input.actor.id,
          approvedByName: input.actor.name,
          approvedAt: timestamp,
          approvalStatus: 'approved',
        };
        const inserted = insertProductGroupMembership(memberships, membership);
        memberships = inserted.history;
        action = input.action === 'add' ? 'product-group.member-added' : 'product-group.pack-quantity-changed';
        targetId = inserted.created.id;
        previousValue = inserted.previous ? { groupId: inserted.previous.groupId, packQuantity: inserted.previous.packQuantity, effectiveFrom: inserted.previous.effectiveFrom, effectiveTo: inserted.previous.effectiveTo } : previousValue;
        newValue = { groupId: group.id, productId: product.id, packQuantity: inserted.created.packQuantity, effectiveFrom: inserted.created.effectiveFrom, effectiveTo: inserted.created.effectiveTo };
      }
      state.membershipsByGroup = Object.fromEntries(
        [...new Set(memberships.map((membership) => membership.groupId))]
          .map((id) => [id, memberships.filter((membership) => membership.groupId === id)]),
      );
      state.groups[group.id] = {
        ...state.groups[group.id],
        updatedByUserId: input.actor.id,
        updatedByName: input.actor.name,
        updatedAt: timestamp,
      };
      state.auditEvents.unshift(auditEvent(draft, {
        organisationId: group.organisationId,
        companyId: group.companyId,
        groupId: group.id,
        actor: input.actor,
        action,
        targetType: 'product-group-membership',
        targetId,
        timestamp,
        previousValue,
        newValue,
        reason,
      }));
    });
    return redactFinancialDisclosure(this.buildDetail(input, group, COGS_TODAY), financialDisclosureAllowed(input));
  }

  async resolveProductCost(
    input: DashboardRepositoryInput,
    productId: string,
    onDate: string,
    signal?: AbortSignal,
  ): Promise<ProductGroupResolvedProductCost | null> {
    await delay(`product-groups:resolve:${productId}:${onDate}`, signal);
    ensureIsoDate(onDate);
    const product = this.dataset(input).products.find((candidate) => candidate.id === productId
      && candidate.organisationId === input.organisation.id);
    if (!product || !input.authorisedCompanyIds.includes(product.ownerCompanyId)) return null;
    const state = this.state(input);
    const memberships = allMemberships(state);
    const resolution = resolveCanonicalProductCogs({
      directHistory: directHistory(input.organisation.id, productId),
      groupCostHistory: allCostRecords(state),
      membershipHistory: memberships,
      date: onDate,
      productId,
      organisationId: input.organisation.id,
      companyId: product.ownerCompanyId,
    });
    const group = resolution.membership ? state.groups[resolution.membership.groupId] : null;
    return {
      groupId: group?.id ?? null,
      groupName: group?.name ?? null,
      resolution: clone(resolution),
    };
  }

  async recordDirectOverride(
    input: DashboardRepositoryInput,
    record: COGSRecord,
    actor: ProductGroupActor,
    signal?: AbortSignal,
  ) {
    await delay(`product-groups:override:${record.id}`, signal);
    ensureCompanyAccess(input, record.companyId, actor);
    if (record.organisationId !== input.organisation.id) throw new Error('The direct COGS record belongs to another Organisation.');
    const state = this.state(input);
    const membership = resolveProductGroupMembership(allMemberships(state), record.effectiveFrom, record.productId);
    if (!membership) return null;
    const group = state.groups[membership.groupId];
    if (!group || group.companyId !== record.companyId) return null;
    const existing = state.auditEvents.find((event) => event.action === 'product-group.direct-override-created'
      && event.targetId === record.id);
    if (existing) return clone(existing);
    const timestamp = record.approvedAt || nowIso();
    return this.store.transaction((draft) => {
      const organisation = this.store.ensureOrganisation(draft, input.organisation.id);
      const event = auditEvent(draft, {
        organisationId: group.organisationId,
        companyId: group.companyId,
        groupId: group.id,
        actor,
        action: 'product-group.direct-override-created',
        targetType: 'product-cogs',
        targetId: record.id,
        timestamp,
        previousValue: { source: 'Inherited from Product Group', groupId: group.id, productId: record.productId },
        newValue: { source: record.source, unitCostMinor: record.unitCostMinor, currency: record.currency, effectiveFrom: record.effectiveFrom },
        reason: record.reason,
      });
      organisation.auditEvents.unshift(event);
      return event;
    });
  }

  async getAuditEvents(input: DashboardRepositoryInput, groupId?: string, signal?: AbortSignal) {
    await delay(`product-groups:audit:${groupId ?? 'all'}`, signal);
    if (groupId && !this.findAccessibleGroup(input, groupId)) return [];
    const authorisedCompanies = new Set(input.authorisedCompanyIds);
    return this.state(input).auditEvents
      .filter((event) => authorisedCompanies.has(event.companyId) && (!groupId || event.groupId === groupId))
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
      .map(clone);
  }
}

export const mockProductGroupsRepository = new MockProductGroupsRepository();
