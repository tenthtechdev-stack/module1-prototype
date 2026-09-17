import type { ExpenseDefinition, ExpenseDetail, ExpenseDraft, ExpenseFilters, ExpenseRepositoryInput, ExpenseWorkspace } from '@/src/domain/expenses';
export interface ExpensesRepository {
  list(input: ExpenseRepositoryInput, filters?: ExpenseFilters, signal?: AbortSignal): Promise<ExpenseWorkspace>;
  getDetail(input: ExpenseRepositoryInput, expenseId: string, signal?: AbortSignal): Promise<ExpenseDetail | null>;
  create(input: ExpenseRepositoryInput, draft: ExpenseDraft): Promise<ExpenseDefinition>;
  update(input: ExpenseRepositoryInput, expenseId: string, draft: ExpenseDraft): Promise<ExpenseDefinition>;
  end(input: ExpenseRepositoryInput, expenseId: string, values: { endDate: string; reason: string; confirmed: boolean; backdatedConfirmed: boolean }): Promise<ExpenseDefinition>;
}
