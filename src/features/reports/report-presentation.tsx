'use client';

import Link from 'next/link';
import { Fragment, useId, useState } from 'react';
import { AlertTriangle, ArrowUpRight, CheckCircle2, ChevronDown, ChevronRight, Info, RefreshCw } from 'lucide-react';
import type { ReportKind, ReportResult, ReportStatementRow, ReportValue, ReportColumn } from '@/src/domain/reports';
import { formatDate, formatInteger, formatMoney, formatPercentage, formatPoints } from '@/src/domain/calculations';
import { Badge, Skeleton } from '@/src/components/ui/feedback';

export function ReportValueDisplay({ value, format = 'text', deduction = false, currency = 'GBP' }: { value: ReportValue | undefined; format?: ReportColumn['format']; deduction?: boolean; currency?: string }) {
  if (value === null || value === undefined) return <span className="report-unavailable">Unavailable</span>;
  if (format === 'date' && typeof value === 'string') return <span>{formatDate(value)}</span>;
  if (typeof value === 'number') {
    const signed = deduction ? -Math.abs(value) : value;
    const text = format === 'money' ? formatMoney(signed, currency) : format === 'percent' ? formatPercentage(signed) : formatInteger(signed);
    return <span className={`numeric${signed < 0 ? ' negative-text' : ''}`} aria-label={signed < 0 ? `Negative ${format === 'money' ? formatMoney(Math.abs(signed), currency) : format === 'percent' ? formatPercentage(Math.abs(signed)) : formatInteger(Math.abs(signed))}` : undefined}>{text}</span>;
  }
  return <span>{({ amazon: 'Amazon', ebay: 'eBay', temu: 'Temu' } as Record<string, string>)[value.toLowerCase()] ?? value}</span>;
}

export function ReportSummary({ data, loading }: { data?: ReportResult; loading: boolean }) {
  if (loading) return <section className="report-summary" aria-label="Loading report summary" aria-busy="true">{Array.from({ length: 4 }, (_, index) => <article key={index}><Skeleton /><Skeleton /></article>)}</section>;
  if (!data || data.kind === 'p-and-l') return null;
  const totals = data.totals;
  const profitLabel = totals.profitabilityComplete ? 'Net Profit' : 'Known Net Profit';
  const items: Array<{ label: string; value: number | null; format: ReportColumn['format']; note: string }> = data.kind === 'fees' ? [
    { label: 'Marketplace Fees', value: totals.marketplaceFeesMinor, format: 'money', note: 'Canonical fee components' },
    { label: 'Net Revenue', value: totals.netRevenueMinor, format: 'money', note: 'In the selected transaction scope' },
    { label: 'Transactions', value: totals.transactions, format: 'number', note: 'In this reporting scope' },
  ] : data.kind === 'refunds' ? [
    { label: 'Refunds', value: totals.refundsMinor, format: 'money', note: 'Canonical refund amounts' },
    { label: 'Refund Rate', value: totals.refundRateBps, format: 'percent', note: 'Canonical order-based rate' },
    { label: 'Refunded orders', value: totals.refundedOrders, format: 'number', note: 'In the selected reporting scope' },
  ] : data.kind === 'expenses' ? [
    { label: 'Expense Amount', value: data.expenseSummary.configuredMinor, format: 'money', note: 'Effective amount for this period' },
    { label: 'Allocated', value: data.expenseSummary.allocatedMinor, format: 'money', note: 'Included in profitability' },
    { label: 'Unallocated', value: data.expenseSummary.unallocatedMinor, format: 'money', note: 'Without an eligible allocation basis' },
  ] : [
    { label: 'Revenue', value: totals.revenueMinor, format: 'money', note: 'After promotions, before refunds' },
    { label: profitLabel, value: totals.knownNetProfitMinor, format: 'money', note: totals.profitabilityComplete ? 'All required costs available' : 'Only the covered sales cohort' },
    { label: totals.profitabilityComplete ? 'Margin' : 'Known Margin', value: totals.knownMarginBps, format: 'percent', note: 'Of covered Net Revenue' },
    { label: 'Profitability Coverage', value: totals.transactions ? totals.profitabilityCoverageBps : null, format: 'percent', note: 'Unknown costs remain unknown' },
  ];
  return <section className="report-summary" aria-label="Filtered report totals">{items.map((item) => <article key={item.label}><small>{item.label}</small><strong><ReportValueDisplay value={item.value} format={item.format} /></strong><span>{item.note}</span></article>)}</section>;
}

