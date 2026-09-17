'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import { AlertTriangle, ArrowLeft, ArrowRight, Bot, Check, CheckCircle2, CircleDollarSign, Download, FileSpreadsheet, History, Link2, LockKeyhole, MoreHorizontal, Search, ShieldCheck, Sparkles, XCircle } from 'lucide-react';
import { useAnalysisContext } from '@/src/components/providers/analysis-context-provider';
import { AccessState } from '@/src/components/rbac/access';
import { ErrorState, PageSkeleton } from '@/src/components/states/states';
import { EnterpriseDataGrid, gridFeatures } from '@/src/components/tables/enterprise-data-grid';
import { PageHeader } from '@/src/components/product/patterns';
import { Button } from '@/src/components/ui/actions';
import { Alert, Badge, Spinner, useToast, type Tone } from '@/src/components/ui/feedback';
import { Field, SearchInput, Select, Textarea, UnambiguousDateInput as Input } from '@/src/components/ui/forms';
import { Breadcrumbs } from '@/src/components/ui/navigation';
import { ConfirmationDialog, DropdownMenu, Modal } from '@/src/components/ui/overlays';
import {
  COGS_TODAY,
  cogsChangeBps,
  importRowReady,
  summariseImportRows,
  type CogsColumnMapping,
  type CogsImportBatch,
  type CogsImportRow,
  type CogsMappedField,
  type CogsMatchType,
} from '@/src/domain/cogs';
import { formatDate, formatInteger, formatMoney, formatPercentage } from '@/src/domain/calculations';
import { useCogsAudit, useCogsBatch, useCogsWorkspace } from '@/src/services/hooks/use-cogs';

const columnHelper = createColumnHelper<typeof gridFeatures, CogsImportRow>();
const FIELD_LABELS: Record<CogsMappedField, string> = {
  internalSku: 'Internal SKU', marketplaceSku: 'Marketplace SKU', asin: 'ASIN', ean: 'EAN / barcode', title: 'Product title', unitCost: 'Unit cost', currency: 'Currency', effectiveDate: 'Effective date', company: 'Company',
};
const STAGES = [
  { id: 'mapping', label: 'Map columns' },
  { id: 'matching', label: 'Match Products' },
  { id: 'issues', label: 'Review issues' },
  { id: 'changes', label: 'Review changes' },
  { id: 'approval', label: 'Approve import' },
  { id: 'results', label: 'Results' },
] as const;

function toneForStatus(status: string): Tone {
  if (status === 'applied' || status === 'accepted' || status === 'exact' || status === 'manual') return 'positive';
  if (status === 'failed' || status === 'rejected' || status === 'unmatched') return 'negative';
  if (status === 'awaiting-approval' || status === 'suggested') return 'info';
  return 'warning';
}

function confidenceLabel(score?: number) {
  if (score === undefined) return 'No score';
  return `${score >= 85 ? 'High' : score >= 65 ? 'Medium' : 'Low'}, ${score}%`;
}

function previousDay(isoDate: string) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function effectiveRangeLabel(from?: string, exclusiveTo?: string | null) {
  if (!from) return '';
  return `${formatDate(from)} – ${exclusiveTo ? formatDate(previousDay(exclusiveTo)) : 'open ended'}`;
}

function displayStage(batch: CogsImportBatch) {
  if (batch.status === 'applied') return 'results' as const;
  if (batch.status === 'awaiting-approval') return 'approval' as const;
  if (batch.fileType === 'single' || batch.fileType === 'bulk' || batch.fileType === 'percentage') return 'changes' as const;
  return batch.stage === 'company' || batch.stage === 'upload' ? 'mapping' as const : batch.stage;
}

function downloadReviewRows(batch: CogsImportBatch) {
  const affected = batch.rows.filter((row) => row.matchType === 'unmatched' || row.anomalies.length);
  const escape = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const csv = ['Source row,Identifier,Title,Proposed cost,Currency,Effective date,Issues', ...affected.map((row) => [row.sourceRowNumber, row.sourceIdentifier, row.sourceTitle, row.proposedUnitCostMinor === undefined ? '' : (row.proposedUnitCostMinor / 100).toFixed(2), row.proposedCurrency ?? '', row.proposedEffectiveDate ?? '', row.anomalies.map((item) => item.label).join('; ')].map(escape).join(','))].join('\r\n');
  const href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = href; link.download = `${batch.id}-review-rows.csv`; link.click(); URL.revokeObjectURL(href);
}

export function CogsImportReviewPage({ importId }: { importId: string }) {
  const batch = useCogsBatch(importId);
  if (!batch.access.allowed) return <AccessState decision={batch.access} />;
  if (batch.query.isPending) return <PageSkeleton />;
  if (batch.query.isError) return <ErrorState title="COGS import could not be loaded" description="The persisted batch remains unchanged. Retry this company-safe request." onRetry={() => { void batch.query.refetch(); }} />;
  if (!batch.query.data) return <ErrorState title="COGS import not found" description="This import does not exist or is outside your Company assignment." />;
  return <LoadedImportReview key={batch.query.data.id} batch={batch.query.data} actions={batch} />;
}

