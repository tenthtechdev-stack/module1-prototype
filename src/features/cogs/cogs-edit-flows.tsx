'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ArrowRight, CalendarClock, Check, ClipboardPaste, FileSpreadsheet, History, Percent, RotateCcw } from 'lucide-react';
import { Button } from '@/src/components/ui/actions';
import { Alert, Badge, useToast } from '@/src/components/ui/feedback';
import { Field, Input, Select, Textarea, UnambiguousDateInput } from '@/src/components/ui/forms';
import { Drawer, Modal } from '@/src/components/ui/overlays';
import {
  COGS_TODAY,
  cogsChangeBps,
  detectCogsColumnMapping,
  isIsoCogsDate,
  parseCostMinor,
  parseDelimitedText,
  percentageAdjustedMinor,
  previewApprovedCogsInsertion,
  type CogsProposalInput,
  type CogsWorkspaceRow,
} from '@/src/domain/cogs';
import { formatDate, formatMoney, formatPercentage } from '@/src/domain/calculations';
import { useCogsActions } from '@/src/services/hooks/use-cogs';

function previousDay(isoDate: string) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function routeForBatch(orgSlug: string, batchId: string) {
  return `/o/${orgSlug}/cogs/import/${encodeURIComponent(batchId)}`;
}

function MoneyChange({ current, proposed }: { current: number | null; proposed: number | null }) {
  const change = cogsChangeBps(current, proposed);
  return <span className={change === null ? 'muted' : change > 0 ? 'delta negative' : 'delta positive'}>{change === null ? 'New cost' : formatPercentage(change, { signed: true })}</span>;
}

