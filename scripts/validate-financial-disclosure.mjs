import assert from 'node:assert/strict';
import { load, cleanup } from './lib/validation-runtime.mjs';

const privateKeys = new Set(['allocatedExpensesMinor','allocatedExpensesPence','netProfitMinor','knownNetProfitMinor','netProfitPence','knownNetProfitPence','knownMarginBps','marginBps','previousKnownNetProfitMinor','previousKnownNetProfitPence','previousMarginBps','priorProfitPence']);
let fields = 0;
function inspect(value, path = 'result') {
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    if (privateKeys.has(key)) { assert.equal(item, null, path + '.' + key + ' is withheld'); fields++; }
    if (['netProfit','margin','allocatedExpenses'].includes(value.key)) for (const amount of ['amountMinor','previousMinor','deltaBps','currentMinor','currentBps']) if (amount in value) assert.equal(value[amount], null, path + '.' + amount);
    inspect(item, path + '.' + key);
  }
}
try {
  const data = await load('src/fixtures/data.ts');
  const { ROLE_PRESETS, PREVIEW_ASSIGNMENTS } = await load('src/domain/permissions.ts');
  const { MockDashboardAnalyticsRepository } = await load('src/services/mock/dashboard-analytics-repository.ts');
  const { MockProductRepository } = await load('src/services/mock/product-repository.ts');
  const { MockTransactionsRepository } = await load('src/services/mock/transactions-repository.ts');
  const { MockProductGroupsRepository } = await load('src/services/mock/product-groups-repository.ts');
  const { authoriseTransactionInput } = await load('src/services/mock/transactions-repository.ts');
  const { transactionCopilotSnapshot } = await load('src/services/mappers/transaction-copilot-snapshot.ts');
  const { explainTransaction } = await load('src/services/analytics/transaction-copilot.ts');
  const base = { context: { organisationId: data.organisation.id, companyId: 'all', marketplace: 'all', marketplaceAccountIds: [], dateRange: { from: '2026-08-01', to: '2026-08-07' } }, organisation: data.organisation, companies: data.companies, marketplaceAccounts: data.marketplaceAccounts, scenarioId: 'healthy', authorisedCompanyIds: data.companies.map(c=>c.id), authorisedAccountIds: data.marketplaceAccounts.map(a=>a.id), reportingCurrency: 'GBP', canViewSensitiveExpenses: true, cogsReadiness: null };
  const dashboard = new MockDashboardAnalyticsRepository(), products = new MockProductRepository(), transactions = new MockTransactionsRepository(), groups = new MockProductGroupsRepository();
  for (const roleId of ['auditor','company-manager','marketplace-manager']) {
    const principal = { role: ROLE_PRESETS.find(r=>r.id===roleId), assignment: PREVIEW_ASSIGNMENTS[roleId], subscriptionStatus: 'active', entitlements: ['marketplace-profitability'] };
    const input = authoriseTransactionInput({ ...base, principal });
    const productInput = { ...input, search: "", cogsStatus: "all", listingStatus: "all", profitabilityStatus: "all", categories: [], sorting: [], limit: 10 };
    const d = await dashboard.getDashboard(input); inspect(d);
    assert.equal(d.profitabilityComparison.available, false);
    assert.equal(d.profitabilityComparison.reason, 'restricted_expenses');
    const p = await products.list({ ...productInput, page: 0, pageSize: 10 }); inspect(p);
    const t = await transactions.listTransactions({ ...input, page: 0, pageSize: 10 }); inspect(t);
    assert(t.items.length > 0);
    const detail = await transactions.getTransaction({ ...input, transactionId: t.items[0].id }); inspect(detail);
    const snap = transactionCopilotSnapshot(detail, '/transactions/' + detail.transaction.id, true); inspect(snap);
    assert.match(explainTransaction('Explain this transaction', snap), /restrict|withheld/i);
    const productId = t.items[0].productId;
    inspect(await products.getById({ ...input, productId })); inspect(await products.getProfitability({ ...input, productId }));
    inspect(await products.getTrend({ ...input, productId })); inspect(await products.getTransactions({ ...productInput, productId }));
    inspect(await products.exportRows({ ...productInput, page: 0, pageSize: 10 }));
    const g = await groups.list({ ...input, organisationId: input.organisation.id, page: 0, pageSize: 25 }); inspect(g);
    if (g.rows.length) inspect(await groups.getById({ ...input, groupId: g.rows[0].id }));
    const exported = await transactions.exportTransactions({ ...input, pageSize: 10 });
    const csv = exported.csv.split('\r\n').map(line=>line.match(/"(?:[^"]|"")*"/g)?.map(cell=>cell.slice(1,-1).replaceAll('""','"')) ?? []);
    for (const key of ['knownNetProfitMinor','knownMarginBps','allocatedExpensesMinor']) { const index=csv[0].indexOf(key); if(index>=0) assert(csv.slice(1).every(row=>row[index]===''), roleId + ' export withholds ' + key); }
  }
  const scenario = await dashboard.getDashboard({ ...base, scenarioId: 'sensitive-expenses-restricted' }); inspect(scenario);
  const permitted = await dashboard.getDashboard(base); assert.notEqual(permitted.current.knownNetProfitMinor, null); assert.notEqual(permitted.current.allocatedExpensesMinor, null);
  assert(fields > 100); console.log(`PASS: ${fields} restricted financial fields across Dashboard, Products, Groups, Transactions, exports, Copilot and scenario; authorised values remain available.`);
} finally { cleanup(); }