export function ReportHealth({ data, href, canManageCogs, canViewSync, canViewExpenses }: {
  data: ReportResult; href: (path: string, extra?: Record<string, string>) => string;
  canManageCogs: boolean; canViewSync: boolean; canViewExpenses: boolean;
}) {
  const incomplete = data.totals.transactions > 0 && !data.totals.profitabilityComplete;
  const unallocated = data.expenseSummary.unallocatedMinor !== null && data.expenseSummary.unallocatedMinor > 0;
  const issues = incomplete || unallocated || data.freshness.state !== 'fresh' || data.healthNotes.length > 0;
  return <section className={`report-health${issues ? ' has-issues' : ''}`} aria-label="Report data health">
    <div className="report-health-top">{issues ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}<strong>{incomplete ? 'Profitability is incomplete' : unallocated ? 'Expense allocation incomplete' : data.freshness.state !== 'fresh' ? data.freshness.label : 'Report data health'}</strong><div className="report-health-badges"><Badge tone={data.totals.cogsCoverageBps === 10000 ? 'positive' : 'warning'}>COGS {data.totals.transactions ? formatPercentage(data.totals.cogsCoverageBps) : 'N/A'}</Badge><Badge tone={data.freshness.state === 'fresh' ? 'positive' : data.freshness.state === 'error' ? 'negative' : 'warning'}>{data.freshness.label}</Badge></div></div>
    {(incomplete || data.healthNotes.length > 0 || data.freshness.state !== 'fresh') ? <div className="report-health-detail" role="status">{incomplete ? <p>Profitability Coverage: {formatPercentage(data.totals.profitabilityCoverageBps)}. Known Net Profit and Known Margin describe covered sales only; unavailable costs remain unknown.</p> : null}{data.healthNotes.map((note) => <p key={note}>{note}</p>)}{data.freshness.state !== 'fresh' ? <p>{data.freshness.detail}</p> : null}</div> : null}
    {(incomplete && canManageCogs) || (data.freshness.state !== 'fresh' && canViewSync) || (unallocated && canViewExpenses) ? <div className="report-health-actions">{incomplete && canManageCogs ? <Link href={href('/cogs', { status: 'missing' })}>Review missing COGS <ArrowUpRight size={12} /></Link> : null}{data.freshness.state !== 'fresh' && canViewSync ? <Link href={href('/operations/sync-health')}>View Sync Health <ArrowUpRight size={12} /></Link> : null}{unallocated && canViewExpenses ? <Link href={href('/expenses', { needsReview: 'true' })}>Review unallocated expenses <ArrowUpRight size={12} /></Link> : null}</div> : null}
  </section>;
}

function childRows(rows: ReportStatementRow[], parent: string, level = 1): Array<{ row: ReportStatementRow; label: string; level: number }> {
  return rows.flatMap((row) => [{ row, label: `${parent}: ${row.label}`, level }, ...childRows(row.children ?? [], `${parent}: ${row.label}`, level + 1)]);
}