export function SingleCostDrawer({ row, open, orgSlug, onClose }: { row: CogsWorkspaceRow | null; open: boolean; orgSlug: string; onClose: () => void }) {
  const router = useRouter();
  const { showToast } = useToast();
  const actions = useCogsActions();
  const [step, setStep] = useState<'entry' | 'review'>('entry');
  const [cost, setCost] = useState(() => row?.current ? (row.current.unitCostMinor / 100).toFixed(2) : '');
  const [currency, setCurrency] = useState(() => row?.current?.currency ?? 'GBP');
  const [effectiveFrom, setEffectiveFrom] = useState(COGS_TODAY);
  const [reason, setReason] = useState(() => row?.current ? 'Supplier price update' : 'Initial cost setup');
  const [error, setError] = useState('');

  if (!row) return null;
  const activeRow = row;
  const proposedMinor = parseCostMinor(cost);
  const costError = cost && (proposedMinor === null || proposedMinor < 0) ? 'Enter a non-negative decimal cost using a dot, for example 7.20.' : '';
  const dateError = !isIsoCogsDate(effectiveFrom) ? 'Choose an unambiguous effective date.' : '';
  const insertionPreview = !dateError ? previewApprovedCogsInsertion(row.history, effectiveFrom) : null;
  const comparisonRecord = insertionPreview?.predecessor ?? null;
  const unchanged = proposedMinor !== null && comparisonRecord?.unitCostMinor === proposedMinor && comparisonRecord.currency === currency;
  const previousRange = comparisonRecord
    ? insertionPreview?.predecessorDisposition === 'shortened'
      ? `${formatDate(comparisonRecord.effectiveFrom)} – ${formatDate(previousDay(effectiveFrom))} after approval`
      : `Superseded (was ${formatDate(comparisonRecord.effectiveFrom)} – ${comparisonRecord.effectiveTo ? formatDate(previousDay(comparisonRecord.effectiveTo)) : 'open ended'})`
    : `No approved cost covers ${formatDate(effectiveFrom)}`;
  const proposedRange = insertionPreview
    ? `${formatDate(effectiveFrom)} – ${insertionPreview.incomingEffectiveTo ? formatDate(previousDay(insertionPreview.incomingEffectiveTo)) : 'open ended'}`
    : 'Choose a valid effective date';

  async function createProposal() {
    if (proposedMinor === null || proposedMinor < 0 || dateError || unchanged) return;
    setError('');
    try {
      const batch = await actions.createProposalBatch({
        companyId: activeRow.product.ownerCompanyId,
        kind: 'single',
        label: `Single cost · ${activeRow.product.internalSku}`,
        proposals: [{ productId: activeRow.id, unitCostMinor: proposedMinor, currency, effectiveFrom, reason: reason.trim() || 'Single Product COGS update' }],
      });
      showToast('Proposed COGS change created. Financial approval is still required.', 'info');
      onClose();
      router.push(routeForBatch(orgSlug, batch.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The proposed change could not be created.');
    }
  }

  return <Drawer open={open} onOpenChange={(next) => { if (!next) onClose(); }} title={row.current ? 'Update Product COGS' : 'Add Product COGS'} description="Create a governed, effective-dated proposal. Current financials do not change until approval.">
    <div className="cogs-edit-flow">
      <section className="cogs-product-context">
        <div><span className="eyebrow">Company-owned Product</span><h3>{row.product.title}</h3><p className="mono">{row.product.internalSku}</p></div>
        <Badge tone={row.current ? 'positive' : 'negative'}>{row.current ? 'Current cost approved' : 'COGS missing'}</Badge>
      </section>
      {step === 'entry' ? <>
        <div className="cogs-current-value"><span>Current COGS</span><strong>{row.current ? formatMoney(row.current.unitCostMinor, row.current.currency) : 'Missing'}</strong>{row.current ? <small>Effective {formatDate(row.current.effectiveFrom)}</small> : <small>No approved Product cost</small>}</div>
        <div className="cogs-form-grid two">
          <Field label="New unit cost" hint="Plain decimal value; currency is selected separately." error={costError}><Input inputMode="decimal" value={cost} onChange={(event) => setCost(event.target.value)} placeholder="7.20" /></Field>
          <Field label="Currency"><Select value={currency} onChange={(event) => setCurrency(event.target.value)}><option>GBP</option><option>EUR</option><option>USD</option></Select></Field>
          <Field label="Effective date" hint={!dateError ? `Effective ${formatDate(effectiveFrom)}` : undefined} error={dateError}><UnambiguousDateInput value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} /></Field>
          <Field label="Source"><Input value="Single edit" readOnly /></Field>
        </div>
        <Field label="Reason" hint="Stored on the resulting COGS record and immutable audit event."><Textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} /></Field>
        {effectiveFrom < COGS_TODAY ? <Alert tone="warning" title="Backdated change">Historical profitability will be recalculated only for affected effective periods after approval.</Alert> : null}
        {effectiveFrom > COGS_TODAY ? <Alert tone="info" title="Scheduled cost">Today’s COGS remains unchanged until {formatDate(effectiveFrom)}.</Alert> : null}
        {proposedMinor === 0 ? <Alert tone="warning" title="Zero cost requires review">Zero may be legitimate, but it will be surfaced as an anomaly before approval.</Alert> : null}
        {unchanged ? <Alert tone="warning" title="No financial change">Change the cost or currency before continuing.</Alert> : null}
        <div className="cogs-dialog-actions"><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={proposedMinor === null || proposedMinor < 0 || Boolean(dateError) || unchanged} onClick={() => setStep('review')}>Review change <ArrowRight size={15} /></Button></div>
      </> : <>
        <div className="cogs-review-callout"><span className="eyebrow">Proposed · not yet applied</span><h3>Exact effective-date range preview</h3><div className="cogs-range-preview"><article><small>Affected approved record</small><strong>{comparisonRecord ? formatMoney(comparisonRecord.unitCostMinor, comparisonRecord.currency) : 'No approved cost'}</strong><span>{previousRange}</span></article><ArrowRight aria-hidden="true" size={18} /><article><small>New approved record</small><strong>{proposedMinor === null ? '—' : formatMoney(proposedMinor, currency)}</strong><span>{proposedRange}</span></article></div><MoneyChange current={comparisonRecord?.unitCostMinor ?? null} proposed={proposedMinor} /></div>
        <dl className="cogs-review-list"><div><dt>Company</dt><dd>{row.companyName}</dd></div><div><dt>Source</dt><dd>Single edit</dd></div><div><dt>Prepared by</dt><dd>{actions.actor.name}</dd></div><div><dt>Reason</dt><dd>{reason || 'Single Product COGS update'}</dd></div></dl>
        <Alert tone={actions.permissions.canApprove ? 'info' : 'warning'} title={actions.permissions.canApprove ? 'Approval remains explicit' : 'A second user must approve'}>{actions.permissions.canApprove ? 'Creating this proposal does not apply it. You will confirm approval on the governed review screen.' : 'Your role can prepare this change, but cannot apply it. The batch will remain Awaiting Approval.'}</Alert>
        {error ? <Alert tone="negative" title="Proposal could not be created">{error}</Alert> : null}
        <div className="cogs-dialog-actions"><Button onClick={() => setStep('entry')}>Back</Button><Button variant="primary" loading={actions.createProposalMutation.isPending} onClick={() => { void createProposal(); }}><Check size={15} /> Create proposed change</Button></div>
      </>}
    </div>
  </Drawer>;
}

