import type { DashboardRepositoryInput } from '@/src/domain/analytics';
import type { AssignmentScope, RolePreset } from '@/src/domain/permissions';
import type { ModuleEntitlementKey, SubscriptionStatus } from '@/src/domain/models';
import type { FinancialSourceEvent, TransactionDetail, TransactionExportResult, TransactionListOptions, TransactionPage } from '@/src/domain/transactions';

export interface TransactionPrincipal {
  role: RolePreset;
  assignment: AssignmentScope;
  subscriptionStatus: SubscriptionStatus;
  entitlements: ModuleEntitlementKey[];
}
export interface TransactionRepositoryInput extends DashboardRepositoryInput {
  /** Required at the repository boundary; capabilities are never inferred from UI booleans. */
  principal: TransactionPrincipal;
}
export interface TransactionQuery extends TransactionRepositoryInput, TransactionListOptions {}
export interface TransactionDetailQuery extends TransactionRepositoryInput { transactionId: string }
export interface TransactionsRepository {
  listTransactions(query: TransactionQuery, signal?: AbortSignal): Promise<TransactionPage>;
  getTransaction(query: TransactionDetailQuery, signal?: AbortSignal): Promise<TransactionDetail | null>;
  listSourceEvents(query: TransactionDetailQuery, signal?: AbortSignal): Promise<FinancialSourceEvent[]>;
  exportTransactions(query: TransactionQuery & { selectedIds?: string[] }, signal?: AbortSignal): Promise<TransactionExportResult>;
}
