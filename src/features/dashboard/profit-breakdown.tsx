'use client';

import { useState } from 'react';
import { ArrowDown, Check, Info } from 'lucide-react';
import { TransactionsLink } from '@/src/features/transactions/transaction-links';
import type { ProfitBridgeRow } from '@/src/domain/analytics';
import { formatMoney } from '@/src/domain/calculations';

const ROW_DETAIL: Partial<Record<ProfitBridgeRow['key'], string>> = {
  refunds: 'Refunds reduce recognised marketplace revenue for the selected period.',
  cogs: 'Product cost uses the unit-cost record effective on each transaction date.',
  marketplaceFees: 'Includes referral, fulfilment, storage, promoted-listing and other seller fees where applicable.',
  advertising: 'Includes marketplace advertising and promoted-listing spend available for the selected accounts.',
  shipping: 'Aggregates marketplace fulfilment and direct delivery cost without combining them with seller fees.',
  allocatedExpenses: 'Prototype allocation: organisation and company expenses are distributed proportionally by net revenue.',
};

export function ProfitBreakdown({ rows }: { rows: ProfitBridgeRow[]; orgSlug: string }) {
  const [selected, setSelected] = useState<ProfitBridgeRow['key'] | null>('cogs');
  const selectedRow = rows.find((row) => row.key === selected);
  const revenue = Math.max(1, rows[0]?.amountMinor ?? 1);
  return <section className="dashboard-section breakdown-section" aria-labelledby="breakdown-title">
    <header className="dashboard-section-heading"><div><h2 id="breakdown-title">Profit breakdown</h2><p>How {rows[0]?.label ?? 'Revenue'} becomes {rows.at(-1)?.complete ? 'Net Profit' : 'Known Net Profit'}.</p></div><TransactionsLink /></header>
    <div className="profit-bridge">
      {rows.map((row, index) => {
        const clickable = Boolean(ROW_DETAIL[row.key]);
        const amount = row.amountMinor === null ? null : row.operation === 'subtract' ? -row.amountMinor : row.amountMinor;
        const displayAmount = formatMoney(amount);
        return <div className={`bridge-row ${row.operation} ${row.operation === 'result' && (row.amountMinor ?? 0) < 0 ? 'negative' : ''} ${selected === row.key ? 'selected' : ''}`} key={row.key}>
          <div className="bridge-flow" aria-hidden="true">{index === 0 ? <Check size={12} /> : <ArrowDown size={12} />}</div>
          {clickable ? <button type="button" aria-pressed={selected === row.key} onClick={() => setSelected((current) => current === row.key ? null : row.key)}><span>{row.label}{!row.complete ? <small>Incomplete</small> : null}</span><b>{row.sensitive ? 'Restricted' : displayAmount}</b></button> : <div><span>{row.label}{!row.complete ? <small>Incomplete</small> : null}</span><b>{displayAmount}</b></div>}
          <i className="bridge-scale" aria-hidden="true"><span style={{ width: `${Math.max(3, Math.min(100, Math.abs(row.amountMinor ?? 0) / revenue * 100))}%` }} /></i>
        </div>;
      })}
    </div>
    <div className="bridge-explainer" role="status"><Info size={14} aria-hidden="true" /><p>{selectedRow && ROW_DETAIL[selectedRow.key] ? ROW_DETAIL[selectedRow.key] : 'Select a cost row to see how it contributes to the calculation.'}</p></div>
  </section>;
}