interface BulkDraft {
  cost: string;
  currency: string;
  effectiveFrom: string;
  reason: string;
}

function initialBulkDrafts(rows: CogsWorkspaceRow[]) {
  return Object.fromEntries(rows.map((row) => [row.id, {
    cost: row.current ? (row.current.unitCostMinor / 100).toFixed(2) : '',
    currency: row.current?.currency ?? 'GBP',
    effectiveFrom: COGS_TODAY,
    reason: '',
  }])) as Record<string, BulkDraft>;
}

export function BulkCostEditor({ rows, open, orgSlug, onClose }: { rows: CogsWorkspaceRow[]; open: boolean; orgSlug: string; onClose: () => void }) {
  const router = useRouter();
  const { showToast } = useToast();
  const actions = useCogsActions();
  const [drafts, setDrafts] = useState<Record<string, BulkDraft>>(() => initialBulkDrafts(rows));
  const [commonDate, setCommonDate] = useState(COGS_TODAY);
  const [commonReason, setCommonReason] = useState('Supplier annual price revision');
  const [error, setError] = useState('');

  const proposals = useMemo(() => rows.flatMap((row): CogsProposalInput[] => {
    const draft = drafts[row.id];
    const minor = draft ? parseCostMinor(draft.cost) : null;
    if (!draft || minor === null || minor < 0) return [];
    const changed = row.current?.unitCostMinor !== minor || row.current?.currency !== draft.currency;
    return changed ? [{ productId: row.id, unitCostMinor: minor, currency: draft.currency, effectiveFrom: draft.effectiveFrom, reason: draft.reason.trim() || commonReason.trim() || 'Bulk COGS update' }] : [];
  }), [commonReason, drafts, rows]);
  const invalidCount = rows.filter((row) => {
    const value = drafts[row.id]?.cost ?? '';
    return value !== '' && (parseCostMinor(value) === null || (parseCostMinor(value) ?? 0) < 0);
  }).length;

  function update(id: string, values: Partial<BulkDraft>) {
    setDrafts((current) => ({ ...current, [id]: { ...current[id], ...values } }));
  }
  function applyCommonDate() {
    setDrafts((current) => Object.fromEntries(Object.entries(current).map(([id, draft]) => [id, { ...draft, effectiveFrom: commonDate }])));
  }
  async function continueToReview() {
    if (!proposals.length || invalidCount) return;
    setError('');
    try {
      const batch = await actions.createProposalBatch({ companyId: rows[0].product.ownerCompanyId, kind: 'bulk', proposals, label: `Bulk update · ${proposals.length} Products` });
      showToast(`${proposals.length} proposed changes are ready for governed review.`, 'info');
      onClose();
      router.push(routeForBatch(orgSlug, batch.id));
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Bulk proposals could not be created.'); }
  }

  return <Modal open={open} onOpenChange={(next) => { if (!next) onClose(); }} onEscapeKeyDown={(event) => { if ((event.target as HTMLElement).getAttribute('aria-label')?.startsWith('New COGS for ')) event.preventDefault(); }} title="Bulk update Product COGS" description="Spreadsheet-style edits remain draft proposals until an authorised approval is applied.">
    <div className="cogs-bulk-editor">
      {!rows.length ? <Alert tone="warning" title="Select Products first">Select rows in the COGS table, then choose Bulk update.</Alert> : <>
        <div className="cogs-bulk-toolbar"><Field label="Common effective date" hint={commonDate ? `Effective ${formatDate(commonDate)}` : undefined}><UnambiguousDateInput value={commonDate} onChange={(event) => setCommonDate(event.target.value)} /></Field><Button size="compact" onClick={applyCommonDate}><CalendarClock size={14} /> Apply to {rows.length}</Button><Field label="Batch reason"><Input value={commonReason} onChange={(event) => setCommonReason(event.target.value)} /></Field><Button size="compact" onClick={() => setDrafts(initialBulkDrafts(rows))}><RotateCcw size={14} /> Discard edits</Button></div>
        <div className="cogs-spreadsheet-wrap" role="region" aria-label="Bulk COGS spreadsheet" tabIndex={0}><table className="cogs-spreadsheet"><thead><tr><th>Product</th><th>SKU</th><th>Current</th><th>New COGS</th><th>Currency</th><th>Effective date</th><th>Change</th><th>Validation</th></tr></thead><tbody>{rows.map((row) => {
          const draft = drafts[row.id] ?? { cost: '', currency: 'GBP', effectiveFrom: COGS_TODAY, reason: '' };
          const proposed = parseCostMinor(draft.cost);
          const invalid = draft.cost !== '' && (proposed === null || proposed < 0);
          const dirty = proposed !== null && (row.current?.unitCostMinor !== proposed || row.current?.currency !== draft.currency);
          return <tr key={row.id} className={dirty ? 'dirty' : undefined}><td><strong>{row.product.title}</strong></td><td className="mono">{row.product.internalSku}</td><td>{row.current ? formatMoney(row.current.unitCostMinor, row.current.currency) : 'Missing'}</td><td><Input aria-label={`New COGS for ${row.product.title}`} inputMode="decimal" value={draft.cost} onChange={(event) => update(row.id, { cost: event.target.value })} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); update(row.id, { cost: row.current ? (row.current.unitCostMinor / 100).toFixed(2) : '' }); } }} /></td><td><Select aria-label={`Currency for ${row.product.title}`} value={draft.currency} onChange={(event) => update(row.id, { currency: event.target.value })}><option>GBP</option><option>EUR</option><option>USD</option></Select></td><td><span className="cogs-date-input"><UnambiguousDateInput aria-label={`Effective date for ${row.product.title}`} value={draft.effectiveFrom} onChange={(event) => update(row.id, { effectiveFrom: event.target.value })} /><small>{formatDate(draft.effectiveFrom)}</small></span></td><td><MoneyChange current={row.current?.unitCostMinor ?? null} proposed={proposed} /></td><td>{invalid ? <Badge tone="negative">Invalid decimal</Badge> : dirty ? <Badge tone="info">Draft changed</Badge> : <Badge>Unchanged</Badge>}</td></tr>;
        })}</tbody></table></div>
        <div className="cogs-validation-summary" role="status"><strong>{proposals.length} proposed changes ready for review</strong><span>{invalidCount ? `${invalidCount} rows require attention` : 'Tab and Shift+Tab move through fields. Escape restores a cost cell.'}</span></div>
        {error ? <Alert tone="negative" title="Bulk proposal failed">{error}</Alert> : null}
      </>}
      <div className="cogs-dialog-actions"><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!proposals.length || Boolean(invalidCount)} loading={actions.createProposalMutation.isPending} onClick={() => { void continueToReview(); }}>Review {proposals.length || ''} changes <ArrowRight size={15} /></Button></div>
    </div>
  </Modal>;
}

