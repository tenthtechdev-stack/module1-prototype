'use client';

import { useEffect, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AlertTriangle, ArrowRight, BarChart3, CheckCircle2, Send, Sparkles, X } from 'lucide-react';
import { usePathname, useSearchParams } from 'next/navigation';
import type { CopilotContext } from '@/src/domain/models';
import { formatMoney, formatDate } from '@/src/domain/calculations';
import { useAnalysisContext } from '@/src/components/providers/analysis-context-provider';
import { usePrototype } from '@/src/components/providers/prototype-provider';
import { useAccess } from '@/src/components/rbac/access';
import { Spinner } from '@/src/components/ui/feedback';
import { useCopilot } from '@/src/services/hooks/use-copilot';
import { useDashboardAnalytics } from '@/src/services/hooks/use-dashboard-analytics';
import {
  useProduct,
  useProductCosts,
  useProductListings,
  useProductProfitability,
} from '@/src/services/hooks/use-products';
import { useCogsBatch } from '@/src/services/hooks/use-cogs';
import { useTransaction } from '@/src/services/hooks/use-transactions';
import { useExpenses } from '@/src/services/hooks/use-expenses';
import { expenseCopilotSnapshot } from '@/src/services/analytics/expense-copilot';
import { useReport } from '@/src/services/hooks/use-reports';
import { reportOptionsFromSearch } from '@/src/features/reports/report-query';
import { REPORT_TITLES, type ReportKind } from '@/src/domain/reports';
import { reportCopilotSnapshot } from '@/src/services/analytics/report-copilot';
import { transactionCopilotSnapshot } from '@/src/services/mappers/transaction-copilot-snapshot';

function productIdFromPath(pathname: string) {
  const parts = pathname.split('/').filter(Boolean);
  const index = parts.indexOf('products');
  if (index < 0 || !parts[index + 1]) return '';
  try {
    return decodeURIComponent(parts[index + 1]);
  } catch {
    return parts[index + 1];
  }
}

function cogsImportIdFromPath(pathname: string) {
  const parts = pathname.split('/').filter(Boolean);
  const index = parts.indexOf('cogs');
  return index >= 0 && parts[index + 1] === 'import' ? parts[index + 2] ?? '' : '';
}

