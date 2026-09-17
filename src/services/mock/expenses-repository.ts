import type { AnalyticsDataset } from '@/src/domain/analytics';
import type { Expense, ExpenseScope } from '@/src/domain/models';
import { evaluateAccess, type Capability } from '@/src/domain/permissions';
import { currentExpenseVersion, expenseStatus, EXPENSE_TODAY, validExpenseDate, type ExpenseDefinition, type ExpenseDetail, type ExpenseDraft, type ExpenseFilters, type ExpenseListItem, type ExpenseRepositoryInput, type ExpenseVersion, type ExpenseWorkspace } from '@/src/domain/expenses';
import { shiftIsoDate } from '@/src/domain/financial-calculations';
import { generateAnalyticsDataset } from '@/src/fixtures/analytics-data';
import type { ExpensesRepository } from '@/src/services/expenses-contracts';
import { expenseReportingMinor, filterProfitabilityRecords, prepareProfitabilityRecords, projectExpenseAllocations } from '@/src/services/analytics/analytics-aggregation';
import { materializeApprovedCogsDataset } from '@/src/services/mock/cogs-dataset';
import { mockExpensesStore, organisationExpenseState } from '@/src/services/mock/expenses-store';

function permitted(input: ExpenseRepositoryInput, capability: Capability, companyId?: string, accountId?: string) {
  return Boolean(input.principal && evaluateAccess({ ...input.principal, entitlements: new Set(input.principal.entitlements), capability, companyId, accountId }).allowed);
}
/** Never trust view/edit flags or supplied assignment lists at the repository boundary. */
export function authoriseExpenseInput(input: ExpenseRepositoryInput): ExpenseRepositoryInput {
  if (!permitted(input, 'expenses.view') || input.context.organisationId !== input.organisation.id) throw new Error('Expense access is unavailable for this scope.');
  const { from, to } = input.context.dateRange;
  if (!validExpenseDate(from) || !validExpenseDate(to) || from > to) throw new Error('Enter a valid reporting period.');
  const companies = input.companies.filter((company) => company.organisationId === input.organisation.id);
  const marketplaceAccounts = input.marketplaceAccounts.filter((account) => companies.some((company) => company.id === account.companyId));
  const authorisedCompanyIds = input.authorisedCompanyIds.filter((id) => companies.some((company) => company.id === id) && permitted(input, 'expenses.view', id));
  const authorisedAccountIds = input.authorisedAccountIds.filter((id) => marketplaceAccounts.some((account) => account.id === id && authorisedCompanyIds.includes(account.companyId) && permitted(input, 'expenses.view', account.companyId, id)));
  if (input.context.companyId !== 'all' && !authorisedCompanyIds.includes(input.context.companyId) || input.context.marketplaceAccountIds.some((id) => !authorisedAccountIds.includes(id))) throw new Error('Expense access is unavailable for this scope.');
  return { ...input, companies, marketplaceAccounts, authorisedCompanyIds, authorisedAccountIds, canViewExpenses: true, canViewSensitiveExpenses: permitted(input, 'expenses.view_sensitive') && input.scenarioId !== 'sensitive-expenses-restricted', actor: { ...input.actor, canEdit: permitted(input, 'expenses.edit') } };
}

