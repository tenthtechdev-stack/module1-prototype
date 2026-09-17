import type { AnalyticsDataset } from '@/src/domain/analytics';
import type { AuditEvent, Expense, ExpenseScope } from '@/src/domain/models';
import type { ExpenseDefinition, ExpenseVersion } from '@/src/domain/expenses';
import { shiftIsoDate } from '@/src/domain/financial-calculations';

export const EXPENSES_STORAGE_KEY = 'stock-supplies:expenses:v1';
export interface OrganisationExpensesState { definitions: Record<string, ExpenseDefinition>; versions: Record<string, ExpenseVersion[]>; auditEvents: AuditEvent[]; }
export interface ExpensesState { version: 1; sequence: number; organisations: Record<string, OrganisationExpensesState>; }
const blank = (): ExpensesState => ({ version: 1, sequence: 0, organisations: {} });
const emptyOrganisation = (): OrganisationExpensesState => ({ definitions: {}, versions: {}, auditEvents: [] });
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
export class MockExpensesStore {
  private memory = blank();
  read(): ExpensesState {
    if (typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem(EXPENSES_STORAGE_KEY);
        if (!raw) return blank();
        const parsed = JSON.parse(raw) as ExpensesState;
        if (parsed.version === 1 && typeof parsed.sequence === 'number' && parsed.organisations) this.memory = parsed;
      } catch { /* Browser-local prototype memory remains usable. */ }
    }
    return clone(this.memory);
  }
  transaction<T>(operation: (draft: ExpensesState) => T): T {
    const state = this.read();
    const result = operation(state);
    state.sequence += 1;
    this.memory = clone(state);
    if (typeof window !== 'undefined') { try { window.localStorage.setItem(EXPENSES_STORAGE_KEY, JSON.stringify(state)); } catch { /* Memory fallback. */ } }
    return clone(result);
  }
  ensureOrganisation(state: ExpensesState, id: string) { return state.organisations[id] ??= emptyOrganisation(); }
  reset() { this.memory = blank(); if (typeof window !== 'undefined') window.localStorage.removeItem(EXPENSES_STORAGE_KEY); }
}
export const mockExpensesStore = new MockExpensesStore();
export function getExpenseStoreVersion() { return mockExpensesStore.read().sequence; }

/** Adapt exact Phase 3 events without regenerating or rescheduling an applied expense. */
export function seedExpenseDefinitions(dataset: AnalyticsDataset, organisationId: string): OrganisationExpensesState {
  const state = emptyOrganisation();
  for (const occurrence of dataset.expenses.filter((item) => item.organisationId === organisationId && (!item.expenseDefinitionId || item.expenseDefinitionId === item.id))) {
    const id = occurrence.id;
    state.definitions[id] = { id, organisationId, name: occurrence.category, category: occurrence.category.replace(/^One-off /, ''), type: 'one-off', sensitive: occurrence.sensitive, createdAt: `${occurrence.occurredAt}T09:00:00.000Z`, createdBy: 'Phase 3 import', updatedAt: `${occurrence.occurredAt}T09:00:00.000Z`, updatedBy: 'Phase 3 import', legacyOccurrenceId: id };
    state.versions[id] = [{ id: `${id}:v1`, expenseId: id, amountMinor: occurrence.amountMinor, currency: occurrence.currency as ExpenseVersion['currency'], scope: occurrence.scope, effectiveFrom: occurrence.occurredAt.slice(0, 10), effectiveTo: shiftIsoDate(occurrence.occurredAt, 1), recurrence: null, billingDay: Number(occurrence.occurredAt.slice(8, 10)), source: 'Canonical Phase 3 expense fixture', reason: 'Original applied operational expense retained on its exact date.', changedBy: 'Phase 3 import', createdAt: `${occurrence.occurredAt}T09:00:00.000Z` }];
  }
  const create = (slug: string, name: string, category: string, scope: ExpenseScope, amountMinor: number, start: string, options: { end?: string; oneOff?: boolean; sensitive?: boolean; currency?: ExpenseVersion['currency']; priorAmount?: number } = {}) => {
    const id = `${organisationId}:expense:${slug}`;
    const createdAt = '2026-01-01T09:00:00.000Z';
    state.definitions[id] = { id, organisationId, name, category, type: options.oneOff ? 'one-off' : 'recurring', sensitive: options.sensitive ?? false, createdAt, createdBy: 'Emma Richardson', updatedAt: '2026-09-01T09:00:00.000Z', updatedBy: 'Emma Richardson' };
    const version: ExpenseVersion = { id: `${id}:v1`, expenseId: id, amountMinor, currency: options.currency ?? 'GBP', scope, effectiveFrom: start, effectiveTo: options.oneOff ? shiftIsoDate(start, 1) : options.end ?? null, recurrence: options.oneOff ? null : 'monthly', billingDay: Number(start.slice(8, 10)), source: 'Supplier invoice · prototype fixture', reason: 'Configured operational expense with effective-dated evidence.', changedBy: 'Emma Richardson', createdAt };
    state.versions[id] = options.priorAmount ? [{ ...version, amountMinor: options.priorAmount, effectiveTo: '2026-04-01' }, { ...version, id: `${id}:v2`, effectiveFrom: '2026-04-01', createdAt: '2026-03-20T09:00:00.000Z', reason: 'Subscription renewal from April; earlier periods retain £250/month.' }] : [version];
    state.auditEvents.push({ id: `${id}:created`, organisationId, actor: { type: 'user', userId: 'usr-emma-richardson' }, action: 'expense.created', target: { type: 'expense', id }, occurredAt: createdAt, previousValue: null, newValue: { name, amountMinor, effectiveFrom: start, actorName: 'Emma Richardson' }, reason: version.reason });
  };
  create('analytics-subscription', 'Marketplace Analytics Subscription', 'Software & subscriptions', { type: 'organisation' }, 30000, '2026-01-01', { priorAmount: 25000 });
  const owner = dataset.products.find((product) => product.organisationId === organisationId);
  if (owner) {
    create('warehouse-storage', 'Warehouse Storage Allocation', 'Storage & fulfilment', { type: 'company', companyId: owner.ownerCompanyId }, 17500, '2026-01-01');
    create('product-photography', 'Product Photography', 'Creative services', { type: 'product', productId: owner.id }, 45000, '2026-09-05', { oneOff: true });
    const noSalesDay = '2026-09-05';
    const withoutSales = dataset.products.find((product) => product.organisationId === organisationId && !dataset.records.some((record) => record.productId === product.id && record.occurredOn === noSalesDay));
    if (withoutSales) create('unallocated-packaging', 'Packaging Design · awaiting sales', 'Creative services', { type: 'product', productId: withoutSales.id }, 12500, noSalesDay, { oneOff: true });
  }
  const amazon = dataset.listings.find((listing) => listing.marketplace === 'amazon');
  if (amazon) create('amazon-account-service', 'Marketplace Account Service', 'Marketplace services', { type: 'marketplace_account', marketplaceAccountId: amazon.marketplaceAccountId }, 6500, '2026-01-04');
  if (dataset.listings.some((listing) => listing.marketplace === 'amazon')) create('amazon-compliance', 'Amazon Compliance Subscription', 'Compliance', { type: 'marketplace', marketplace: 'amazon' }, 10000, '2026-04-01', { currency: 'EUR' });
  if (dataset.listings.some((listing) => listing.marketplace === 'ebay')) create('ebay-returns', 'eBay Returns Processing Service', 'Returns operations', { type: 'marketplace', marketplace: 'ebay' }, 8500, '2026-04-01');
  create('sensitive-advisory', 'Confidential Commercial Advisory', 'Advisory', { type: 'organisation' }, 62500, '2026-04-01', { sensitive: true });
  create('scheduled-compliance', 'Compliance Subscription · next quarter', 'Compliance', { type: 'organisation' }, 12500, '2026-10-01');
  create('ended-packaging', 'Packaging Design Retainer', 'Creative services', { type: 'organisation' }, 9500, '2026-01-01', { end: '2026-07-01' });
  return state;
}

