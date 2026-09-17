import type { CurrencyCode, DashboardRepositoryInput } from '@/src/domain/analytics';
import type { AuditEvent, Expense, ExpenseScope, Product } from '@/src/domain/models';
import type { TransactionPrincipal } from '@/src/services/transactions-contracts';

export const EXPENSE_TODAY = '2026-09-09';
export const EXPENSE_ALLOCATION_BASIS = 'Net Revenue within eligible scope on the expense date';
export type ExpenseType = 'recurring' | 'one-off';
export type ExpenseStatus = 'active' | 'scheduled' | 'ended';

/** A governed definition owns versions; Expense remains the canonical engine occurrence. */
export interface ExpenseDefinition {
  id: string;
  organisationId: string;
  name: string;
  category: string;
  type: ExpenseType;
  sensitive: boolean;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  /** Imported Phase 3 occurrence retained with its exact original date and amount. */
  legacyOccurrenceId?: string;
}

export interface ExpenseVersion {
  id: string;
  expenseId: string;
  amountMinor: number;
  currency: CurrencyCode;
  scope: ExpenseScope;
  effectiveFrom: string;
  /** Exclusive, matching the established historical COGS convention. */
  effectiveTo: string | null;
  recurrence: 'monthly' | null;
  /** Monthly billing anchor retained when an amount changes mid-cycle. */
  billingDay: number;
  source: string;
  reason: string;
  changedBy: string;
  createdAt: string;
  supersededAt?: string;
}

export interface ExpenseActor { id: string; name: string; canEdit: boolean; }
export interface ExpenseRepositoryInput extends DashboardRepositoryInput { canViewExpenses: boolean; actor: ExpenseActor; principal: TransactionPrincipal; }
export interface ExpenseDraft {
  name: string;
  category: string;
  type: ExpenseType;
  sensitive: boolean;
  amountMinor: number;
  currency: CurrencyCode;
  scope: ExpenseScope;
  effectiveFrom: string;
  /** Inclusive date supplied by the UI. */
  endDate?: string;
  source: string;
  reason: string;
  confirmed: boolean;
  backdatedConfirmed: boolean;
}
export interface ExpenseFilters {
  search?: string;
  type?: ExpenseType | 'all';
  category?: string;
  status?: ExpenseStatus | 'all';
  sensitivity?: 'all' | 'standard' | 'sensitive';
  productId?: string;
  effectiveDate?: string;
  needsReview?: boolean;
}
export interface ExpenseAllocationRow {
  id: string;
  occurredOn: string;
  companyId: string;
  company: string;
  marketplace: string;
  accountId: string;
  account: string;
  productId: string;
  product: string;
  eligibleNetRevenueMinor: number;
  allocatedMinor: number;
}
export interface ExpenseListItem {
  id: string;
  expense: ExpenseDefinition;
  version: ExpenseVersion;
  status: ExpenseStatus;
  scopeLabel: string;
  periodAmountMinor: number;
  allocatedMinor: number;
  unallocatedMinor: number;
  needsReview: boolean;
}
export interface ExpenseWorkspace {
  rows: ExpenseListItem[];
  categories: string[];
  scopeOptions: Array<{ value: string; label: string; scope: ExpenseScope }>;
  products: Pick<Product, 'id' | 'title' | 'ownerCompanyId'>[];
  summary: { activeRecurring: number; oneOffThisPeriod: number; amountMinor: number; allocatedMinor: number; unallocatedMinor: number; needsReview: number; };
  sensitiveRestricted: boolean;
}
export interface ExpenseDetail extends ExpenseListItem {
  versions: ExpenseVersion[];
  occurrences: Expense[];
  allocations: ExpenseAllocationRow[];
  activity: AuditEvent[];
}

export function validExpenseDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}
export function currentExpenseVersion(versions: ExpenseVersion[], on = EXPENSE_TODAY) {
  const active = versions.filter((version) => !version.supersededAt).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  return active.find((version) => version.effectiveFrom <= on && (!version.effectiveTo || on < version.effectiveTo))
    ?? active.find((version) => version.effectiveFrom > on) ?? active.at(-1) ?? null;
}
export function expenseStatus(definition: ExpenseDefinition, versions: ExpenseVersion[], on = EXPENSE_TODAY): ExpenseStatus {
  const active = versions.filter((version) => !version.supersededAt);
  if (active.some((version) => version.effectiveFrom <= on && (definition.type === 'one-off' ? version.effectiveFrom === on : !version.effectiveTo || on < version.effectiveTo))) return 'active';
  if (active.some((version) => version.effectiveFrom > on)) return 'scheduled';
  return 'ended';
}