function ensureAccess(input: ExpenseRepositoryInput) {
  if (!input.canViewExpenses || input.context.organisationId !== input.organisation.id) throw new Error('Expense access is unavailable for this scope.');
  if (input.scenarioId === 'repository-error') throw new Error('Expenses could not be loaded. Retry the request.');
}
export function expenseScopeAllowed(scope: ExpenseScope, dataset: AnalyticsDataset, input: ExpenseRepositoryInput) {
    input = authoriseExpenseInput(input);
  const companies = input.companies.filter((company) => company.organisationId === input.organisation.id);
  const companyIds = new Set(companies.map((company) => company.id));
  const accounts = input.marketplaceAccounts.filter((account) => companyIds.has(account.companyId));
  const accountAllowed = (id: string) => accounts.some((account) => account.id === id && input.authorisedCompanyIds.includes(account.companyId) && input.authorisedAccountIds.includes(id));
  const allAccountsAllowed = (ids: string[]) => ids.every(accountAllowed);
  if (scope.type === 'organisation') return companies.every((company) => input.authorisedCompanyIds.includes(company.id)) && allAccountsAllowed(accounts.map((account) => account.id));
  if (scope.type === 'company') return companyIds.has(scope.companyId) && input.authorisedCompanyIds.includes(scope.companyId) && allAccountsAllowed(accounts.filter((account) => account.companyId === scope.companyId).map((account) => account.id));
  if (scope.type === 'marketplace') {
    const scoped = accounts.filter((account) => account.marketplace === scope.marketplace);
    return scoped.length > 0 && allAccountsAllowed(scoped.map((account) => account.id));
  }
  if (scope.type === 'marketplace_account') return accountAllowed(scope.marketplaceAccountId);
  const product = dataset.products.find((item) => item.id === scope.productId && item.organisationId === input.organisation.id && companyIds.has(item.ownerCompanyId));
  return Boolean(product && input.authorisedCompanyIds.includes(product.ownerCompanyId) && allAccountsAllowed(dataset.listings.filter((listing) => listing.productId === product.id).map((listing) => listing.marketplaceAccountId)));
}
export function expenseScopeLabel(scope: ExpenseScope, dataset: AnalyticsDataset, input: ExpenseRepositoryInput) {
  if (scope.type === 'organisation') return input.organisation.name;
  if (scope.type === 'company') return input.companies.find((company) => company.id === scope.companyId)?.name ?? 'Company';
  if (scope.type === 'marketplace') return ({ amazon: 'Amazon', ebay: 'eBay', temu: 'Temu' })[scope.marketplace];
  if (scope.type === 'marketplace_account') return input.marketplaceAccounts.find((account) => account.id === scope.marketplaceAccountId)?.displayName ?? 'Marketplace account';
  return dataset.products.find((product) => product.id === scope.productId)?.title ?? 'Product';
}
function matchesContext(scope: ExpenseScope, dataset: AnalyticsDataset, input: ExpenseRepositoryInput, productId?: string) {
  const accounts = input.marketplaceAccounts.filter((account) => input.authorisedAccountIds.includes(account.id))
    .filter((account) => input.context.companyId === 'all' || account.companyId === input.context.companyId)
    .filter((account) => input.context.marketplace === 'all' || account.marketplace === input.context.marketplace)
    .filter((account) => !input.context.marketplaceAccountIds.length || input.context.marketplaceAccountIds.includes(account.id));
  if (scope.type === 'organisation') return true;
  if (scope.type === 'company') return (input.context.companyId === 'all' || input.context.companyId === scope.companyId) && (!productId || dataset.products.some((product) => product.id === productId && product.ownerCompanyId === scope.companyId));
  if (scope.type === 'marketplace') return accounts.some((account) => account.marketplace === scope.marketplace && (!productId || dataset.listings.some((listing) => listing.productId === productId && listing.marketplaceAccountId === account.id)));
  if (scope.type === 'marketplace_account') return accounts.some((account) => account.id === scope.marketplaceAccountId) && (!productId || dataset.listings.some((listing) => listing.productId === productId && listing.marketplaceAccountId === scope.marketplaceAccountId));
  const product = dataset.products.find((item) => item.id === scope.productId);
  return Boolean(product && (!productId || productId === product.id) && (input.context.companyId === 'all' || product.ownerCompanyId === input.context.companyId) && (accounts.length ? dataset.listings.some((listing) => listing.productId === product.id && accounts.some((account) => account.id === listing.marketplaceAccountId)) : input.context.marketplace === 'all' && !input.context.marketplaceAccountIds.length));
}
function readable(definition: ExpenseDefinition, versions: ExpenseVersion[], dataset: AnalyticsDataset, input: ExpenseRepositoryInput) {
  return definition.organisationId === input.organisation.id && (!definition.sensitive || (input.canViewSensitiveExpenses && input.scenarioId !== 'sensitive-expenses-restricted')) && versions.every((version) => expenseScopeAllowed(version.scope, dataset, input));
}
function validateDraft(draft: ExpenseDraft, dataset: AnalyticsDataset, input: ExpenseRepositoryInput) {
  ensureAccess(input);
  if (!input.actor.canEdit) throw new Error('You do not have permission to manage Expenses.');
  if (!['recurring', 'one-off'].includes(draft.type)) throw new Error('Select recurring or one-off expense.');
  if (!draft.name.trim() || !draft.category.trim()) throw new Error('Enter an expense name and category.');
  if (!Number.isSafeInteger(draft.amountMinor) || draft.amountMinor <= 0) throw new Error('Amount must be greater than zero in whole minor units.');
  if (!['GBP', 'EUR', 'USD'].includes(draft.currency)) throw new Error('Use GBP, EUR or USD.');
  if (!validExpenseDate(draft.effectiveFrom) || (draft.endDate && (!validExpenseDate(draft.endDate) || draft.endDate < draft.effectiveFrom))) throw new Error('Enter a valid effective period; the end cannot be before the start.');
  if (!draft.source.trim() || !draft.reason.trim()) throw new Error('Source and reason are required for financial changes.');
  if (!draft.scope || !expenseScopeAllowed(draft.scope, dataset, input)) throw new Error('The expense scope is outside your authorised tenant, Company or account assignment.');
  if (draft.sensitive && (!input.canViewSensitiveExpenses || input.scenarioId === 'sensitive-expenses-restricted')) throw new Error('Sensitive expense access is required.');
  if (!draft.confirmed) throw new Error('Confirm that you reviewed the amount, scope and effective date.');
  if (draft.effectiveFrom < EXPENSE_TODAY && !draft.backdatedConfirmed) throw new Error('Historical profitability may change. Explicitly confirm this backdated change.');
}
const pause = (signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  const timer = setTimeout(resolve, 180);
  signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
});

