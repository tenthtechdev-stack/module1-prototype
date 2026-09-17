import { explainExpense, expenseCopilotOverview } from '@/src/services/analytics/expense-copilot';
import { explainReport, reportCopilotOverview } from '@/src/services/analytics/report-copilot';
import type { CopilotContext } from '@/src/domain/models';
import { formatMoney, formatPercentage, normaliseDisplayBps } from '@/src/domain/calculations';
import { percentageDeltaBps } from '@/src/domain/financial-calculations';
import { getScenarioRuntime, type ScenarioId } from '@/src/fixtures/scenarios';
import type { CopilotPanelData, CopilotRepository } from '@/src/services/contracts';
import { explainTransaction, transactionCopilotOverview, TRANSACTION_PROMPTS } from '@/src/services/analytics/transaction-copilot';

const prompts = [
  'Why did profit change this period?',
  'What changed vs the previous period?',
  'Which marketplace is most profitable?',
  'Which products need attention?',
  'Explain my marketplace fees.',
  'How much is missing COGS affecting this view?',
];

const productPrompts = [
  "Why is this product's margin low?",
  'Compare marketplaces for this product.',
  'How has COGS changed?',
  'Explain this product’s marketplace fees.',
  'Is this product’s profitability complete?',
  'Which listing needs attention?',
];

const productCostPrompts = [
  'What is the current COGS for this product?',
  'How many effective-dated cost records are available?',
  'Is this product’s COGS complete?',
  'Which listing needs attention?',
];

const cogsImportPrompts = [
  'How were these columns detected?',
  'Why is this row unmatched?',
  'Explain the suggested matches.',
  'Which rows have suspicious costs?',
  'Summarise this import before approval.',
];

function marketplaceLabel(value: string) {
  return value === 'ebay' ? 'eBay' : value[0]?.toUpperCase() + value.slice(1);
}

function delay(duration: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, duration);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Request aborted', 'AbortError'));
    }, { once: true });
  });
}