function LoadedImportReview({ batch, actions }: { batch: CogsImportBatch; actions: ReturnType<typeof useCogsBatch> }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { workspace } = useAnalysisContext();
  const products = useCogsWorkspace({ pageSize: 1 });
  const audit = useCogsAudit();
  const { showToast } = useToast();
  const canOpenApproval = actions.permissions.canImport || actions.permissions.canEdit || actions.permissions.canApprove;
  const [section, setSection] = useState<(typeof STAGES)[number]['id']>(() => {
    const initial = displayStage(batch);
    return initial === 'approval' && !canOpenApproval ? 'issues' : initial;
  });
  const [mapping, setMapping] = useState<CogsColumnMapping[]>(() => batch.mapping.map((item) => ({ ...item })));
  const [batchCurrency, setBatchCurrency] = useState(batch.batchCurrency ?? '');
  const [batchDate, setBatchDate] = useState(batch.batchEffectiveDate ?? '');
  const [reason, setReason] = useState(batch.reason);
  const [note, setNote] = useState(batch.note.startsWith('scenario:') || batch.note.startsWith('direct:') ? '' : batch.note);
  const [matchFilter, setMatchFilter] = useState<CogsMatchType | 'all'>(() => {
    const value = searchParams.get('status');
    return value === 'exact' || value === 'suggested' || value === 'manual' || value === 'unmatched' ? value : 'all';
  });
  const [anomalyOnly, setAnomalyOnly] = useState(searchParams.get('anomaly') === 'all');
  const [reviewFilter, setReviewFilter] = useState<'all' | 'pending' | 'accepted' | 'rejected'>('all');
  const [manualRowId, setManualRowId] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [operationError, setOperationError] = useState('');
  const [applyStage, setApplyStage] = useState('');
  const immutable = batch.status === 'applied' || batch.status === 'cancelled';
  const canPrepare = (actions.permissions.canImport || actions.permissions.canEdit) && !immutable;
  const company = actions.companies.find((candidate) => candidate.id === batch.companyId);
  const counts = summariseImportRows(batch.rows);
  const readyRows = batch.rows.filter(importRowReady);
  const pendingRows = batch.rows.filter((row) => row.reviewStatus === 'pending');
  const blockingRows = batch.rows.filter((row) => row.reviewStatus !== 'rejected' && row.anomalies.some((item) => item.blocking));
  const warningRows = batch.rows.filter((row) => row.reviewStatus !== 'rejected' && row.anomalies.some((item) => item.severity === 'warning'));
  const groupOverrideRows = batch.rows.filter((row) => row.reviewStatus !== 'rejected' && row.inheritedGroupId);
  const filteredRows = batch.rows.filter((row) => (matchFilter === 'all' || row.matchType === matchFilter) && (!anomalyOnly || row.anomalies.length) && (reviewFilter === 'all' || row.reviewStatus === reviewFilter));
  const manualRow = batch.rows.find((row) => row.id === manualRowId) ?? null;
  const candidateProducts = (products.query.data?.allRows ?? []).filter((row) => row.product.ownerCompanyId === batch.companyId && [row.product.title, row.product.internalSku, ...row.product.listings.flatMap((listing) => [listing.marketplaceSku, listing.asin])].some((value) => value?.toLocaleLowerCase('en-GB').includes(productSearch.toLocaleLowerCase('en-GB'))));
  const orgSlug = workspace.organisation.slug;
  const productIds = new Set(batch.rows.map((row) => row.proposedProductId).filter(Boolean));
  const batchAudit = (audit.query.data ?? []).filter((event) => event.target.id === batch.id || productIds.has(event.target.id)).slice(0, 8);

  function updateFilter(nextMatch: CogsMatchType | 'all', anomalies = anomalyOnly) {
    setMatchFilter(nextMatch); setAnomalyOnly(anomalies);
    const next = new URLSearchParams(searchParams.toString());
    if (nextMatch === 'all') next.delete('status'); else next.set('status', nextMatch);
    if (anomalies) next.set('anomaly', 'all'); else next.delete('anomaly');
    router.replace(`${window.location.pathname}${next.size ? `?${next}` : ''}`, { scroll: false });
  }

  async function saveMapping() {
    setOperationError('');
    try {
      await actions.updateMapping(mapping, batchCurrency || undefined, batchDate || undefined);
      await actions.updateDetails({ stage: 'matching' });
      setSection('matching'); showToast('Columns re-analysed. Product matches remain Company-scoped.', 'positive');
    } catch (caught) { setOperationError(caught instanceof Error ? caught.message : 'Column mapping could not be saved.'); }
  }

  async function reviewRow(rowId: string, status: 'accepted' | 'rejected') {
    setOperationError('');
    try { await actions.reviewRow(rowId, status); showToast(status === 'accepted' ? 'Row accepted for import-level review.' : 'Row rejected and will be skipped.', status === 'accepted' ? 'positive' : 'warning'); }
    catch (caught) { setOperationError(caught instanceof Error ? caught.message : 'The row could not be reviewed.'); }
  }

  async function chooseProduct(productId: string) {
    if (!manualRow) return;
    try { await actions.manualMatch(manualRow.id, productId); setManualRowId(null); setProductSearch(''); showToast('Manual company-owned Product match saved.', 'positive'); }
    catch (caught) { setOperationError(caught instanceof Error ? caught.message : 'The manual match could not be saved.'); }
  }

  async function submit() {
    try { await actions.updateDetails({ reason: reason.trim(), note: note.trim(), stage: 'approval' }); await actions.submitForApproval(); showToast('Import submitted for approval. No financial data changed.', 'info'); }
    catch (caught) { setOperationError(caught instanceof Error ? caught.message : 'The import could not be submitted.'); }
  }

  async function apply() {
    setOperationError('');
    try {
      setApplyStage('Applying');
      if (canPrepare) await actions.updateDetails({ reason: reason.trim(), note: note.trim(), stage: 'approval' });
      await new Promise((resolve) => window.setTimeout(resolve, 220));
      setApplyStage('Recalculating');
      await new Promise((resolve) => window.setTimeout(resolve, 220));
      await actions.applyBatch();
      setApplyStage('Applied');
      setSection('results');
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => window.setTimeout(resolve, 120)));
      showToast('Import approved and applied atomically.', 'positive');
      setApplyStage('');
    } catch (caught) { setApplyStage(''); setOperationError(caught instanceof Error ? caught.message : 'Apply failed. The atomic batch was rolled back.'); }
  }

  const columns = useMemo(() => columnHelper.columns([
    columnHelper.accessor('sourceRowNumber', { id: 'sourceRow', header: 'Row', size: 66, cell: ({ getValue }) => <span className="mono muted">{getValue()}</span> }),
    columnHelper.accessor('sourceIdentifier', { id: 'identifier', header: 'Source identifier', size: 150, cell: ({ row }) => <span><strong className="mono">{row.original.sourceIdentifier}</strong>{row.original.sourceTitle ? <small>{row.original.sourceTitle}</small> : null}</span> }),
    columnHelper.accessor('proposedProductTitle', { id: 'matchedProduct', header: 'Matched Product', size: 230, cell: ({ row }) => row.original.proposedProductId ? <Link className="cogs-match-product" href={`/o/${orgSlug}/products/${encodeURIComponent(row.original.proposedProductId)}?tab=costs`}><strong>{row.original.proposedProductTitle}</strong><small>{row.original.proposedProductSku}</small></Link> : canPrepare ? <Button size="compact" onClick={() => setManualRowId(row.original.id)}><Search size={13} /> Choose Product</Button> : <Badge tone="neutral">Unmatched</Badge> }),
    columnHelper.accessor('matchType', { id: 'matchStatus', header: 'Match', size: 125, cell: ({ row }) => <span className="cogs-match-status"><Badge tone={toneForStatus(row.original.matchType)}>{row.original.matchType}</Badge><small title="Based on deterministic identifiers, then Product-title similarity.">{confidenceLabel(row.original.matchConfidence)}</small></span> }),
    columnHelper.accessor('currentUnitCostMinor', { id: 'currentCogs', header: 'Cost on date', size: 140, cell: ({ row }) => row.original.currentUnitCostMinor == null ? 'Missing' : <span className="cogs-match-status"><strong>{formatMoney(row.original.currentUnitCostMinor, row.original.currentCurrency ?? 'GBP')}</strong>{row.original.comparisonEffectiveFrom ? <small>{row.original.comparisonDisposition === 'superseded' ? 'Record will be superseded' : effectiveRangeLabel(row.original.comparisonEffectiveFrom, row.original.comparisonEffectiveTo)}</small> : null}</span> }),
    columnHelper.accessor('proposedUnitCostMinor', { id: 'proposedCogs', header: 'Proposed COGS', size: 125, cell: ({ row }) => row.original.proposedUnitCostMinor === undefined ? <Badge tone="negative">Invalid</Badge> : <strong>{formatMoney(row.original.proposedUnitCostMinor, row.original.proposedCurrency ?? 'GBP')}</strong> }),
    columnHelper.accessor((row) => cogsChangeBps(row.currentUnitCostMinor, row.proposedUnitCostMinor), { id: 'change', header: 'Change', size: 85, cell: ({ getValue }) => getValue() === null ? '—' : <span className={(getValue() as number) > 0 ? 'delta negative' : 'delta positive'}>{formatPercentage(getValue() as number, { signed: true })}</span> }),
    columnHelper.accessor('proposedCurrency', { id: 'currency', header: 'Currency', size: 82, cell: ({ getValue }) => getValue() ?? '—' }),
    columnHelper.accessor('proposedEffectiveDate', { id: 'effectiveDate', header: 'Effective range', size: 155, cell: ({ row }) => row.original.proposedEffectiveDate ? <span className="cogs-match-status"><strong>{formatDate(row.original.proposedEffectiveDate)}</strong><small>{effectiveRangeLabel(row.original.proposedEffectiveDate, row.original.projectedEffectiveTo)}</small></span> : <Badge tone="negative">Required</Badge> }),
    columnHelper.accessor((row) => row.anomalies.length, { id: 'anomaly', header: 'Issues', size: 170, cell: ({ row }) => row.original.anomalies.length ? <span className="cogs-row-anomalies"><Badge tone={row.original.anomalies.some((item) => item.blocking) ? 'negative' : 'warning'}>{row.original.anomalies[0].label}</Badge>{row.original.anomalies.length > 1 ? <small>+{row.original.anomalies.length - 1} more</small> : <small>{row.original.anomalies[0].detail}</small>}</span> : <Badge tone="positive">No issues</Badge> }),
    columnHelper.accessor('reviewStatus', { id: 'reviewStatus', header: 'Review', size: 110, cell: ({ getValue }) => <Badge tone={toneForStatus(getValue())}>{getValue()}</Badge> }),
  ]), [canPrepare, orgSlug]);

  return <div id="cogs-import-review" className="cogs-import-page cogs-review-page">
    <Breadcrumbs items={[{ label: workspace.organisation.name, href: `/o/${orgSlug}/dashboard` }, { label: 'COGS', href: `/o/${orgSlug}/cogs` }, { label: 'Imports', href: `/o/${orgSlug}/cogs/import?view=history` }, { label: batch.id }]} />
    <PageHeader eyebrow="Governed import review" title={batch.fileName} description={`${company?.name ?? batch.companyId} · ${formatInteger(batch.rowCount)} source rows · prepared by ${batch.createdByName}`} actions={<div className="cogs-header-actions"><Badge tone={toneForStatus(batch.status)}>{batch.status.replaceAll('-', ' ')}</Badge><Link className="ui-button secondary compact" href={`/o/${orgSlug}/cogs`}><ArrowLeft size={14} /> COGS workspace</Link></div>} />
    <ol className="cogs-import-stepper review" aria-label="Import review steps">{STAGES.map((stage, index) => { const activeIndex = STAGES.findIndex((candidate) => candidate.id === section); return <li key={stage.id} className={index < activeIndex ? 'complete' : undefined} aria-current={stage.id === section ? 'step' : undefined}><button type="button" disabled={(stage.id === 'results' && batch.status !== 'applied') || (stage.id === 'approval' && !canOpenApproval)} onClick={() => setSection(stage.id)}><span>{index < activeIndex ? <Check size={12} /> : index + 1}</span><strong>{stage.label}</strong></button></li>; })}</ol>
    <section className="cogs-batch-summary"><article><FileSpreadsheet size={17} /><span><small>Source</small><strong>{batch.fileType.toUpperCase()}</strong><em>{batch.fileSize ? `${Math.max(1, Math.round(batch.fileSize / 1024))} KB` : 'Direct proposal'}</em></span></article><article><LockKeyhole size={17} /><span><small>Company scope</small><strong>{company?.name ?? batch.companyId}</strong><em>Locked for matching</em></span></article><article><History size={17} /><span><small>Created</small><strong>{formatDate(batch.createdAt)}</strong><em>{batch.createdByName}</em></span></article><article><ShieldCheck size={17} /><span><small>Approval</small><strong>{batch.approvedByName ?? (batch.status === 'awaiting-approval' ? 'Awaiting approver' : 'Not yet approved')}</strong><em>{batch.approvedAt ? formatDate(batch.approvedAt) : 'Human approval required'}</em></span></article></section>
    {batch.duplicateOfBatchId ? <Alert tone="warning" title="Possible duplicate import">The same parsed source content already exists in batch {batch.duplicateOfBatchId}. Review before proceeding; nothing is applied automatically.</Alert> : null}
    {batch.failureMessage ? <Alert tone="negative" title={batch.status === 'needs-review' ? 'Review must be refreshed' : 'Atomic apply failed'}>{batch.failureMessage}</Alert> : null}

    {section === 'mapping' ? <section className="cogs-review-section"><header><div><span className="eyebrow">Copilot column analysis</span><h2>Confirm every source mapping</h2><p>Suggestions describe likely meaning only. Copilot never invents a cost or chooses a random numeric column.</p></div><Badge tone={canPrepare ? 'info' : 'neutral'}><Sparkles size={12} /> {canPrepare ? 'Human override available' : 'Read-only review'}</Badge></header><div className="cogs-mapping-grid">{mapping.map((item) => <article key={item.field}><div><span>{FIELD_LABELS[item.field]}</span><Badge tone={item.sourceColumn ? item.confidence >= 95 ? 'positive' : 'info' : item.field === 'unitCost' ? 'negative' : 'neutral'}>{item.sourceColumn ? `${item.confidence}% confidence` : 'Not detected'}</Badge></div>{canPrepare ? <Field label="Source column"><Select value={item.sourceColumn ?? ''} disabled={immutable} onChange={(event) => setMapping((current) => current.map((candidate) => candidate.field === item.field ? { ...candidate, sourceColumn: event.target.value || null, confidence: 100, detectedBy: 'manual' } : candidate))}><option value="">Not mapped</option>{batch.headers.map((header) => <option key={header}>{header}</option>)}</Select></Field> : <dl className="cogs-review-list"><div><dt>Source column</dt><dd>{item.sourceColumn ?? 'Not mapped'}</dd></div></dl>}<small>{item.detectedBy === 'manual' ? 'Selected by reviewer' : item.sourceColumn ? `Copilot interpreted “${item.sourceColumn}” as ${FIELD_LABELS[item.field]}.` : `No reliable ${FIELD_LABELS[item.field].toLocaleLowerCase('en-GB')} column found.`}</small></article>)}</div>{canPrepare ? <div className="cogs-batch-defaults"><Field label="Batch currency" hint="Required only when no currency column is mapped."><Select value={batchCurrency} disabled={immutable} onChange={(event) => setBatchCurrency(event.target.value)}><option value="">Do not assume</option><option>GBP</option><option>EUR</option><option>USD</option></Select></Field><Field label="Batch effective date" hint={batchDate ? `Required only when no effective-date column is mapped. Shown as ${formatDate(batchDate)}.` : 'Required only when no effective-date column is mapped.'}><Input type="date" value={batchDate} disabled={immutable} onChange={(event) => setBatchDate(event.target.value)} /></Field></div> : <dl className="cogs-review-list"><div><dt>Batch currency</dt><dd>{batchCurrency || 'Not set'}</dd></div><div><dt>Batch effective date</dt><dd>{batchDate ? formatDate(batchDate) : 'Not set'}</dd></div></dl>}{!mapping.some((item) => item.field === 'unitCost' && item.sourceColumn) ? <Alert tone="negative" title="No reliable cost column detected">Choose the source cost column before matching. Copilot will not guess.</Alert> : null}{operationError ? <Alert tone="negative" title="Mapping could not be saved">{operationError}</Alert> : null}<div className="cogs-dialog-actions"><Link className="ui-button secondary default" href={`/o/${orgSlug}/cogs/import`}>Back to imports</Link>{canPrepare ? <Button variant="primary" disabled={immutable || !mapping.some((item) => item.field === 'unitCost' && item.sourceColumn)} onClick={() => { void saveMapping(); }}>Analyse and match Products <ArrowRight size={15} /></Button> : null}</div></section> : null}

    {section !== 'mapping' && section !== 'approval' && section !== 'results' ? <>
      <section className="cogs-import-review-summary" aria-label="Import review summary"><button type="button" className={matchFilter === 'all' && !anomalyOnly ? 'active' : undefined} onClick={() => updateFilter('all', false)}><small>Rows analysed</small><strong>{counts.rowCount}</strong></button><button type="button" className={matchFilter === 'exact' ? 'active' : undefined} onClick={() => updateFilter('exact', false)}><small>Exact matches</small><strong>{batch.rows.filter((row) => row.matchType === 'exact').length}</strong></button><button type="button" className={matchFilter === 'suggested' ? 'active' : undefined} onClick={() => updateFilter('suggested', false)}><small>Suggested</small><strong>{counts.suggestedCount}</strong></button><button type="button" className={matchFilter === 'unmatched' ? 'active' : undefined} onClick={() => updateFilter('unmatched', false)}><small>Unmatched</small><strong>{counts.unmatchedCount}</strong></button><button type="button" className={anomalyOnly ? 'active' : undefined} onClick={() => updateFilter('all', true)}><small>Anomalies</small><strong>{counts.anomalyCount}</strong></button><button type="button" onClick={() => { setReviewFilter('accepted'); updateFilter('all', false); }}><small>Ready to apply</small><strong>{readyRows.length}</strong></button></section>
      <div className="cogs-review-toolbar"><div><Select aria-label="Review status filter" value={reviewFilter} onChange={(event) => setReviewFilter(event.target.value as typeof reviewFilter)}><option value="all">All review states</option><option value="pending">Pending review</option><option value="accepted">Accepted</option><option value="rejected">Rejected</option></Select>{canPrepare ? <Button size="compact" onClick={() => { void actions.acceptSafeExact().then(() => showToast('Safe exact matches accepted for review. Import approval is still required.', 'positive')).catch((caught) => setOperationError(caught instanceof Error ? caught.message : String(caught))); }}><CheckCircle2 size={14} /> Accept exact with no anomalies</Button> : null}</div><Button size="compact" onClick={() => downloadReviewRows(batch)}><Download size={14} /> Export unmatched / issues</Button></div>
      <EnterpriseDataGrid data={filteredRows} columns={columns} ariaLabel="COGS import matching and anomaly review" initialPinnedColumns={['sourceRow', 'identifier', 'matchedProduct']} responsivePriorityColumns={['identifier', 'matchedProduct', 'proposedCogs', 'anomaly', 'reviewStatus', 'actions']} searchPlaceholder="Search imported rows" virtualize renderRowActions={canPrepare ? (row) => <DropdownMenu label={<MoreHorizontal size={16} />} accessibleLabel={`Review source row ${row.sourceRowNumber}`} items={[
        { label: row.proposedProductId ? 'Choose different Product' : 'Choose Product', disabled: !canPrepare, onSelect: canPrepare ? () => setManualRowId(row.id) : undefined },
        { label: row.inheritedGroupId && !row.groupOverrideAcknowledged ? 'Acknowledge override and accept' : 'Accept row', disabled: !canPrepare || row.anomalies.some((item) => item.blocking), onSelect: canPrepare ? () => { void reviewRow(row.id, 'accepted'); } : undefined },
        { label: 'Reject / ignore row', disabled: !canPrepare, danger: true, onSelect: canPrepare ? () => { void reviewRow(row.id, 'rejected'); } : undefined },
      ]} /> : undefined} />
      {groupOverrideRows.length ? <section className="cogs-group-override-review" aria-label="Product Group override acknowledgements"><header><div><span className="eyebrow">Product Group inheritance</span><h3>Explicit acknowledgement required</h3><p>An individual Product cost has higher precedence from its effective date. Group membership remains intact for analytics.</p></div><Badge tone="warning">{groupOverrideRows.filter((row) => !row.groupOverrideAcknowledged).length} require acknowledgement</Badge></header>{groupOverrideRows.map((row) => <article key={row.id}><Alert tone="warning" title={`${row.proposedProductSku ?? 'Product'} · ${row.inheritedGroupName}`}>{row.anomalies.find((item) => item.code === 'group_inheritance_override')?.detail}</Alert><div><span>Inherited cost <strong>{formatMoney(row.currentUnitCostMinor ?? null, row.currentCurrency ?? 'GBP')}</strong></span><span>Pack Quantity <strong>{formatInteger(row.inheritedPackQuantity ?? 0)}</strong></span>{row.groupOverrideAcknowledged ? <Badge tone="positive"><CheckCircle2 size={12} /> Acknowledged</Badge> : canPrepare ? <Button size="compact" disabled={row.anomalies.some((item) => item.blocking)} onClick={() => { void reviewRow(row.id, 'accepted'); }}><ShieldCheck size={14} /> Acknowledge override and accept</Button> : <Badge tone="warning">Awaiting reviewer</Badge>}</div></article>)}</section> : null}
      {operationError ? <Alert tone="negative" title="Review action failed">{operationError}</Alert> : null}
      <section className="cogs-review-findings"><div className="cogs-copilot-findings"><header><Bot size={18} /><div><span className="eyebrow">Copilot findings</span><h3>{counts.anomalyCount} rows may need review</h3></div></header><p>Copilot surfaced patterns and deterministic match evidence. It did not change source values, create costs, accept rows or approve the import.</p><ul><li><AlertTriangle size={13} /> {blockingRows.length} rows contain blocking validation errors.</li><li><Sparkles size={13} /> {counts.suggestedCount} title-based suggestions need a human decision.</li><li><History size={13} /> {batch.rows.filter((row) => row.anomalies.some((item) => item.code === 'backdated_date')).length} backdated rows may recalculate historical profitability.</li></ul></div><div className="cogs-review-readiness"><span className="eyebrow">Validation summary</span><h3>{pendingRows.length ? `${pendingRows.length} rows require attention` : `${readyRows.length} changes are ready for approval`}</h3><dl><div><dt>Blocking errors</dt><dd>{blockingRows.length}</dd></div><div><dt>Warnings to acknowledge</dt><dd>{warningRows.length}</dd></div><div><dt>Rejected / skipped</dt><dd>{batch.rows.filter((row) => row.reviewStatus === 'rejected').length}</dd></div></dl>{canPrepare || actions.permissions.canApprove ? <Button variant="primary" disabled={!readyRows.length || Boolean(pendingRows.length)} onClick={() => { setSection('approval'); if (canPrepare) void actions.updateDetails({ stage: 'approval' }); }}>Review financial approval <ArrowRight size={15} /></Button> : <Badge tone="neutral">Read only</Badge>}</div></section>
    </> : null}

    {section === 'approval' ? <section className="cogs-review-section cogs-approval-section"><header><div><span className="eyebrow">Human financial approval</span><h2>{batch.status === 'awaiting-approval' ? 'Awaiting authorised approval' : `Approve ${readyRows.length} proposed COGS changes`}</h2><p>Only this explicit action creates canonical records, adjusts effective ranges and recalculates profitability.</p></div><LockKeyhole size={22} /></header><div className="cogs-approval-grid"><div><h3>Batch governance</h3><dl className="cogs-review-list"><div><dt>Prepared by</dt><dd>{batch.createdByName}</dd></div><div><dt>Approver</dt><dd>{actions.permissions.canApprove ? actions.actor.name : 'A user with cogs.approve'}</dd></div><div><dt>Company</dt><dd>{company?.name}</dd></div><div><dt>Ready rows</dt><dd>{readyRows.length}</dd></div><div><dt>Backdated</dt><dd>{batch.rows.filter((row) => row.anomalies.some((item) => item.code === 'backdated_date')).length}</dd></div><div><dt>Scheduled</dt><dd>{batch.rows.filter((row) => (row.proposedEffectiveDate ?? '') > COGS_TODAY).length}</dd></div></dl><Field label="Batch reason" hint="Inherited by rows without a reason and stored in Audit."><Textarea value={reason} disabled={immutable || !canPrepare} rows={3} onChange={(event) => setReason(event.target.value)} /></Field><Field label="Import note" hint="Optional operational context; source rows remain unchanged."><Textarea value={note} disabled={immutable || !canPrepare} rows={2} onChange={(event) => setNote(event.target.value)} /></Field></div><div className="cogs-impact-preview"><span className="eyebrow">Preview · not yet applied</span><h3>Expected operational impact</h3><div><article><small>Records created</small><strong>{readyRows.length}</strong></article><article><small>Historical ranges</small><strong>{batch.rows.filter((row) => (row.proposedEffectiveDate ?? COGS_TODAY) <= COGS_TODAY && row.currentUnitCostMinor !== null).length}</strong></article><article><small>Products recalculated</small><strong>{new Set(readyRows.map((row) => row.proposedProductId)).size}</strong></article><article><small>Rows skipped</small><strong>{batch.rows.filter((row) => row.reviewStatus === 'rejected').length}</strong></article></div><Alert tone="info" title="Atomic all-or-nothing apply">If record creation or profitability recalculation fails, zero approved records are committed.</Alert>{!actions.permissions.canApprove ? <Alert tone="warning" title="Your role cannot approve">Submit this reviewed batch. Switch to Finance or Organisation Admin to demonstrate independent approval.</Alert> : batch.createdByUserId !== actions.actor.id ? <Alert tone="positive" title="Separation of duties">Prepared by {batch.createdByName}; approval will be attributed to {actions.actor.name}.</Alert> : <Alert tone="info" title="Approval identity">Approval will be attributed to {actions.actor.name} and recorded separately from preparation.</Alert>}</div></div>{applyStage ? <div className="cogs-apply-progress" role="status" aria-live="polite"><Spinner label={applyStage} /><span><strong>{applyStage}</strong><small>Controls are disabled while the atomic workflow is running.</small></span></div> : null}{operationError ? <Alert tone="negative" title="Approval could not complete">{operationError}</Alert> : null}<div className="cogs-dialog-actions"><Button onClick={() => setSection('issues')} disabled={Boolean(applyStage)}>Back to issues</Button>{canPrepare && !immutable && batch.status !== 'awaiting-approval' && !actions.permissions.canApprove ? <Button variant="primary" disabled={!readyRows.length || Boolean(pendingRows.length)} onClick={() => { void submit(); }}>Submit for approval <ArrowRight size={15} /></Button> : null}{!immutable && actions.permissions.canApprove ? <Button variant="primary" loading={Boolean(applyStage)} disabled={!readyRows.length || Boolean(pendingRows.length)} onClick={() => { void apply(); }}><ShieldCheck size={15} /> Approve and apply</Button> : null}</div></section> : null}

    {section === 'results' && batch.status === 'applied' && batch.result ? <section className="cogs-review-section cogs-results-section"><header><div><span className="eyebrow">Atomic apply completed</span><h2>COGS approved and profitability recalculated</h2><p>Canonical Product cost history and all dependent analytical projections now share the same approved state.</p></div><span className="cogs-result-icon"><CheckCircle2 size={26} /></span></header><div className="cogs-results-metrics"><article><small>Records created</small><strong>{batch.result.recordsCreated}</strong><span>Approved COGS records</span></article><article><small>Ranges adjusted</small><strong>{batch.result.historicalRangesAdjusted}</strong><span>No overlapping periods</span></article><article><small>Backdated Products</small><strong>{batch.result.backdatedProductsRecalculated}</strong><span>Historical profit recalculated</span></article><article><small>Scheduled costs</small><strong>{batch.result.futureCostsScheduled}</strong><span>Excluded until effective</span></article></div><div className="cogs-before-after"><div><span className="eyebrow">Before</span><strong>{formatPercentage(batch.result.before.productCoverageBps)}</strong><small>Product COGS coverage</small><strong>{formatPercentage(batch.result.before.profitabilityCoverageBps)}</strong><small>Revenue-weighted profit coverage</small>{batch.result.before.knownNetProfitMinor !== null ? <em>{formatMoney(batch.result.before.knownNetProfitMinor, 'GBP')} known net profit</em> : null}</div><ArrowRight size={21} /><div className="after"><span className="eyebrow">After</span><strong>{formatPercentage(batch.result.after.productCoverageBps)}</strong><small>Product COGS coverage</small><strong>{formatPercentage(batch.result.after.profitabilityCoverageBps)}</strong><small>Revenue-weighted profit coverage</small>{batch.result.after.knownNetProfitMinor !== null ? <em>{formatMoney(batch.result.after.knownNetProfitMinor, 'GBP')} known net profit</em> : null}</div></div><div className="cogs-result-actions"><Link className="ui-button primary default" href={`/o/${orgSlug}/dashboard`}>Open updated Dashboard <ArrowRight size={15} /></Link><Link className="ui-button secondary default" href={`/o/${orgSlug}/cogs`}>View current COGS</Link>{readyRows[0]?.proposedProductId ? <Link className="ui-button secondary default" href={`/o/${orgSlug}/products/${encodeURIComponent(readyRows[0].proposedProductId)}?tab=costs`}>Inspect Product history</Link> : null}</div>{batchAudit.length ? <div className="cogs-audit-excerpt"><header><History size={17} /><div><span className="eyebrow">Immutable audit excerpt</span><h3>Approval and Product changes</h3></div></header>{batchAudit.map((event) => <article key={event.id}><span className="activity-marker"><CircleDollarSign size={13} /></span><div><strong>{event.action.replaceAll('.', ' ')}</strong><small>{formatDate(event.occurredAt)} · actor {event.actor.type === 'user' ? event.actor.userId : event.actor.systemId}</small><p>{event.reason ?? 'Governed COGS import operation'}</p></div><Badge tone="positive">Read only</Badge></article>)}</div> : null}</section> : null}

    {!immutable ? <div className="cogs-import-footer"><span><ShieldCheck size={14} /> Draft proposals are excluded from Product and Dashboard profitability.</span>{canPrepare ? <ConfirmationDialog trigger={<Button variant="ghost" size="compact"><XCircle size={14} /> Cancel import</Button>} title="Cancel this COGS import?" description="The parsed batch will remain in history as Cancelled. No canonical COGS records will be created." confirmLabel="Cancel import" onConfirm={() => { void actions.cancelBatch().then(() => showToast('Import cancelled. Approved costs remain unchanged.', 'warning')).catch((caught) => setOperationError(caught instanceof Error ? caught.message : String(caught))); }} /> : <Badge tone="neutral">Read only</Badge>}</div> : null}

    {manualRow ? <Modal open onOpenChange={(next) => { if (!next) { setManualRowId(null); setProductSearch(''); } }} title="Choose company-owned Product" description={`Manual match for source row ${manualRow.sourceRowNumber}. Only ${company?.name ?? 'the selected Company'} Products are available.`}><div className="cogs-manual-match"><SearchInput autoFocus aria-label="Search authorised Products" placeholder="Search title, internal SKU or marketplace SKU" value={productSearch} onChange={(event) => setProductSearch(event.target.value)} /><div className="cogs-manual-match-source"><span><small>Source identifier</small><strong className="mono">{manualRow.sourceIdentifier}</strong></span><span><small>Source title</small><strong>{manualRow.sourceTitle || '—'}</strong></span></div><div className="cogs-product-picker">{candidateProducts.slice(0, 12).map((row) => <button type="button" key={row.id} onClick={() => { void chooseProduct(row.id); }}><span><strong>{row.product.title}</strong><small>{row.product.internalSku} · {row.companyName}</small><em>{row.product.marketplaces.join(' · ')}</em></span><Link2 size={15} /></button>)}{!candidateProducts.length ? <Alert tone="info" title="No authorised Products match">Try a Product title, internal SKU or marketplace SKU. New Products cannot be created in this flow.</Alert> : null}</div><div className="cogs-dialog-actions"><Button onClick={() => { setManualRowId(null); setProductSearch(''); }}>Cancel</Button></div></div></Modal> : null}
  </div>;
}
