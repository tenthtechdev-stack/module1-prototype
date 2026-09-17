import { financialDisclosureAllowed, redactFinancialDisclosure } from '@/src/services/mappers/financial-disclosure';
import { generateAnalyticsDataset, stableHash } from '@/src/fixtures/analytics-data';
import { getScenarioRuntime } from '@/src/fixtures/scenarios';
import { evaluateAccess, type Capability } from '@/src/domain/permissions';
import { isIsoCogsDate } from '@/src/domain/cogs';
import type { ProfitabilityTransaction, TransactionExportResult } from '@/src/domain/transactions';
import type { TransactionDetailQuery, TransactionQuery, TransactionRepositoryInput, TransactionsRepository } from '@/src/services/transactions-contracts';
import { aggregateTransactionDetail, aggregateTransactionPage, createTransactionAnalyticsSnapshot, filterTransactionSnapshot } from '@/src/services/analytics/transaction-aggregation';
import { materializeApprovedCogsDataset } from '@/src/services/mock/cogs-dataset';

export class TransactionRepositoryError extends Error {
  constructor(public readonly code: 'access_denied' | 'invalid_query' | 'repository_unavailable') {
    super(code === 'repository_unavailable' ? 'Transactions could not be loaded. Please retry.' : code === 'invalid_query' ? 'The transaction query is invalid.' : 'Transaction access is unavailable.');
    this.name = 'TransactionRepositoryError';
  }
}

function permitted(input: TransactionRepositoryInput, capability: Capability, companyId?: string, accountId?: string) {
  if (!input.principal) return false;
  return evaluateAccess({ ...input.principal, entitlements: new Set(input.principal.entitlements), capability, companyId, accountId }).allowed;
}

/** Repository authorization always intersects supplied IDs with the principal. */
export function authoriseTransactionInput<T extends TransactionRepositoryInput>(input: T): T {
  if (!permitted(input, 'transactions.view') || !permitted(input, 'profitability.view')) throw new TransactionRepositoryError('access_denied');
  if (input.context.organisationId !== input.organisation.id) throw new TransactionRepositoryError('access_denied');
  const { from, to } = input.context.dateRange;
  if (!isIsoCogsDate(from) || !isIsoCogsDate(to) || from > to) throw new TransactionRepositoryError('invalid_query');
  const companies = input.companies.filter((company) => company.organisationId === input.organisation.id);
  const companyIds = new Set(companies.map((company) => company.id));
  const accounts = input.marketplaceAccounts.filter((account) => companyIds.has(account.companyId));
  const authorisedCompanyIds = input.authorisedCompanyIds.filter((id) => companyIds.has(id) && permitted(input, 'transactions.view', id));
  const authorisedAccountIds = input.authorisedAccountIds.filter((id) => {
    const account = accounts.find((candidate) => candidate.id === id);
    return Boolean(account && authorisedCompanyIds.includes(account.companyId) && permitted(input, 'transactions.view', account.companyId, account.id));
  });
  const runtime = getScenarioRuntime(input.scenarioId);
  return {
    ...input, companies, marketplaceAccounts: accounts, authorisedCompanyIds,
    authorisedAccountIds: runtime.accountMode === 'none' ? [] : authorisedAccountIds,
    canViewSensitiveExpenses: permitted(input, 'expenses.view_sensitive') && input.scenarioId !== 'sensitive-expenses-restricted',
  };
}