export class MockCopilotRepository implements CopilotRepository {
  async overview(context: CopilotContext, scenarioId: ScenarioId, signal?: AbortSignal): Promise<CopilotPanelData> {
    await delay(420, signal);
    const runtime = getScenarioRuntime(scenarioId);
    if (context.expenseSnapshot) return expenseCopilotOverview(context.expenseSnapshot);
    if (context.page === 'expense detail') return { prompts: [], summary: 'Expense not found or outside your authorised scope.', findings: [], references: [], dataCompleteness: 'No authorised expense values are available.', finding: { title: 'Expense unavailable', affectedRevenuePence: 0 }, anomaly: null, approval: null };
    if (context.reportSnapshot) return reportCopilotOverview(context.reportSnapshot);
    if (context.page.startsWith('report:')) return { prompts: [], summary: 'Report scope unavailable or still loading.', findings: [], references: [], dataCompleteness: 'No authorised report values are available.', finding: { title: 'Report scope unavailable', affectedRevenuePence: 0 }, anomaly: null, approval: null };
    if (context.transactionSnapshot) return transactionCopilotOverview(context.transactionSnapshot);
    if (context.page === 'transaction detail') return {
      prompts: TRANSACTION_PROMPTS,
      summary: 'Transaction data is unavailable or outside your assigned scope.',
      findings: [], references: [], dataCompleteness: 'Select an authorised transaction before asking for a financial explanation.',
      finding: { title: 'No authorised transaction loaded', affectedRevenuePence: 0 }, anomaly: null, approval: null,
    };
    const product = context.productSnapshot;
    const costProduct = context.productCostSnapshot;
    const cogsImport = context.cogsImportSnapshot;
    if (cogsImport) {
      const applied = cogsImport.status === 'applied' && cogsImport.result;
      const reviewSummary = `${cogsImport.exactCount.toLocaleString('en-GB')} exact, ${cogsImport.suggestedCount.toLocaleString('en-GB')} suggested and ${cogsImport.unmatchedCount.toLocaleString('en-GB')} unmatched Product matches`;
      return {
        prompts: cogsImportPrompts,
        summary: applied
          ? `${cogsImport.result!.recordsCreated.toLocaleString('en-GB')} approved COGS records were applied from ${cogsImport.fileName}. Product coverage increased from ${formatPercentage(cogsImport.result!.beforeProductCoverageBps)} to ${formatPercentage(cogsImport.result!.afterProductCoverageBps)}.`
          : `${cogsImport.fileName} contains ${cogsImport.rowCount.toLocaleString('en-GB')} rows: ${reviewSummary}. ${cogsImport.anomalyCount.toLocaleString('en-GB')} rows may need review. No costs have been applied by Copilot.`,
        findings: [
          {
            id: 'cogs-import-matches',
            title: reviewSummary,
            detail: 'Exact matches use deterministic identifiers. Suggested title matches and unmatched rows require a human decision.',
            tone: cogsImport.unmatchedCount || cogsImport.suggestedCount ? 'warning' : 'positive',
          },
          {
            id: 'cogs-import-review',
            title: `${cogsImport.acceptedCount.toLocaleString('en-GB')} accepted · ${cogsImport.pendingCount.toLocaleString('en-GB')} pending · ${cogsImport.rejectedCount.toLocaleString('en-GB')} rejected`,
            detail: `${cogsImport.blockingCount.toLocaleString('en-GB')} rows contain blocking validation errors. Human approval is separate from row review.`,
            tone: cogsImport.pendingCount || cogsImport.blockingCount ? 'warning' : 'positive',
          },
          ...(applied ? [{
            id: 'cogs-import-coverage',
            title: `Profitability coverage ${formatPercentage(cogsImport.result!.beforeProfitabilityCoverageBps)} → ${formatPercentage(cogsImport.result!.afterProfitabilityCoverageBps)}`,
            detail: 'The approved effective-dated records now feed Product and Dashboard calculations.',
            tone: 'positive' as const,
          }] : []),
        ],
        references: [
          { label: 'Import review', href: '#cogs-import-review' },
          { label: 'Human approval', href: '#cogs-import-review' },
          ...(applied ? [{ label: 'Apply results', href: '#cogs-import-review' }] : []),
        ],
        dataCompleteness: 'The summary is derived from the persisted import batch and its mapped source values. Copilot does not invent missing costs, choose ambiguous Products, accept anomalies or approve financial changes.',
        finding: {
          title: applied ? `${cogsImport.result!.recordsCreated} approved COGS records applied` : `${cogsImport.anomalyCount} rows may need human review`,
          affectedRevenuePence: 0,
        },
        anomaly: cogsImport.blockingCount || cogsImport.anomalyCount ? {
          title: `${cogsImport.blockingCount} blocking rows · ${cogsImport.anomalyCount} rows with findings`,
          detail: 'Open the review table for source values, deterministic evidence and row-level validation details.',
        } : null,
        approval: !applied && (cogsImport.status === 'ready-for-approval' || cogsImport.status === 'awaiting-approval') ? {
          title: cogsImport.status === 'awaiting-approval' ? 'Import awaiting authorised approval' : 'Proposed COGS changes ready for approval',
          detail: 'Nothing changes until an authorised person explicitly approves and applies the batch.',
        } : null,
      };
    }
    if (costProduct) {
      const currentCost = costProduct.currentCogsPence === null ? 'Current COGS is missing.' : `Current COGS is ${formatMoney(costProduct.currentCogsPence)}.`;
      return {
        prompts: productCostPrompts,
        summary: `${currentCost} ${costProduct.costHistoryCount.toLocaleString('en-GB')} effective-dated cost record${costProduct.costHistoryCount === 1 ? ' is' : 's are'} available for ${costProduct.title}.`,
        findings: [
          {
            id: 'product-cogs-status',
            title: `COGS status: ${costProduct.cogsStatus.replaceAll('_', ' ')}`,
            detail: costProduct.currentCogsPence === null ? 'Add an effective-dated unit cost before cost-covered analysis can be completed.' : 'Historical calculations use the cost effective on each transaction date.',
            tone: costProduct.cogsStatus === 'complete' ? 'positive' : 'warning',
          },
          {
            id: 'product-listings',
            title: `${costProduct.listingCount} authorised listing${costProduct.listingCount === 1 ? '' : 's'}`,
            detail: costProduct.listingIssues.length ? [...new Set(costProduct.listingIssues)].join(', ') : 'No listing issue is present in the authorised product context.',
            tone: costProduct.listingIssues.length ? 'warning' : 'neutral',
          },
        ],
        references: [
          { label: 'Cost history', href: '?tab=costs' },
          { label: 'Marketplace listings', href: '?tab=marketplace' },
        ],
        dataCompleteness: `This response intentionally excludes revenue, margin, profit and transaction values because the active role does not have profitability access.`,
        finding: {
          title: `${costProduct.title} cost context is permission-filtered`,
          affectedRevenuePence: 0,
        },
        anomaly: costProduct.listingIssues.length ? {
          title: `${costProduct.listingIssues.length} listing issue${costProduct.listingIssues.length === 1 ? '' : 's'}`,
          detail: [...new Set(costProduct.listingIssues)].join(', '),
        } : runtime.freshness.state === 'fresh' ? null : {
          title: runtime.freshness.label,
          detail: runtime.freshness.detail,
        },
        approval: runtime.copilotMode === 'awaiting_approval' ? {
          title: 'COGS suggestion awaiting review',
          detail: 'Suggestions never update this product until an authorised person approves a separate mutation.',
        } : null,
      };
    }
    if (product) {
      const incomplete = !product.profitabilityComplete;
      const bestChannel = product.channelPerformance
        .filter((channel) => channel.knownNetProfitPence !== null)
        .sort((a, b) => (b.knownNetProfitPence ?? Number.NEGATIVE_INFINITY) - (a.knownNetProfitPence ?? Number.NEGATIVE_INFINITY))[0];
      const summary = product.sensitiveExpensesVisible === false
        ? 'Expense totals, Net Profit and Margin are restricted for this scope to protect sensitive expenses.'
        : product.knownNetProfitPence === null
        ? `${product.title} has ${formatMoney(product.revenuePence)} of revenue, but product profitability is incomplete because no fully covered sales are available in this scope.`
        : `${incomplete ? 'Known net profit' : 'Net profit'} for ${product.title} is ${formatMoney(product.knownNetProfitPence)} at ${formatPercentage(product.marginBps)} margin${incomplete ? `, based on ${formatPercentage(product.profitabilityCoverageBps)} covered net revenue` : ''}.`;
      return {
        prompts: product.canViewCogs ? productPrompts : productPrompts.filter((prompt) => !prompt.toLowerCase().includes('cogs')),
        summary,
        findings: [
          {
            id: 'product-period-performance',
            title: `${formatMoney(product.revenuePence)} revenue from ${product.units.toLocaleString('en-GB')} units`,
            detail: `${product.orders.toLocaleString('en-GB')} orders in the selected company, marketplace, account and date scope.`,
            tone: 'neutral',
          },
          {
            id: 'product-profitability',
            title: product.profitabilityStatus.replaceAll('_', ' '),
            detail: product.sensitiveExpensesVisible === false ? 'Expense totals, Net Profit and Margin are restricted; cost coverage remains available.' : incomplete
              ? `Profitability is incomplete at ${formatPercentage(product.profitabilityCoverageBps)} coverage; apparent margin changes may be caused by missing cost data.`
              : `${formatMoney(product.knownNetProfitPence)} net profit at ${formatPercentage(product.marginBps)} margin.`,
            tone: product.profitabilityStatus === 'loss_making' ? 'negative' : product.profitabilityStatus === 'low_margin' || incomplete ? 'warning' : 'positive',
          },
          {
            id: 'product-channel',
            title: bestChannel ? `${marketplaceLabel(bestChannel.marketplace)} contributes the most covered profit` : 'No covered channel comparison is available',
            detail: bestChannel ? `${formatMoney(bestChannel.knownNetProfitPence)} known net profit at ${formatPercentage(bestChannel.marginBps)} margin.` : 'Open Marketplace to review linked listings and data health.',
            tone: 'neutral',
          },
        ],
        references: [
          { label: 'Product profitability', href: '?tab=profitability' },
          { label: 'Cost history', href: '?tab=costs' },
          { label: 'Marketplace listings', href: '?tab=marketplace' },
          { label: 'Recent transactions', href: '?tab=transactions' },
        ],
        dataCompleteness: incomplete
          ? `Product profitability is incomplete. ${formatPercentage(product.profitabilityCoverageBps)} of selected net revenue is fully cost-covered; missing cost is not treated as zero.`
          : 'Product cost and advertising coverage are complete for the selected analytical scope.',
        finding: {
          title: incomplete ? `${product.title} has incomplete profitability` : `${product.title} is cost complete`,
          affectedRevenuePence: incomplete ? product.revenuePence : 0,
        },
        anomaly: product.listingIssues.length ? {
          title: `${product.listingIssues.length} listing issue${product.listingIssues.length === 1 ? '' : 's'}`,
          detail: [...new Set(product.listingIssues)].join(', '),
        } : runtime.freshness.state === 'fresh' ? null : {
          title: runtime.freshness.label,
          detail: runtime.freshness.detail,
        },
        approval: runtime.copilotMode === 'awaiting_approval' ? {
          title: 'COGS suggestion awaiting review',
          detail: 'Suggestions never update this product until an authorised person approves a separate mutation.',
        } : null,
      };
    }
    const snapshot = context.dashboardSnapshot;
    const missingProducts = snapshot?.missingCogsProducts ?? (runtime.cogsMode === 'none' ? 100 : runtime.cogsMode === 'partial' ? 31 : 0);
    const revenueDelta = normaliseDisplayBps(snapshot ? percentageDeltaBps(snapshot.revenuePence, snapshot.previousRevenuePence) : null);
    const profitDelta = normaliseDisplayBps(snapshot?.profitComparisonAvailable
      ? percentageDeltaBps(snapshot.knownNetProfitPence, snapshot.previousKnownNetProfitPence)
      : null);
    const profitSummary = !snapshot
      ? 'Select a Dashboard context to receive a traceable profitability explanation.'
      : snapshot.sensitiveExpensesVisible === false
        ? 'Expense totals, Net Profit and Margin are restricted to protect sensitive expenses.'
        : snapshot.knownNetProfitPence === null || snapshot.profitabilityCoverageBps === 0
        ? 'Covered net profit is unavailable because none of the selected sales has complete cost data.'
        : `${snapshot.profitabilityComplete ? 'Net profit' : 'Known net profit'} is ${formatMoney(snapshot.knownNetProfitPence)}${snapshot.profitabilityComplete ? '' : `, based on ${formatPercentage(snapshot.profitabilityCoverageBps)} cost-covered sales`}.${!snapshot.profitComparisonAvailable
          ? ' The previous-period profit comparison is unavailable because cost coverage is not equivalent.'
          : profitDelta === null
            ? ''
            : profitDelta === 0
              ? ' It is unchanged versus the previous equivalent period.'
              : ` It is ${profitDelta > 0 ? 'up' : 'down'} ${formatPercentage(Math.abs(profitDelta))} versus the previous equivalent period.`}`;
    const references = [
      { label: 'Marketplace performance', href: '#comparison-title' },
      { label: 'Profit breakdown', href: '#breakdown-title' },
      ...(missingProducts ? [{ label: 'Missing COGS', href: '#attention-title' }] : []),
    ];
    return {
      prompts,
      summary: profitSummary,
      findings: snapshot ? [
        {
          id: 'revenue-change',
          title: `Revenue ${revenueDelta === null ? 'has no prior comparison' : revenueDelta === 0 ? 'was unchanged' : `${revenueDelta > 0 ? 'increased' : 'decreased'} ${formatPercentage(Math.abs(revenueDelta))}`}`,
          detail: `${formatMoney(snapshot.revenuePence)} in the selected period compared with ${formatMoney(snapshot.previousRevenuePence)} previously.`,
          tone: revenueDelta === null || revenueDelta === 0 ? 'neutral' : revenueDelta > 0 ? 'positive' : 'negative',
        },
        {
          id: 'marketplace-contributor',
          title: snapshot.mostProfitableMarketplace ? `${snapshot.mostProfitableMarketplace} contributed the most covered profit` : 'No covered marketplace contribution is available',
          detail: snapshot.mostProfitableMarketplacePence === null ? 'No cost-complete marketplace activity matched this context.' : `${formatMoney(snapshot.mostProfitableMarketplacePence)} of covered net profit.`,
          tone: 'neutral',
        },
        ...(snapshot.priorityProduct ? [{
          id: 'priority-product',
          title: snapshot.priorityProduct,
          detail: snapshot.priorityProductIssue ?? 'This product needs review.',
          tone: 'warning' as const,
        }] : []),
      ] : [],
      references,
      dataCompleteness: snapshot?.profitabilityComplete
        ? 'COGS and marketplace cost coverage are complete for this view.'
        : `${formatPercentage(snapshot?.profitabilityCoverageBps ?? 0)} of selected net revenue is cost-covered (${formatPercentage(snapshot?.cogsCoverageBps ?? 0)} COGS coverage). ${missingProducts.toLocaleString('en-GB')} products remain incomplete, affecting ${formatMoney(snapshot?.affectedRevenuePence ?? 0)} of revenue.`,
      finding: {
        title: `${missingProducts} products have incomplete profitability`,
        affectedRevenuePence: snapshot?.affectedRevenuePence ?? (runtime.cogsMode === 'none' ? 18_420_942 : runtime.cogsMode === 'partial' ? 5_438_016 : 0),
      },
      anomaly: runtime.freshness.state === 'fresh' ? null : {
        title: runtime.freshness.label,
        detail: runtime.freshness.detail,
      },
      approval: runtime.copilotMode === 'awaiting_approval' ? {
        title: 'COGS suggestion awaiting review',
        detail: 'Suggestions never update financial data until an authorised person approves a separate mutation.',
      } : null,
    };
  }