export function PercentageAdjustmentModal({ rows, open, orgSlug, onClose }: { rows: CogsWorkspaceRow[]; open: boolean; orgSlug: string; onClose: () => void }) {
  const router = useRouter();
  const actions = useCogsActions();
  const { showToast } = useToast();
  const eligible = rows.filter((row) => row.current);
  const [direction, setDirection] = useState<'increase' | 'decrease'>('increase');
  const [percent, setPercent] = useState('5');
  const [effectiveFrom, setEffectiveFrom] = useState(COGS_TODAY);
  const [reason, setReason] = useState('Supplier annual price revision');
  const [error, setError] = useState('');
  const numericPercent = Number(percent);
  const valid = Number.isFinite(numericPercent) && numericPercent > 0 && numericPercent <= 100;
  const adjustmentBps = valid ? Math.round(numericPercent * 100) * (direction === 'increase' ? 1 : -1) : 0;
  const proposals: CogsProposalInput[] = valid ? eligible.map((row) => ({ productId: row.id, unitCostMinor: percentageAdjustedMinor(row.current!.unitCostMinor, adjustmentBps), currency: row.current!.currency, effectiveFrom, reason: reason.trim() || `${direction} costs by ${numericPercent}%` })) : [];
  async function continueToReview() {
    if (!proposals.length) return;
    try {
      const batch = await actions.createProposalBatch({ companyId: eligible[0].product.ownerCompanyId, kind: 'percentage', proposals, label: `${direction === 'increase' ? '+' : '−'}${numericPercent}% adjustment · ${proposals.length} Products` });
      showToast('Percentage adjustment prepared in currency minor units.', 'info'); onClose(); router.push(routeForBatch(orgSlug, batch.id));
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'The adjustment could not be prepared.'); }
  }
  return <Modal open={open} onOpenChange={(next) => { if (!next) onClose(); }} title="Percentage adjustment" description="Preview a deterministic minor-unit adjustment before creating a financial proposal.">
    <div className="cogs-edit-flow">
      {!eligible.length ? <Alert tone="warning" title="No current costs selected">Percentage adjustments require at least one selected Product with an approved current COGS.</Alert> : <>
        <div className="cogs-form-grid three"><Field label="Adjustment"><Select value={direction} onChange={(event) => setDirection(event.target.value as 'increase' | 'decrease')}><option value="increase">Increase</option><option value="decrease">Decrease</option></Select></Field><Field label="Percent" error={valid ? '' : 'Enter a value greater than 0 and no more than 100.'}><Input inputMode="decimal" value={percent} onChange={(event) => setPercent(event.target.value)} /></Field><Field label="Effective date" hint={effectiveFrom ? `Effective ${formatDate(effectiveFrom)}` : undefined}><UnambiguousDateInput value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} /></Field></div>
        <Field label="Reason"><Textarea rows={2} value={reason} onChange={(event) => setReason(event.target.value)} /></Field>
        <div className="cogs-adjustment-preview"><div className="cogs-preview-heading"><strong>Preview</strong><span>{eligible.length} Products · rounded to the currency minor unit</span></div>{eligible.slice(0, 6).map((row, index) => <div key={row.id}><span><strong>{row.product.title}</strong><small>{row.product.internalSku}</small></span><span>{formatMoney(row.current!.unitCostMinor, row.current!.currency)}</span><ArrowRight size={14} /><strong>{proposals[index] ? formatMoney(proposals[index].unitCostMinor, proposals[index].currency) : '—'}</strong><MoneyChange current={row.current!.unitCostMinor} proposed={proposals[index]?.unitCostMinor ?? null} /></div>)}</div>
        <Alert tone="info" title="Deterministic rounding">For example, £6.90 × 1.05 = £7.245 and becomes £7.25. No draft affects profitability.</Alert>
        {error ? <Alert tone="negative" title="Adjustment failed">{error}</Alert> : null}
      </>}
      <div className="cogs-dialog-actions"><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!proposals.length} loading={actions.createProposalMutation.isPending} onClick={() => { void continueToReview(); }}><Percent size={15} /> Review {proposals.length || ''} changes</Button></div>
    </div>
  </Modal>;
}