export function CopilotDrawer() {
  const access = useAccess('copilot.use');
  const profitabilityAccess = useAccess('profitability.view');
  const cogsAccess = useAccess('cogs.view');
  const sensitiveExpensesAccess = useAccess('expenses.view_sensitive');
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const phase7Section = pathname.split('/').filter(Boolean)[2];
  const isReportPage = phase7Section === 'reports';
  const isExpensePage = phase7Section === 'expenses';
  const expenseId = isExpensePage ? pathname.split('/').filter(Boolean)[3] ?? '' : '';
  const expenseDetail = useExpenses({}, expenseId, { enabled: Boolean(expenseId) && access.allowed });
  const reportAlias = pathname.split('/').filter(Boolean)[3] ?? 'p-and-l';
  const aliases: Record<string, ReportKind> = { pnl: 'p-and-l', products: 'product-profitability', marketplaces: 'marketplace-profitability' };
  const reportKind: ReportKind = isExpensePage ? 'expenses' : aliases[reportAlias] ?? (Object.hasOwn(REPORT_TITLES, reportAlias) ? reportAlias as ReportKind : 'p-and-l');
  const reportData = useReport(reportOptionsFromSearch(reportKind, searchParams), { enabled: access.allowed && (isReportPage || (isExpensePage && !expenseId)) });
  const reportSnapshot = useMemo(() => (isReportPage || (isExpensePage && !expenseId)) && reportData.access.allowed && reportData.query.data
    ? reportCopilotSnapshot(reportData.query.data, pathname + '?' + searchParams.toString()) : undefined,
    [isReportPage, isExpensePage, expenseId, reportData.access.allowed, reportData.query.data, pathname, searchParams]);
  const { scenarioId } = usePrototype();
  const { context, companyNameFor, accountNameFor } = useAnalysisContext();
  const expenseSnapshot = useMemo(() => expenseId && expenseDetail.access.allowed && expenseDetail.detailQuery.data ? expenseCopilotSnapshot(expenseDetail.detailQuery.data, context.dateRange, pathname + '?' + searchParams.toString()) : undefined, [expenseId, expenseDetail.access.allowed, expenseDetail.detailQuery.data, context.dateRange, pathname, searchParams]);
  const [draft, setDraft] = useState('');
  useEffect(() => {
    const receive = (event: Event) => setDraft((event as CustomEvent<{ prompt?: string }>).detail?.prompt ?? '');
    window.addEventListener('stock-supplies:ask-copilot', receive);
    return () => window.removeEventListener('stock-supplies:ask-copilot', receive);
  }, []);
  const transactionId = useMemo(() => {
    const parts = pathname.split('/');
    const index = parts.indexOf('transactions');
    if (index < 0 || !parts[index + 1]) return '';
    try { return decodeURIComponent(parts[index + 1]); }
    catch { return parts[index + 1]; }
  }, [pathname]);
  const transactionDetail = useTransaction(transactionId, { enabled: Boolean(transactionId) && access.allowed });
  const transactionSnapshot = useMemo(() => transactionId && transactionDetail.query.data
    ? transactionCopilotSnapshot(transactionDetail.query.data, `${pathname}?${searchParams}`, cogsAccess.allowed)
    : undefined, [transactionId, transactionDetail.query.data, pathname, searchParams, cogsAccess.allowed]);
  const dashboardAnalytics = useDashboardAnalytics({ enabled: access.allowed && !isReportPage && !isExpensePage });
  const productId = useMemo(() => productIdFromPath(pathname), [pathname]);
  const importId = useMemo(() => cogsImportIdFromPath(pathname), [pathname]);
  const cogsBatch = useCogsBatch(importId);
  const productDetail = useProduct(productId, { enabled: Boolean(productId) && access.allowed });
  const productProfitability = useProductProfitability(productId, { enabled: Boolean(productId) && access.allowed && profitabilityAccess.allowed });
  const productCosts = useProductCosts(productId, { enabled: Boolean(productId) && access.allowed && cogsAccess.allowed });
  const productListings = useProductListings(productId, { enabled: Boolean(productId) && access.allowed });
  const mostProfitableMarketplace = useMemo(() => {
    const rows = (dashboardAnalytics.query.data?.marketplaceComparison ?? [])
      .filter((row) => row.totals.knownNetProfitMinor !== null && row.totals.profitabilityCoverageBps > 0);
    return rows.reduce((best, row) => !best || (row.totals.knownNetProfitMinor ?? 0) > (best.totals.knownNetProfitMinor ?? 0) ? row : best, rows[0] ?? null);
  }, [dashboardAnalytics.query.data?.marketplaceComparison]);
  const page = expenseId ? 'expense detail' : isReportPage || isExpensePage ? 'report:' + REPORT_TITLES[reportKind] : transactionId ? 'transaction detail' : productId ? 'product detail' : importId ? 'COGS import review' : pathname.split('/').filter(Boolean).at(-1)?.replaceAll('-', ' ') ?? 'dashboard';
  const company = context.companyId === 'all' ? 'All authorised companies' : companyNameFor(context.companyId);
  const account = context.marketplaceAccountIds[0] ? accountNameFor(context.marketplaceAccountIds[0]) : 'All matching accounts';
  const productSnapshot = useMemo<CopilotContext['productSnapshot']>(() => {
    if (!profitabilityAccess.allowed) return undefined;
    const lookup = productDetail.query.data;
    if (!lookup || lookup.status !== 'found') return undefined;
    const overview = lookup.data;
    const totals = productProfitability.query.data?.totals ?? overview.selectedPeriod;
    const listingDetails = productListings.query.data?.listings ?? [];
    return {
      productId: overview.product.id,
      title: overview.product.title,
      internalSku: overview.product.internalSku,
      marketplaces: overview.marketplaces,
      listingCount: overview.listingCount,
      canViewCogs: cogsAccess.allowed,
      revenuePence: totals.revenueMinor,
      orders: totals.orders,
      units: totals.units,
      refundsPence: totals.refundsMinor,
      cogsKnownPence: totals.cogsKnownMinor,
      marketplaceFeesPence: totals.marketplaceFeesMinor,
      advertisingPence: totals.advertisingKnownMinor,
      shippingPence: totals.shippingMinor,
      otherDirectCostsPence: totals.otherDirectCostsMinor,
      allocatedExpensesPence: sensitiveExpensesAccess.allowed ? totals.allocatedExpensesMinor : null,
      sensitiveExpensesVisible: totals.allocatedExpensesMinor !== null && sensitiveExpensesAccess.allowed,
      knownNetProfitPence: totals.knownNetProfitMinor,
      marginBps: totals.knownMarginBps,
      cogsCoverageBps: totals.cogsCoverageBps,
      profitabilityCoverageBps: totals.profitabilityCoverageBps,
      profitabilityComplete: totals.profitabilityComplete,
      cogsStatus: overview.cogsStatus,
      profitabilityStatus: overview.profitabilityStatus,
      currentCogsPence: cogsAccess.allowed ? productCosts.query.data?.current?.unitCost.amountMinor ?? overview.currentCogs?.unitCost.amountMinor ?? null : null,
      costHistoryCount: cogsAccess.allowed ? productCosts.query.data?.history.length ?? 0 : 0,
      listingIssues: listingDetails.flatMap((listing) => listing.issue ? [listing.issue.replaceAll('_', ' ')] : []),
      channelPerformance: (productProfitability.query.data?.byMarketplace ?? []).map((row) => ({
        marketplace: row.marketplace,
        revenuePence: row.totals.revenueMinor,
        knownNetProfitPence: row.totals.knownNetProfitMinor,
        marginBps: row.totals.knownMarginBps,
        profitabilityCoverageBps: row.totals.profitabilityCoverageBps,
      })),
    };
  }, [cogsAccess.allowed, productCosts.query.data, productDetail.query.data, productListings.query.data, productProfitability.query.data, profitabilityAccess.allowed, sensitiveExpensesAccess.allowed]);
  const productCostSnapshot = useMemo<CopilotContext['productCostSnapshot']>(() => {
    if (profitabilityAccess.allowed || !cogsAccess.allowed) return undefined;
    const lookup = productDetail.query.data;
    if (!lookup || lookup.status !== 'found') return undefined;
    const overview = lookup.data;
    const listingDetails = productListings.query.data?.listings ?? [];
    return {
      productId: overview.product.id,
      title: overview.product.title,
      internalSku: overview.product.internalSku,
      marketplaces: overview.marketplaces,
      listingCount: overview.listingCount,
      cogsStatus: overview.cogsStatus,
      currentCogsPence: productCosts.query.data?.current?.unitCost.amountMinor ?? overview.currentCogs?.unitCost.amountMinor ?? null,
      costHistoryCount: productCosts.query.data?.history.length ?? 0,
      listingIssues: listingDetails.flatMap((listing) => listing.issue ? [listing.issue.replaceAll('_', ' ')] : []),
    };
  }, [cogsAccess.allowed, productCosts.query.data, productDetail.query.data, productListings.query.data, profitabilityAccess.allowed]);
  const contextualProduct = productSnapshot ?? productCostSnapshot;
  const cogsImportSnapshot = useMemo<CopilotContext['cogsImportSnapshot']>(() => {
    const batch = cogsBatch.query.data;
    if (!importId || !batch || !cogsAccess.allowed) return undefined;
    return {
      batchId: batch.id,
      fileName: batch.fileName,
      status: batch.status,
      rowCount: batch.rowCount,
      exactCount: batch.rows.filter((row) => row.matchType === 'exact').length,
      suggestedCount: batch.suggestedCount,
      unmatchedCount: batch.unmatchedCount,
      anomalyCount: batch.anomalyCount,
      blockingCount: batch.rows.filter((row) => row.anomalies.some((anomaly) => anomaly.blocking)).length,
      acceptedCount: batch.rows.filter((row) => row.reviewStatus === 'accepted').length,
      pendingCount: batch.rows.filter((row) => row.reviewStatus === 'pending').length,
      rejectedCount: batch.rows.filter((row) => row.reviewStatus === 'rejected').length,
      mappedColumns: batch.mapping.flatMap((mapping) => mapping.sourceColumn ? [{ ...mapping, sourceColumn: mapping.sourceColumn }] : []),
      result: batch.result ? {
        recordsCreated: batch.result.recordsCreated,
        beforeProductCoverageBps: batch.result.before.productCoverageBps,
        afterProductCoverageBps: batch.result.after.productCoverageBps,
        beforeProfitabilityCoverageBps: batch.result.before.profitabilityCoverageBps,
        afterProfitabilityCoverageBps: batch.result.after.profitabilityCoverageBps,
      } : undefined,
    };
  }, [cogsAccess.allowed, cogsBatch.query.data, importId]);
  const copilotContext = useMemo<CopilotContext>(() => ({
    module: 'marketplace-profitability',
    page,
    organisationId: context.organisationId,
    companyScope: company,
    marketplaceScope: context.marketplace,
    dateRange: context.dateRange,
    selectedRecords: expenseSnapshot ? [expenseSnapshot.id] : transactionSnapshot ? [transactionSnapshot.id] : contextualProduct ? [contextualProduct.productId] : cogsImportSnapshot ? [cogsImportSnapshot.batchId] : undefined,
    transactionSnapshot,
    reportSnapshot, expenseSnapshot,
    visibleMetrics: expenseSnapshot ? ['authorised expense amount', 'scope', 'allocation', 'effective history'] : reportSnapshot ? reportSnapshot.columns.map((column) => column.label) : transactionSnapshot ? ['transaction revenue', 'refunds', 'COGS', 'fees', 'advertising', 'shipping', 'known Net Profit', 'historical cost provenance'] : cogsImportSnapshot
      ? ['source rows', 'deterministic Product matches', 'review anomalies', 'human review status', 'approval state']
      : productSnapshot
      ? ['product revenue', 'product units', 'known product net profit', 'product margin', 'product COGS coverage', 'marketplace listings']
      : productCostSnapshot
        ? ['current product COGS', 'effective-dated cost history', 'marketplace listings']
        : profitabilityAccess.allowed
          ? ['net revenue', 'covered net profit', 'covered margin', 'profitability coverage']
          : ['authorised product and cost context'],
    productSnapshot,
    productCostSnapshot,
    cogsImportSnapshot,
    dashboardSnapshot: !isReportPage && !isExpensePage && profitabilityAccess.allowed && dashboardAnalytics.query.data ? {
      sensitiveExpensesVisible: dashboardAnalytics.query.data.current.allocatedExpensesMinor !== null,
      revenuePence: dashboardAnalytics.query.data.current.revenueMinor,
      previousRevenuePence: dashboardAnalytics.query.data.previous.revenueMinor,
      knownNetProfitPence: dashboardAnalytics.query.data.current.knownNetProfitMinor,
      previousKnownNetProfitPence: dashboardAnalytics.query.data.previous.knownNetProfitMinor,
      marginBps: dashboardAnalytics.query.data.current.knownMarginBps,
      previousMarginBps: dashboardAnalytics.query.data.previous.knownMarginBps,
      refundsPence: dashboardAnalytics.query.data.current.refundsMinor,
      previousRefundsPence: dashboardAnalytics.query.data.previous.refundsMinor,
      marketplaceFeesPence: dashboardAnalytics.query.data.current.marketplaceFeesMinor,
      previousMarketplaceFeesPence: dashboardAnalytics.query.data.previous.marketplaceFeesMinor,
      advertisingPence: dashboardAnalytics.query.data.current.advertisingKnownMinor,
      previousAdvertisingPence: dashboardAnalytics.query.data.previous.advertisingKnownMinor,
      cogsCoverageBps: dashboardAnalytics.query.data.current.cogsCoverageBps,
      profitabilityCoverageBps: dashboardAnalytics.query.data.current.profitabilityCoverageBps,
      previousProfitabilityCoverageBps: dashboardAnalytics.query.data.previous.profitabilityCoverageBps,
      coveredNetRevenuePence: dashboardAnalytics.query.data.current.covered.netRevenueMinor,
      profitComparisonAvailable: dashboardAnalytics.query.data.profitabilityComparison.available,
      missingCogsProducts: dashboardAnalytics.query.data.health.missingCogsProducts,
      affectedRevenuePence: dashboardAnalytics.query.data.health.affectedRevenueMinor,
      mostProfitableMarketplace: mostProfitableMarketplace?.label ?? null,
      mostProfitableMarketplacePence: mostProfitableMarketplace?.totals.knownNetProfitMinor ?? null,
      priorityProduct: dashboardAnalytics.query.data.needsReview[0]?.name ?? null,
      priorityProductIssue: dashboardAnalytics.query.data.needsReview[0]?.issue?.replaceAll('_', ' ') ?? null,
      profitabilityComplete: dashboardAnalytics.query.data.current.profitabilityComplete,
    } : undefined,
  }), [expenseSnapshot, reportSnapshot, isReportPage, isExpensePage, transactionSnapshot, cogsImportSnapshot, company, context, contextualProduct, dashboardAnalytics.query.data, mostProfitableMarketplace, page, productCostSnapshot, productSnapshot, profitabilityAccess.allowed]);
  const { overview, ask } = useCopilot(copilotContext, scenarioId, access.allowed);

  if (!access.allowed) return null;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.trim()) return;
    ask.mutate(draft.trim());
    setDraft('');
  }

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild><button className="copilot-button" aria-label="Ask Copilot"><Sparkles size={16} /> <span>Ask Copilot</span></button></Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="drawer-overlay copilot-overlay" />
        <Dialog.Content className="copilot-drawer" aria-describedby="copilot-description">
          <header>
            <div className="copilot-title"><span><Sparkles size={17} /></span><div><Dialog.Title>Stock Supplies Copilot</Dialog.Title><Dialog.Description id="copilot-description">Mock, permission-aware analytics assistant</Dialog.Description></div></div>
            <Dialog.Close asChild><button className="icon-button" aria-label="Close Copilot"><X size={18} /></button></Dialog.Close>
          </header>
          <div className="copilot-context">
            <p>Using current authorised context</p>
            <div><span>{reportSnapshot?.title ?? copilotContext.page.replace('report:', '')}</span>{transactionSnapshot ? <span>{transactionSnapshot.internalSku}</span> : null}{contextualProduct ? <span>{contextualProduct.internalSku}</span> : null}{cogsImportSnapshot ? <span>{cogsImportSnapshot.fileName}</span> : null}<span>{copilotContext.companyScope}</span><span>{isReportPage || isExpensePage ? ({ amazon: 'Amazon', ebay: 'eBay', temu: 'Temu', all: 'All marketplaces' } as Record<string, string>)[copilotContext.marketplaceScope ?? 'all'] ?? copilotContext.marketplaceScope : copilotContext.marketplaceScope}</span><span>{account}</span><span>{isReportPage || isExpensePage ? formatDate(context.dateRange.from) : context.dateRange.from} – {isReportPage || isExpensePage ? formatDate(context.dateRange.to) : context.dateRange.to}</span></div>
          </div>
          <div className="copilot-body">
            <div className="copilot-intro"><span><Sparkles size={18} /></span><div><strong>Suggested questions</strong><p>Choose a prompt or ask about this page.</p></div></div>
            {overview.isPending ? <div className="copilot-loading"><Spinner label="Loading contextual suggestions" /></div> : overview.isError ? <div className="copilot-answer" role="alert">Contextual suggestions are temporarily unavailable.</div> : <>
              <div className="copilot-prompts">{overview.data.prompts.map((prompt) => <button key={prompt} type="button" onClick={() => setDraft(prompt)}>{prompt}</button>)}</div>
              <div className="copilot-insight-summary"><small>Current explanation</small><strong>{overview.data.summary}</strong><ol>{overview.data.findings.map((finding) => <li key={finding.id} className={finding.tone}><span>{finding.title}</span><p>{finding.detail}</p></li>)}</ol><p className="copilot-completeness">{overview.data.dataCompleteness}</p><div className="copilot-references">{overview.data.references.map((reference) => <a key={reference.label} href={reference.href}>{reference.label}</a>)}</div></div>
              <div className="copilot-block finding"><span><BarChart3 size={16} /></span><div><small>{expenseSnapshot ? 'Referenced expense' : reportSnapshot ? 'Referenced report' : transactionSnapshot ? 'Referenced transaction' : cogsImportSnapshot ? 'Referenced import batch' : contextualProduct ? 'Referenced product context' : 'Referenced metric'}</small><strong>{overview.data.finding.title}</strong><p>{expenseSnapshot ? 'This explanation uses the authorised selected Expense Detail, its allocation and effective history.' : reportSnapshot ? 'This explanation uses the same authorised repository result, exact period, filters and grouping as the report.' : transactionSnapshot ? 'This explanation uses the same repository values and historical provenance as the transaction detail.' : cogsImportSnapshot ? 'This explanation uses persisted source-derived matches and review states. No costs are changed by Copilot.' : productSnapshot ? `${formatMoney(overview.data.finding.affectedRevenuePence)} of this product's selected revenue is affected by incomplete profitability.` : productCostSnapshot ? 'This explanation uses only authorised product identity, listing and effective-dated COGS context.' : `Missing COGS affects ${formatMoney(overview.data.finding.affectedRevenuePence)} of net revenue in this scope.`}</p></div></div>
              {overview.data.anomaly ? <div className="copilot-block anomaly"><span><AlertTriangle size={16} /></span><div><small>Current scenario</small><strong>{overview.data.anomaly.title}</strong><p>{overview.data.anomaly.detail}</p></div></div> : null}
              {overview.data.approval ? <div className="copilot-block approval"><span><CheckCircle2 size={16} /></span><div><small>Approval request</small><strong>{overview.data.approval.title}</strong><p>{overview.data.approval.detail}</p><button className="secondary-button">Review suggestion <ArrowRight size={14} /></button></div></div> : null}
            </>}
            {ask.data ? <div className="copilot-answer" role="status">{ask.data}</div> : null}
            {ask.isError ? <div className="copilot-answer" role="alert">The explanation could not be loaded. Try sending your question again.</div> : null}
          </div>
          <form className="copilot-composer" onSubmit={submit}>
            <label><span className="sr-only">Ask Copilot</span><textarea rows={2} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Ask about this page…" /></label>
            <button type="submit" className="primary-button" aria-label="Send message" disabled={ask.isPending}>{ask.isPending ? <Spinner label="Generating response" /> : <Send size={15} />}</button>
            <small>{isReportPage || isExpensePage ? 'Copilot explains authorised report values. Financial changes require the Expenses form and explicit confirmation.' : transactionId ? 'Copilot explains this transaction. It cannot change sales, costs, fees or refunds.' : 'Copilot can explain and suggest. Financial changes always require approval.'}</small>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