  async ask(question: string, context: CopilotContext): Promise<string> {
    await delay(620);
    if (context.expenseSnapshot) return explainExpense(question, context.expenseSnapshot);
    if (context.page === 'expense detail') return 'Expense not found or outside your authorised scope. No financial explanation is available.';
    if (context.reportSnapshot) return explainReport(question, context.reportSnapshot);
    if (context.page.startsWith('report:')) return 'No authorised report result is available. Load the report before asking for an explanation.';
    if (context.transactionSnapshot) return explainTransaction(question, context.transactionSnapshot);
    if (context.page === 'transaction detail') return 'This transaction does not exist or falls outside your assigned scope. No transaction values are available to explain.';
    const scope = context.companyScope ?? 'the current authorised companies';
    const product = context.productSnapshot;
    const costProduct = context.productCostSnapshot;
    const cogsImport = context.cogsImportSnapshot;
    const normalizedQuestion = question.toLowerCase();
    if (cogsImport) {
      const scoped = `This answer is for ${cogsImport.fileName} (${cogsImport.batchId}), scoped to ${scope}.`;
      if (normalizedQuestion.includes('column') || normalizedQuestion.includes('detected') || normalizedQuestion.includes('mapping')) {
        const mappings = cogsImport.mappedColumns.map((mapping) => `${mapping.sourceColumn} → ${mapping.field} (${mapping.confidence}% ${mapping.detectedBy})`).join('; ');
        return `${mappings || 'No source columns are currently mapped.'} These are interpretations for human confirmation; no source value is changed. ${scoped}`;
      }
      if (normalizedQuestion.includes('unmatched')) {
        return `${cogsImport.unmatchedCount.toLocaleString('en-GB')} rows are unmatched. A deterministic identifier did not resolve to exactly one authorised Product in the locked Company; Copilot will not invent or silently choose a Product. ${scoped}`;
      }
      if (normalizedQuestion.includes('suggest') || normalizedQuestion.includes('match')) {
        return `${cogsImport.exactCount.toLocaleString('en-GB')} exact identifier matches and ${cogsImport.suggestedCount.toLocaleString('en-GB')} title-based suggestions were found. Suggested and ambiguous matches require explicit human review. ${scoped}`;
      }
      if (normalizedQuestion.includes('suspicious') || normalizedQuestion.includes('anomal') || normalizedQuestion.includes('error')) {
        return `${cogsImport.anomalyCount.toLocaleString('en-GB')} rows have findings, including ${cogsImport.blockingCount.toLocaleString('en-GB')} rows with blocking validation errors. Copilot only surfaces findings; it does not accept or repair them. ${scoped}`;
      }
      const result = cogsImport.result;
      return result
        ? `${result.recordsCreated.toLocaleString('en-GB')} records were explicitly approved and applied. Product COGS coverage changed from ${formatPercentage(result.beforeProductCoverageBps)} to ${formatPercentage(result.afterProductCoverageBps)}, and profitability coverage from ${formatPercentage(result.beforeProfitabilityCoverageBps)} to ${formatPercentage(result.afterProfitabilityCoverageBps)}. ${scoped}`
        : `${cogsImport.rowCount.toLocaleString('en-GB')} rows were analysed: ${cogsImport.exactCount.toLocaleString('en-GB')} exact, ${cogsImport.suggestedCount.toLocaleString('en-GB')} suggested and ${cogsImport.unmatchedCount.toLocaleString('en-GB')} unmatched. ${cogsImport.acceptedCount.toLocaleString('en-GB')} are accepted for review and ${cogsImport.pendingCount.toLocaleString('en-GB')} remain pending. No costs have been applied. ${scoped}`;
    }
    if (costProduct) {
      const scoped = `This answer is for ${costProduct.title} (${costProduct.internalSku}), scoped to ${scope} and the authorised marketplace accounts.`;
      if (normalizedQuestion.includes('profit') || normalizedQuestion.includes('margin') || normalizedQuestion.includes('revenue') || normalizedQuestion.includes('fee') || normalizedQuestion.includes('transaction')) {
        return `Revenue, margin, profit, fees and transaction values require profitability access and are excluded for the active role. ${scoped}`;
      }
      if (normalizedQuestion.includes('listing') || normalizedQuestion.includes('issue') || normalizedQuestion.includes('attention')) {
        const issues = costProduct.listingIssues.length ? [...new Set(costProduct.listingIssues)].join(', ') : 'no listing-level issues';
        return `${costProduct.listingCount} authorised listings are linked across ${costProduct.marketplaces.map(marketplaceLabel).join(', ') || 'no marketplaces'}, with ${issues}. ${scoped}`;
      }
      const current = costProduct.currentCogsPence === null ? 'Current COGS is missing.' : `Current COGS is ${formatMoney(costProduct.currentCogsPence)}.`;
      return `${current} ${costProduct.costHistoryCount ? `${costProduct.costHistoryCount} effective-dated cost records are available.` : 'No cost history is available.'} COGS status is ${costProduct.cogsStatus.replaceAll('_', ' ')}. ${scoped}`;
    }
    if (product) {
      const completeStatement = product.sensitiveExpensesVisible === false
        ? 'Expense totals, Net Profit and Margin are restricted to protect sensitive expenses. Cost coverage remains available.'
        : product.profitabilityComplete
        ? 'Product profitability is complete for the selected scope.'
        : `Product profitability is incomplete: ${formatPercentage(product.profitabilityCoverageBps)} of selected net revenue is covered. Missing COGS is not treated as zero.`;
      const scoped = `This answer is for ${product.title} (${product.internalSku}), scoped to ${scope}, ${context.marketplaceScope ?? 'all marketplaces'} and the selected dates.`;
      if (normalizedQuestion.includes('cogs') || normalizedQuestion.includes('cost') || normalizedQuestion.includes('complete')) {
        if (!product.canViewCogs) return `Current unit cost and cost history require COGS access and are excluded for the active role. ${scoped}`;
        const current = product.currentCogsPence === null ? 'Current COGS is missing.' : `Current COGS is ${formatMoney(product.currentCogsPence)}.`;
        return `${current} ${product.costHistoryCount ? `${product.costHistoryCount} effective-dated cost records are available.` : 'No cost history is available.'} ${completeStatement} ${scoped}`;
      }
      if (normalizedQuestion.includes('marketplace') || normalizedQuestion.includes('amazon') || normalizedQuestion.includes('ebay') || normalizedQuestion.includes('temu') || normalizedQuestion.includes('channel')) {
        if (!product.channelPerformance.length) return `No covered marketplace comparison is available for this product in the current scope. ${completeStatement} ${scoped}`;
        const comparison = product.channelPerformance.map((channel) => `${marketplaceLabel(channel.marketplace)}: ${formatMoney(channel.revenuePence)} revenue, ${formatMoney(channel.knownNetProfitPence)} known net profit, ${formatPercentage(channel.marginBps)} margin`).join('; ');
        return `${comparison}. ${completeStatement} ${scoped}`;
      }
      if (normalizedQuestion.includes('fee')) {
        return `Marketplace fees are ${formatMoney(product.marketplaceFeesPence)} against ${formatMoney(product.revenuePence)} of product revenue. Advertising is ${formatMoney(product.advertisingPence)}, shipping is ${formatMoney(product.shippingPence)}, and other direct costs are ${formatMoney(product.otherDirectCostsPence)}. ${completeStatement} ${scoped}`;
      }
      if (normalizedQuestion.includes('listing') || normalizedQuestion.includes('attention') || normalizedQuestion.includes('issue')) {
        const issues = product.listingIssues.length ? [...new Set(product.listingIssues)].join(', ') : 'no listing-level issues';
        return `${product.listingCount} authorised listings are linked across ${product.marketplaces.map(marketplaceLabel).join(', ') || 'no marketplaces'}, with ${issues}. ${scoped}`;
      }
      if (normalizedQuestion.includes('margin') || normalizedQuestion.includes('loss') || normalizedQuestion.includes('profit')) {
        const result = product.knownNetProfitPence === null ? 'Known net profit and margin are unavailable.' : `${product.profitabilityComplete ? 'Net profit' : 'Known net profit'} is ${formatMoney(product.knownNetProfitPence)} and margin is ${formatPercentage(product.marginBps)}.`;
        return `${result} Revenue is ${formatMoney(product.revenuePence)}, refunds are ${formatMoney(product.refundsPence)}, COGS is ${formatMoney(product.cogsKnownPence)}, and marketplace fees are ${formatMoney(product.marketplaceFeesPence)}. ${completeStatement} ${scoped}`;
      }
      return `${product.title} generated ${formatMoney(product.revenuePence)} from ${product.units.toLocaleString('en-GB')} units. ${product.knownNetProfitPence === null ? 'Known net profit is unavailable.' : `${product.profitabilityComplete ? 'Net profit' : 'Known net profit'} is ${formatMoney(product.knownNetProfitPence)} at ${formatPercentage(product.marginBps)} margin.`} ${completeStatement} ${scoped}`;
    }
    const snapshot = context.dashboardSnapshot;
    if (!snapshot) return `I could not load Dashboard values for “${question}”. The answer remains scoped to ${scope}.`;
    const completeness = snapshot.sensitiveExpensesVisible === false
      ? 'Expense totals, Net Profit and Margin are restricted to protect sensitive expenses. Cost coverage remains available.'
      : snapshot.profitabilityComplete
      ? 'The selected profitability data is complete.'
      : `This is cost-complete-cohort analysis only: ${formatPercentage(snapshot.profitabilityCoverageBps)} of selected net revenue is covered, with ${snapshot.missingCogsProducts.toLocaleString('en-GB')} products missing cost.`;
    const scoped = `This answer is scoped to ${scope} and the selected dates.`;
    const change = (current: number, previous: number) => current - previous;
    const changeDirection = (value: number) => value === 0 ? 'unchanged' : value > 0 ? `up ${formatMoney(value)}` : `down ${formatMoney(Math.abs(value))}`;

    if (normalizedQuestion.includes('missing') || normalizedQuestion.includes('cogs') || normalizedQuestion.includes('cost coverage')) {
      return `${snapshot.missingCogsProducts.toLocaleString('en-GB')} products have incomplete COGS in this scope, affecting ${formatMoney(snapshot.affectedRevenuePence)} of revenue. ${completeness} ${scoped}`;
    }
    if ((normalizedQuestion.includes('marketplace') && !normalizedQuestion.includes('fee')) || normalizedQuestion.includes('most profitable')) {
      const answer = snapshot.mostProfitableMarketplace
        ? `${snapshot.mostProfitableMarketplace} contributes the most covered marketplace profit at ${formatMoney(snapshot.mostProfitableMarketplacePence)}.`
        : 'No cost-complete marketplace activity matches the selected context.';
      return `${answer} ${completeness} ${scoped}`;
    }
    if (normalizedQuestion.includes('product') || normalizedQuestion.includes('attention')) {
      const answer = snapshot.priorityProduct
        ? `${snapshot.priorityProduct} is the highest-priority product because ${snapshot.priorityProductIssue?.toLowerCase() ?? 'it needs review'}.`
        : 'No product-level issue is surfaced in the selected context.';
      return `${answer} ${completeness} ${scoped}`;
    }
    if (normalizedQuestion.includes('fee')) {
      const feeChange = change(snapshot.marketplaceFeesPence, snapshot.previousMarketplaceFeesPence);
      return `Marketplace fees are ${formatMoney(snapshot.marketplaceFeesPence)}, ${changeDirection(feeChange)} versus ${formatMoney(snapshot.previousMarketplaceFeesPence)} in the previous equivalent period. ${completeness} ${scoped}`;
    }
    if (normalizedQuestion.includes('refund')) {
      const refundChange = change(snapshot.refundsPence, snapshot.previousRefundsPence);
      return `Refunds are ${formatMoney(snapshot.refundsPence)}, ${changeDirection(refundChange)} versus ${formatMoney(snapshot.previousRefundsPence)} previously. ${completeness} ${scoped}`;
    }
    if (normalizedQuestion.includes('advert') || normalizedQuestion.includes('ad spend')) {
      const advertisingChange = change(snapshot.advertisingPence, snapshot.previousAdvertisingPence);
      return `Known advertising cost is ${formatMoney(snapshot.advertisingPence)}, ${changeDirection(advertisingChange)} versus ${formatMoney(snapshot.previousAdvertisingPence)} previously. ${completeness} ${scoped}`;
    }

    const revenueChange = change(snapshot.revenuePence, snapshot.previousRevenuePence);
    const feeChange = change(snapshot.marketplaceFeesPence, snapshot.previousMarketplaceFeesPence);
    const refundChange = change(snapshot.refundsPence, snapshot.previousRefundsPence);
    const profitStatement = snapshot.sensitiveExpensesVisible === false
      ? 'Expense totals, Net Profit and Margin are restricted to protect sensitive expenses.'
      : snapshot.knownNetProfitPence === null || snapshot.profitabilityCoverageBps === 0
      ? 'Covered net profit is unavailable because no selected sales have complete cost data.'
      : !snapshot.profitComparisonAvailable
        ? `Known net profit is ${formatMoney(snapshot.knownNetProfitPence)}, based on ${formatPercentage(snapshot.profitabilityCoverageBps)} cost-covered sales. Its previous-period comparison is unavailable because cost coverage is not equivalent.`
        : snapshot.previousKnownNetProfitPence === null
          ? `Known net profit is ${formatMoney(snapshot.knownNetProfitPence)}, with no prior covered-profit comparison.`
          : `Known net profit is ${formatMoney(snapshot.knownNetProfitPence)}, ${changeDirection(change(snapshot.knownNetProfitPence, snapshot.previousKnownNetProfitPence))} versus the previous equivalent period.`;
    return `${profitStatement} Revenue is ${changeDirection(revenueChange)}, marketplace fees are ${changeDirection(feeChange)}, and refunds are ${changeDirection(refundChange)}. ${completeness} ${scoped}`;
  }
}