export function PasteCostsModal({ open, orgSlug, defaultCompanyId, sampleRows, onClose }: { open: boolean; orgSlug: string; defaultCompanyId?: string; sampleRows: CogsWorkspaceRow[]; onClose: () => void }) {
  const router = useRouter();
  const actions = useCogsActions();
  const { showToast } = useToast();
  const [companyId, setCompanyId] = useState(() => defaultCompanyId && defaultCompanyId !== 'all' ? defaultCompanyId : actions.companies[0]?.id ?? '');
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const parsed = useMemo(() => parseDelimitedText(text), [text]);
  const mapping = useMemo(() => detectCogsColumnMapping(parsed.headers), [parsed.headers]);
  const mappedFields = mapping.filter((item) => item.sourceColumn).length;
  function useExample() {
    const example = sampleRows.filter((row) => row.product.ownerCompanyId === companyId).slice(0, 3);
    const fallback = sampleRows.slice(0, 3);
    const selected = example.length ? example : fallback;
    setText(`SKU\tCost\tCurrency\tEffective Date\n${selected.map((row, index) => `${row.product.internalSku}\t${row.current ? ((row.current.unitCostMinor + 25 + index * 10) / 100).toFixed(2) : (6.4 + index).toFixed(2)}\t${row.current?.currency ?? 'GBP'}\t2026-09-01`).join('\n')}`);
    if (!companyId && selected[0]) setCompanyId(selected[0].product.ownerCompanyId);
  }
  async function analyse() {
    if (!companyId || !parsed.rows.length) return;
    setError('');
    try {
      const batch = await actions.createImport({ companyId, fileName: 'Pasted spreadsheet rows', fileType: 'paste', fileSize: new Blob([text]).size, sheetNames: [], selectedSheet: null, headers: parsed.headers, rawRows: parsed.rows, mapping, reason: 'Pasted supplier cost update', note: 'Parsed locally from tab-separated or comma-separated text.' });
      showToast(`${parsed.rows.length} pasted rows preserved and ready for mapping.`, 'info'); onClose(); router.push(routeForBatch(orgSlug, batch.id));
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'The pasted rows could not be analysed.'); }
  }
  return <Modal open={open} onOpenChange={(next) => { if (!next) onClose(); }} title="Paste from Excel" description="Paste tab-separated or comma-separated rows. Values are parsed locally and always rendered as text.">
    <div className="cogs-edit-flow">
      <div className="cogs-form-grid two"><Field label="Company" hint="All Product matching stays inside this Company."><Select value={companyId} onChange={(event) => { setCompanyId(event.target.value); setText(''); }}><option value="">Choose Company</option>{actions.companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</Select></Field><div className="cogs-paste-security"><FileSpreadsheet size={17} /><span><strong>Local parsing only</strong><small>No macros, formulas, HTML or filesystem paths are executed or stored.</small></span></div></div>
      <Field label="Spreadsheet rows" hint="Recognised headers include SKU, Cost, Currency and Effective Date."><Textarea className="cogs-paste-area" value={text} onChange={(event) => setText(event.target.value)} rows={11} placeholder={'SKU\tCost\tCurrency\tEffective Date\nBNG-XL\t7.20\tGBP\t2026-09-01'} /></Field>
      <div className="cogs-paste-summary" aria-live="polite"><span><strong>{parsed.rows.length}</strong> data rows</span><span><strong>{parsed.headers.length}</strong> columns</span><span><strong>{mappedFields}</strong> fields detected</span><Button size="compact" onClick={useExample}><ClipboardPaste size={14} /> Use safe example</Button></div>
      {text && parsed.rows.length === 0 ? <Alert tone="negative" title="No data rows detected">Paste at least one newline-separated data row.</Alert> : null}
      {mappedFields < 2 && parsed.rows.length ? <Alert tone="warning" title="Column mapping required">The source has no reliable headers. You will map each column explicitly before matching Products.</Alert> : null}
      {error ? <Alert tone="negative" title="Paste analysis failed">{error}</Alert> : null}
      <div className="cogs-dialog-actions"><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!companyId || !parsed.rows.length} loading={actions.createImportMutation.isPending} onClick={() => { void analyse(); }}>Analyse pasted rows <ArrowRight size={15} /></Button></div>
    </div>
  </Modal>;
}