export function organisationExpenseState(dataset: AnalyticsDataset, organisationId: string): OrganisationExpensesState {
  const seed = seedExpenseDefinitions(dataset, organisationId);
  const saved = mockExpensesStore.read().organisations[organisationId];
  return saved ? { definitions: { ...seed.definitions, ...saved.definitions }, versions: { ...seed.versions, ...saved.versions }, auditEvents: [...saved.auditEvents, ...seed.auditEvents] } : seed;
}

/** Full monthly charge on the anchored billing day (clamped for short months); no daily proration. */
export function materializeExpenseOccurrences(definition: ExpenseDefinition, versions: ExpenseVersion[], range: { from: string; to: string }): Expense[] {
  const result: Expense[] = [];
  for (const version of versions.filter((item) => !item.supersededAt)) {
    const add = (date: string) => {
      if (date < version.effectiveFrom || (version.effectiveTo && date >= version.effectiveTo) || date < range.from || date > range.to) return;
      result.push({ id: definition.legacyOccurrenceId ?? `${definition.id}:${version.id}:${date}`, organisationId: definition.organisationId, expenseDefinitionId: definition.id, expenseVersionId: version.id, expenseType: definition.type, name: definition.name, scope: version.scope, occurredAt: date, category: definition.category, amountMinor: version.amountMinor, currency: version.currency, sensitive: definition.sensitive });
    };
    if (definition.type === 'one-off') { add(version.effectiveFrom); continue; }
    const from = version.effectiveFrom > range.from ? version.effectiveFrom : range.from;
    let month = `${from.slice(0, 7)}-01`;
    while (month <= range.to && (!version.effectiveTo || month < version.effectiveTo)) {
      const [year, monthNumber] = month.split('-').map(Number);
      const day = Math.min(version.billingDay, new Date(Date.UTC(year, monthNumber, 0)).getUTCDate());
      add(`${month.slice(0, 7)}-${String(day).padStart(2, '0')}`);
      month = new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 10);
    }
  }
  return result.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id));
}
export function materializeExpensesDataset(dataset: AnalyticsDataset, organisationId: string): AnalyticsDataset {
  const state = organisationExpenseState(dataset, organisationId);
  return { ...dataset, expenses: Object.values(state.definitions).flatMap((definition) => materializeExpenseOccurrences(definition, state.versions[definition.id] ?? [], { from: '2025-01-01', to: '2027-12-31' })) };
}