export function OperationalStatement({ data, reportHref }: { data: ReportResult; reportHref: (kind: ReportKind) => string }) {
  const [expanded, setExpanded] = useState<string[]>([]);
  const id = useId();
  const comparison = data.comparison;
  const valueCells = (line: ReportStatementRow, child = false) => <><td className="statement-current"><span className="statement-mobile-label">Selected period</span><ReportValueDisplay value={line.amountMinor} format={line.format === 'percent' ? 'percent' : 'money'} deduction={line.format !== 'percent' && line.operation === 'subtract'} />{!line.complete && line.amountMinor !== null && !child ? <small className="statement-known">Known amount</small> : null}</td>{comparison ? <><td className="statement-previous"><span className="statement-mobile-label">Previous period</span><ReportValueDisplay value={line.previousMinor} format={line.format === 'percent' ? 'percent' : 'money'} deduction={line.format !== 'percent' && line.operation === 'subtract'} /></td><td className="statement-delta"><span className="statement-mobile-label">Change</span>{line.deltaBps === null ? <span className="report-unavailable">—<span className="sr-only">Comparison unavailable</span></span> : <span className="numeric">{line.format === 'percent' ? formatPoints(line.deltaBps, { signed: true }) : formatPercentage(line.deltaBps, { signed: true })}</span>}</td></> : null}</>;
  return <section className="operational-statement" aria-labelledby={`${id}-title`}>
    <header><div><h2 id={`${id}-title`}>Operational Profit &amp; Loss</h2><p>{formatDate(data.context.dateRange.from)} – {formatDate(data.context.dateRange.to)}</p></div><Badge>{data.currency}</Badge></header>
    <table className={`statement-table${comparison ? ' with-comparison' : ''}`} aria-label="Operational Profit and Loss financial statement">
      <caption className="sr-only">Operational statement for {data.organisationName}. Deductions are negative amounts. Incomplete values describe only known profitability.</caption>
      <thead><tr><th scope="col">Financial line</th><th scope="col">Selected period</th>{comparison ? <><th scope="col">Previous period<small>{formatDate(comparison.range.from)} – {formatDate(comparison.range.to)}</small></th><th scope="col">Change</th></> : null}</tr></thead>
      {data.statement.map((line) => {
        const open = expanded.includes(line.key);
        const children = childRows(line.children ?? [], line.label);
        const controlId = `${id}-${line.key}-details`;
        return <Fragment key={line.key}><tbody><tr className={`statement-line statement-${line.operation}${line.format === 'percent' ? ' statement-margin' : ''}`}><th scope="row"><div className="statement-label">{children.length ? <button type="button" aria-expanded={open} aria-controls={controlId} aria-label={`${open ? 'Collapse' : 'Expand'} ${line.label}`} onClick={() => setExpanded((previous) => open ? previous.filter((key) => key !== line.key) : [...previous, line.key])}>{open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button> : <span className="statement-toggle-space" />}{line.reportKind ? <Link href={reportHref(line.reportKind)}>{line.label}<ArrowUpRight size={12} /></Link> : <span>{line.label}</span>}</div></th>{valueCells(line)}</tr></tbody>{children.length ? <tbody id={controlId} hidden={!open} className="statement-details">{children.map(({ row, label, level }) => <tr key={row.key} className={`statement-child statement-child-level-${level}`}><th scope="row"><span className="sr-only">{label.slice(0, label.length - row.label.length)}</span><span>{row.label}</span></th>{valueCells(row, true)}</tr>)}</tbody> : null}</Fragment>;
      })}
    </table>
    {comparison && !comparison.status.available ? <div className="statement-comparison-note" role="status"><Info size={15} /><p>Profit and margin change are unavailable because {comparison.status.reason === 'no_covered_sales' ? 'one of the periods has no covered sales' : comparison.status.reason === 'restricted_expenses' ? 'sensitive expense permissions restrict profitability disclosure' : 'profitability coverage differs materially between these periods'}. The previous period is the immediately preceding period of equal inclusive length.</p></div> : null}
    <footer><Info size={14} /><p>{data.disclaimer}</p></footer>
  </section>;
}

export function StatementSkeleton() {
  return <section className="operational-statement statement-skeleton" aria-label="Loading Operational P&L" aria-busy="true"><header><Skeleton /><Skeleton /></header>{Array.from({ length: 12 }, (_, index) => <div key={index}><Skeleton /><Skeleton /></div>)}<span className="sr-only">Loading financial statement</span></section>;
}

export function ReportUpdating() { return <div className="report-updating" role="status" aria-live="polite"><RefreshCw size={13} className="spin" /> Recalculating report…</div>; }