function delay(key: string, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('Request aborted', 'AbortError')); return; }
    const onAbort = () => { clearTimeout(timer); reject(new DOMException('Request aborted', 'AbortError')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, 140 + stableHash(key) % 100);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? '' : String(value);
  // Prefix source text that spreadsheet applications could execute as a formula.
  const safe = typeof value === 'string' && /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export class MockTransactionsRepository implements TransactionsRepository {
  private readonly datasets = new Map<string, ReturnType<typeof generateAnalyticsDataset>>();

  private dataset(input: TransactionRepositoryInput) {
    const key = JSON.stringify({ organisation: input.organisation.id, companies: input.companies.map((company) => company.id), accounts: input.marketplaceAccounts.map((account) => [account.id, account.companyId, account.marketplace, account.status]) });
    let dataset = this.datasets.get(key);
    if (!dataset) {
      dataset = generateAnalyticsDataset({ organisation: input.organisation, companies: input.companies, marketplaceAccounts: input.marketplaceAccounts });
      this.datasets.set(key, dataset);
    }
    return materializeApprovedCogsDataset(dataset, input.organisation.id);
  }

  private async ready(input: TransactionRepositoryInput, signal?: AbortSignal) {
    await delay(`transactions:${input.organisation.id}:${input.scenarioId}`, signal);
    if (getScenarioRuntime(input.scenarioId).resultMode === 'error') throw new TransactionRepositoryError('repository_unavailable');
  }

  async listTransactions(input: TransactionQuery, signal?: AbortSignal) {
    const query = authoriseTransactionInput(input);
    await this.ready(query, signal);
    return redactFinancialDisclosure(aggregateTransactionPage(this.dataset(query), query), financialDisclosureAllowed(query));
  }

  async getTransaction(input: TransactionDetailQuery, signal?: AbortSignal) {
    let query: TransactionDetailQuery;
    try { query = authoriseTransactionInput(input); }
    catch (error) { if (error instanceof TransactionRepositoryError && error.code === 'access_denied') return null; throw error; }
    await this.ready(query, signal);
    const detail = aggregateTransactionDetail(this.dataset(query), query);
    if (detail && !permitted(query, 'cogs.view')) {
      detail.costProvenance = { ...detail.costProvenance, record: null, note: 'The transaction COGS deduction is included in profitability. Your role does not include access to the underlying Product cost record.' };
    }
    return redactFinancialDisclosure(detail, financialDisclosureAllowed(query));
  }

  async listSourceEvents(input: TransactionDetailQuery, signal?: AbortSignal) {
    return (await this.getTransaction(input, signal))?.sourceEvents ?? [];
  }

  async exportTransactions(input: TransactionQuery & { selectedIds?: string[] }, signal?: AbortSignal): Promise<TransactionExportResult> {
    const query = authoriseTransactionInput(input);
    await this.ready(query, signal);
    const snapshot = createTransactionAnalyticsSnapshot(this.dataset(query), query);
    const selected = query.selectedIds ? new Set(query.selectedIds) : null;
    const rows = redactFinancialDisclosure(filterTransactionSnapshot(snapshot, query).filter((row) => !selected || selected.has(row.id)), financialDisclosureAllowed(query));
    const fields: Array<keyof ProfitabilityTransaction> = ['id', 'transactionDate', 'companyName', 'marketplace', 'marketplaceAccountName', 'marketplaceOrderId', 'marketplaceOrderLineId', 'title', 'internalSku', 'marketplaceSku', 'listingIdentifier', 'quantity', 'reportingCurrency', 'revenueMinor', 'refundsMinor', 'netRevenueMinor'];
    if (permitted(query, 'cogs.view')) fields.push('cogsMinor', 'unitCogsMinor', 'cogsSourceLabel', 'productGroupName');
    fields.push('marketplaceFeesMinor', 'advertisingMinor', 'shippingMinor', 'otherDirectCostsMinor');
    if (query.canViewSensitiveExpenses) fields.push('allocatedExpensesMinor');
    fields.push('knownNetProfitMinor', 'knownMarginBps', 'profitabilityCoverageBps', 'completenessState', 'profitabilityStatus', 'refundState', 'sourceEventCount');
    return {
      fileName: `transactions-${query.organisation.slug}-${query.context.dateRange.from}-${query.context.dateRange.to}.csv`,
      csv: [fields.map(csvCell).join(','), ...rows.map((row) => fields.map((field) => csvCell(row[field])).join(','))].join('\r\n'),
      recordCount: rows.length, fields,
    };
  }
}