export class MockExpensesRepository implements ExpensesRepository {
  private bases = new Map<string, AnalyticsDataset>();
  private base(input: ExpenseRepositoryInput) {
    const key = JSON.stringify([input.organisation, input.companies, input.marketplaceAccounts]);
    let dataset = this.bases.get(key);
    if (!dataset) { dataset = generateAnalyticsDataset(input); this.bases.set(key, dataset); }
    return dataset;
  }
  private projection(input: ExpenseRepositoryInput, filters: ExpenseFilters = {}) {
    input = authoriseExpenseInput(input);
    ensureAccess(input);
    const base = this.base(input);
    const state = organisationExpenseState(base, input.organisation.id);
    const dataset = materializeApprovedCogsDataset(base, input.organisation.id);
    const prepared = prepareProfitabilityRecords({ ...dataset, expenses: [] }, input);
    const selected = filterProfitabilityRecords(prepared, input.context).filter((record) => !filters.productId || record.productId === filters.productId);
    const selectedIds = new Set(selected.map((record) => record.id));
    const projection = projectExpenseAllocations(prepared, dataset.expenses);
    const allocations = projection.allocations.filter((allocation) => selectedIds.has(allocation.recordId));
    const occurrenceById = new Map(dataset.expenses.map((occurrence) => [occurrence.id, occurrence]));
    const from = input.context.dateRange.from; const to = input.context.dateRange.to;
    const periodOccurrences = dataset.expenses.filter((occurrence) => occurrence.occurredAt >= from && occurrence.occurredAt <= to);
    const periodIds = new Set(periodOccurrences.map((occurrence) => occurrence.id));
    const rows: ExpenseListItem[] = Object.values(state.definitions).flatMap((expense) => {
      const versions = state.versions[expense.id] ?? [];
      if (!readable(expense, versions, base, input)) return [];
      const version = currentExpenseVersion(versions, filters.effectiveDate || EXPENSE_TODAY);
      if (!version || !matchesContext(version.scope, base, input, filters.productId)) return [];
      const occurrences = periodOccurrences.filter((occurrence) => occurrence.expenseDefinitionId === expense.id);
      const ids = new Set(occurrences.map((occurrence) => occurrence.id));
      const allocatedMinor = allocations.filter((allocation) => ids.has(allocation.expenseId)).reduce((sum, allocation) => sum + allocation.amountMinor, 0);
      const unallocatedMinor = projection.unallocated.filter((item) => ids.has(item.expenseId) && periodIds.has(item.expenseId)).reduce((sum, item) => sum + item.amountMinor, 0);
      return [{ id: expense.id, expense, version, status: expenseStatus(expense, versions), scopeLabel: expenseScopeLabel(version.scope, base, input), periodAmountMinor: occurrences.reduce((sum, occurrence) => sum + expenseReportingMinor(occurrence), 0), allocatedMinor, unallocatedMinor, needsReview: unallocatedMinor > 0 }];
    });
    const categories = [...new Set(rows.map((row) => row.expense.category))].sort();
    const filtered = rows.filter((row) => !filters.search || `${row.expense.name} ${row.expense.category} ${row.scopeLabel}`.toLowerCase().includes(filters.search.toLowerCase()))
      .filter((row) => !filters.type || filters.type === 'all' || row.expense.type === filters.type)
      .filter((row) => !filters.category || filters.category === 'all' || row.expense.category === filters.category)
      .filter((row) => !filters.status || filters.status === 'all' || row.status === filters.status)
      .filter((row) => !filters.sensitivity || filters.sensitivity === 'all' || (filters.sensitivity === 'sensitive') === row.expense.sensitive)
      .filter((row) => !filters.needsReview || row.needsReview)
      .filter((row) => !filters.effectiveDate || row.version.effectiveFrom <= filters.effectiveDate && (!row.version.effectiveTo || row.version.effectiveTo > filters.effectiveDate))
      .sort((a, b) => Number(Boolean(a.expense.legacyOccurrenceId)) - Number(Boolean(b.expense.legacyOccurrenceId)) || b.expense.updatedAt.localeCompare(a.expense.updatedAt) || a.expense.name.localeCompare(b.expense.name));
    return { base, state, dataset, selected, allocations, occurrenceById, rows: filtered, categories };
  }
  async list(input: ExpenseRepositoryInput, filters: ExpenseFilters = {}, signal?: AbortSignal): Promise<ExpenseWorkspace> {
    input = authoriseExpenseInput(input);
    await pause(signal);
    const { rows, categories, base } = this.projection(input, filters);
    const scopes: ExpenseScope[] = [{ type: 'organisation' }, ...input.companies.map((company): ExpenseScope => ({ type: 'company', companyId: company.id })), ...(['amazon', 'ebay', 'temu'] as const).map((marketplace): ExpenseScope => ({ type: 'marketplace', marketplace })), ...input.marketplaceAccounts.map((account): ExpenseScope => ({ type: 'marketplace_account', marketplaceAccountId: account.id })), ...base.products.map((product): ExpenseScope => ({ type: 'product', productId: product.id }))];
    const scopeOptions = scopes.filter((scope) => expenseScopeAllowed(scope, base, input)).map((scope) => ({ value: JSON.stringify(scope), label: expenseScopeLabel(scope, base, input), scope }));
    return { rows, categories, scopeOptions, products: base.products.filter((product) => expenseScopeAllowed({ type: 'product', productId: product.id }, base, input)).map(({ id, title, ownerCompanyId }) => ({ id, title, ownerCompanyId })), summary: { activeRecurring: rows.filter((row) => row.expense.type === 'recurring' && row.status === 'active').length, oneOffThisPeriod: rows.filter((row) => row.expense.type === 'one-off' && row.periodAmountMinor > 0).length, amountMinor: rows.reduce((sum, row) => sum + row.periodAmountMinor, 0), allocatedMinor: rows.reduce((sum, row) => sum + row.allocatedMinor, 0), unallocatedMinor: rows.reduce((sum, row) => sum + row.unallocatedMinor, 0), needsReview: rows.filter((row) => row.needsReview).length }, sensitiveRestricted: !input.canViewSensitiveExpenses || input.scenarioId === 'sensitive-expenses-restricted' };
  }
  async getDetail(input: ExpenseRepositoryInput, expenseId: string, signal?: AbortSignal): Promise<ExpenseDetail | null> {
    input = authoriseExpenseInput(input);
    await pause(signal);
    const view = this.projection(input);
    const row = view.rows.find((item) => item.id === expenseId);
    if (!row) return null;
    const byRecord = new Map(view.selected.map((record) => [record.id, record]));
    const detailAllocations = view.allocations.filter((item) => view.occurrenceById.get(item.expenseId)?.expenseDefinitionId === expenseId);
    return { ...row, versions: [...(view.state.versions[expenseId] ?? [])].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom)), occurrences: view.dataset.expenses.filter((item) => item.expenseDefinitionId === expenseId && item.occurredAt >= input.context.dateRange.from && item.occurredAt <= input.context.dateRange.to), allocations: detailAllocations.map((allocation) => {
      const record = byRecord.get(allocation.recordId)!;
      return { id: `${allocation.expenseId}:${record.id}`, occurredOn: record.occurredOn, companyId: record.companyId, company: input.companies.find((item) => item.id === record.companyId)?.name ?? record.companyId, marketplace: record.marketplace, accountId: record.marketplaceAccountId, account: input.marketplaceAccounts.find((item) => item.id === record.marketplaceAccountId)?.displayName ?? record.marketplaceAccountId, productId: record.productId, product: view.base.products.find((item) => item.id === record.productId)?.title ?? record.productId, eligibleNetRevenueMinor: Math.max(0, record.grossSalesMinor - record.discountsMinor - record.refundsMinor), allocatedMinor: allocation.amountMinor };
    }), activity: view.state.auditEvents.filter((event) => event.target.id === expenseId).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)) };
  }
  async create(input: ExpenseRepositoryInput, draft: ExpenseDraft) {
    input = authoriseExpenseInput(input);
    const base = this.base(input); validateDraft(draft, base, input); await pause();
    const now = new Date().toISOString();
    return mockExpensesStore.transaction((state) => {
      const id = `${input.organisation.id}:expense:created-${state.sequence + 1}`;
      const definition: ExpenseDefinition = { id, organisationId: input.organisation.id, name: draft.name.trim(), category: draft.category.trim(), type: draft.type, sensitive: draft.sensitive, createdAt: now, createdBy: input.actor.name, updatedAt: now, updatedBy: input.actor.name };
      const version = this.version(id, `${id}:v1`, draft, now, input.actor.name);
      const org = mockExpensesStore.ensureOrganisation(state, input.organisation.id);
      org.definitions[id] = definition; org.versions[id] = [version];
      org.auditEvents.unshift({ id: `${id}:audit:${state.sequence + 1}`, organisationId: input.organisation.id, actor: { type: 'user', userId: input.actor.id }, action: draft.effectiveFrom < EXPENSE_TODAY ? 'expense.backdated' : 'expense.created', target: { type: 'expense', id }, occurredAt: now, previousValue: null, newValue: { definition, version, actorName: input.actor.name }, reason: draft.reason.trim() });
      return definition;
    });
  }
  private version(expenseId: string, id: string, draft: ExpenseDraft, now: string, actor: string, billingDay = Number(draft.effectiveFrom.slice(8, 10))): ExpenseVersion {
    return { id, expenseId, amountMinor: draft.amountMinor, currency: draft.currency, scope: draft.scope, effectiveFrom: draft.effectiveFrom, effectiveTo: draft.type === 'one-off' ? shiftIsoDate(draft.effectiveFrom, 1) : draft.endDate ? shiftIsoDate(draft.endDate, 1) : null, recurrence: draft.type === 'recurring' ? 'monthly' : null, billingDay, source: draft.source.trim(), reason: draft.reason.trim(), changedBy: actor, createdAt: now };
  }
  async update(input: ExpenseRepositoryInput, expenseId: string, draft: ExpenseDraft) {
    input = authoriseExpenseInput(input);
    const base = this.base(input); validateDraft(draft, base, input);
    const current = organisationExpenseState(base, input.organisation.id);
    const definition = current.definitions[expenseId]; const versions = current.versions[expenseId] ?? [];
    if (!definition || !readable(definition, versions, base, input)) throw new Error('Expense not found or outside your authorised scope.');
    if (draft.type !== definition.type || draft.sensitive !== definition.sensitive) throw new Error('Expense type and sensitivity are fixed after creation to preserve historical disclosure.');
    if (definition.type === 'one-off' && versions.some((version) => !version.supersededAt && version.effectiveFrom < EXPENSE_TODAY) && !draft.backdatedConfirmed) throw new Error('Correcting an applied one-off expense changes historical profitability. Explicitly confirm the correction.');
    await pause(); const now = new Date().toISOString();
    return mockExpensesStore.transaction((state) => {
      const org = mockExpensesStore.ensureOrganisation(state, input.organisation.id);
      const active = versions.filter((version) => !version.supersededAt);
      const existing = currentExpenseVersion(active, draft.effectiveFrom);
      const incoming = this.version(expenseId, `${expenseId}:v${state.sequence + 10}`, draft, now, input.actor.name, existing?.billingDay);
      const next = active.filter((version) => version.effectiveFrom > incoming.effectiveFrom).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))[0];
      if (definition.type === 'recurring' && next && (!incoming.effectiveTo || next.effectiveFrom < incoming.effectiveTo)) incoming.effectiveTo = next.effectiveFrom;
      const updated: ExpenseVersion[] = [];
      for (const version of versions) {
        const overlaps = definition.type === 'one-off' || (!version.effectiveTo || incoming.effectiveFrom < version.effectiveTo) && (!incoming.effectiveTo || version.effectiveFrom < incoming.effectiveTo);
        if (version.supersededAt || !overlaps) { updated.push(version); continue; }
        updated.push({ ...version, supersededAt: now });
        if (definition.type === 'recurring' && version.effectiveFrom < incoming.effectiveFrom) updated.push({ ...version, id: `${version.id}:before:${state.sequence}`, effectiveTo: incoming.effectiveFrom });
        if (definition.type === 'recurring' && incoming.effectiveTo && (!version.effectiveTo || incoming.effectiveTo < version.effectiveTo)) updated.push({ ...version, id: `${version.id}:after:${state.sequence}`, effectiveFrom: incoming.effectiveTo });
      }
      updated.push(incoming);
      const changed = { ...definition, name: draft.name.trim(), category: draft.category.trim(), updatedAt: now, updatedBy: input.actor.name };
      org.definitions[expenseId] = changed; org.versions[expenseId] = updated;
      org.auditEvents.unshift({ id: `${expenseId}:audit:${state.sequence + 1}`, organisationId: input.organisation.id, actor: { type: 'user', userId: input.actor.id }, action: draft.effectiveFrom < EXPENSE_TODAY ? 'expense.backdated' : 'expense.updated', target: { type: 'expense', id: expenseId }, occurredAt: now, previousValue: { definition, versions }, newValue: { definition: changed, version: incoming, actorName: input.actor.name }, reason: draft.reason.trim() });
      return changed;
    });
  }
  async end(input: ExpenseRepositoryInput, expenseId: string, values: { endDate: string; reason: string; confirmed: boolean; backdatedConfirmed: boolean }) {
    input = authoriseExpenseInput(input);
    ensureAccess(input);
    const base = this.base(input); const current = organisationExpenseState(base, input.organisation.id);
    const definition = current.definitions[expenseId]; const versions = current.versions[expenseId] ?? [];
    if (!input.actor.canEdit || !definition || !readable(definition, versions, base, input)) throw new Error('Expense is unavailable or you do not have permission to end it.');
    if (definition.type !== 'recurring') throw new Error('One-off expenses require an explicit correction.');
    const active = versions.filter((version) => !version.supersededAt);
    if (!validExpenseDate(values.endDate) || values.endDate < active.map((version) => version.effectiveFrom).sort()[0]) throw new Error('The end date cannot precede the expense start.');
    if (!values.reason.trim() || !values.confirmed || values.endDate < EXPENSE_TODAY && !values.backdatedConfirmed) throw new Error('Provide a reason and explicitly confirm the financial change, including any historical impact.');
    await pause(); const now = new Date().toISOString(); const boundary = shiftIsoDate(values.endDate, 1);
    return mockExpensesStore.transaction((state) => {
      const org = mockExpensesStore.ensureOrganisation(state, input.organisation.id);
      org.versions[expenseId] = versions.flatMap((version) => {
        if (version.supersededAt || version.effectiveTo && version.effectiveTo <= boundary) return [version];
        return version.effectiveFrom < boundary ? [{ ...version, supersededAt: now }, { ...version, id: `${version.id}:ended:${state.sequence}`, effectiveTo: boundary, changedBy: input.actor.name, createdAt: now, reason: values.reason.trim() }] : [{ ...version, supersededAt: now }];
      });
      const changed = { ...definition, updatedAt: now, updatedBy: input.actor.name }; org.definitions[expenseId] = changed;
      org.auditEvents.unshift({ id: `${expenseId}:audit:${state.sequence + 1}`, organisationId: input.organisation.id, actor: { type: 'user', userId: input.actor.id }, action: 'expense.ended', target: { type: 'expense', id: expenseId }, occurredAt: now, previousValue: { versions }, newValue: { endDate: values.endDate, actorName: input.actor.name }, reason: values.reason.trim() });
      return changed;
    });
  }
}