export function CogsHistoryDrawer({ row, open, orgSlug, onClose }: { row: CogsWorkspaceRow | null; open: boolean; orgSlug: string; onClose: () => void }) {
  if (!row) return null;
  const periods = [...row.history]
    .filter((record) => record.approvalStatus === 'approved')
    .sort((left, right) => right.effectiveFrom.localeCompare(left.effectiveFrom));
  return <Drawer open={open} onOpenChange={(next) => { if (!next) onClose(); }} title="Cost history" description="Approved Product-level COGS periods and source traceability.">
    <div className="cogs-edit-flow">
      <section className="cogs-product-context"><div><span className="eyebrow">{row.companyName}</span><h3>{row.product.title}</h3><p className="mono">{row.product.internalSku}</p></div><History size={20} /></section>
      {periods.length ? <ol className="cogs-history-list">{periods.map((record) => { const label = record.status === 'superseded' ? 'Superseded' : record.effectiveFrom > COGS_TODAY ? 'Scheduled' : record.id === row.current?.id ? 'Effective' : 'Historical'; const periodEnd = record.status === 'superseded' ? 'Superseded' : record.effectiveTo ? formatDate(previousDay(record.effectiveTo)) : 'Current'; return <li key={record.id} className={label === 'Scheduled' ? 'scheduled' : undefined}><span className="cogs-history-dot" aria-hidden="true" /><div><div><strong>{formatMoney(record.unitCostMinor, record.currency)}</strong><Badge tone={label === 'Scheduled' ? 'info' : label === 'Effective' ? 'positive' : 'neutral'}>{label}</Badge></div><p>{formatDate(record.effectiveFrom)} – {periodEnd}</p><dl><div><dt>Source</dt><dd>{record.sourceReferenceId ?? record.source}</dd></div><div><dt>Reason</dt><dd>{record.reason}</dd></div><div><dt>Changed by</dt><dd>{record.createdByName}</dd></div><div><dt>Approved by</dt><dd>{record.approvedByName}</dd></div></dl></div></li>; })}</ol> : <Alert tone="info" title="No approved cost history">This Product does not yet have a canonical COGS record.</Alert>}
      <Alert tone="info" title="Effective-date rule">Historical profitability uses the cost effective on each transaction date. Scheduled and draft costs are never used early.</Alert>
      <div className="cogs-dialog-actions"><Button onClick={onClose}>Close</Button><Link className="ui-button primary default" href={`/o/${orgSlug}/products/${encodeURIComponent(row.id)}?tab=costs`}>Open Product Costs <ArrowRight size={15} /></Link></div>
    </div>
  </Drawer>;
}
