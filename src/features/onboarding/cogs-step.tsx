'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileSpreadsheet,
  Grid3X3,
  PencilLine,
  Sparkles,
  ClipboardPaste,
} from 'lucide-react';
import type { CostImportPreviewRow, OnboardingProduct } from '@/src/domain/onboarding';
import { useOnboarding } from '@/src/components/providers/onboarding-provider';
import { Button } from '@/src/components/ui/actions';
import { Checkbox, Field, Input, Select, Textarea } from '@/src/components/ui/forms';
import { Alert, Badge, Skeleton, useToast } from '@/src/components/ui/feedback';
import { ConfirmationDialog } from '@/src/components/ui/overlays';
import { EnterpriseDataGrid, type GridColumn } from '@/src/components/tables/enterprise-data-grid';

type CogsMethod = 'import' | 'bulk' | 'paste' | 'single';

const METHODS: Array<{ id: CogsMethod; title: string; description: string; recommended?: boolean; icon: typeof FileSpreadsheet }> = [
  { id: 'import', title: 'Import CSV / Excel', description: 'Preview matches and approve safe rows.', recommended: true, icon: FileSpreadsheet },
  { id: 'bulk', title: 'Bulk edit', description: 'Enter costs for several products in a compact grid.', icon: Grid3X3 },
  { id: 'paste', title: 'Paste from Excel', description: 'Paste SKU, cost and effective-date rows.', icon: ClipboardPaste },
  { id: 'single', title: 'Add individually', description: 'Set one effective-dated product cost.', icon: PencilLine },
];

const IMPORT_STAGES = ['Choose file', 'Read spreadsheet', 'Detect columns', 'Preview matches', 'Review', 'Apply'];
const DEFAULT_DATE = '2026-08-29';

function formatCount(value: number) {
  return new Intl.NumberFormat('en-GB').format(value);
}

function formatCost(minor: number | null) {
  return minor === null ? '—' : new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(minor / 100);
}

function StepHeading() {
  return <header className="onboarding-step-heading"><p className="eyebrow">COGS readiness</p><h1>Add acquisition cost separately</h1><p>Marketplace revenue and fees are available. Net profitability remains incomplete until product costs are approved.</p></header>;
}

function CoverageSummary({ products, complete, missing, coverage }: { products: number; complete: number; missing: number; coverage: number }) {
  return <section className="cogs-coverage-panel" aria-label="COGS coverage summary"><div><small>Products imported</small><strong>{formatCount(products)}</strong><span>Normalised internal products</span></div><div><small>COGS complete</small><strong>{formatCount(complete)}</strong><span>Effective cost on record</span></div><div><small>COGS missing</small><strong>{formatCount(missing)}</strong><span>Still needs attention</span></div><div className="coverage-metric"><small>Coverage</small><strong>{coverage}%</strong><progress value={coverage} max={100} aria-label={`COGS coverage ${coverage}%`} /></div></section>;
}

function ImportFlow({ products }: { products: OnboardingProduct[] }) {
  const { showToast } = useToast();
  const { snapshot, costPreview, pendingAction, previewCostImport, applyCostImport, discardCostImport } = useOnboarding();
  const [stage, setStage] = useState(0);
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState('');

  const columns = useMemo<GridColumn<CostImportPreviewRow>[]>(() => [
    { id: 'sku', accessorKey: 'sku', header: 'SKU', cell: ({ row }) => <span className="mono-cell">{row.original.sku}</span>, size: 130 },
    { id: 'product', accessorKey: 'productName', header: 'Product', size: 240 },
    { id: 'cost', accessorKey: 'unitCostMinor', header: 'Unit cost', cell: ({ row }) => formatCost(row.original.unitCostMinor), size: 110 },
    { id: 'effective', accessorKey: 'effectiveFrom', header: 'Effective date', size: 120 },
    { id: 'match', accessorKey: 'matchStatus', header: 'Match', cell: ({ row }) => <Badge tone={row.original.matchStatus === 'exact' ? 'positive' : row.original.matchStatus === 'suggested' ? 'warning' : 'negative'}>{row.original.matchStatus}{row.original.confidence ? ` ${Math.round(row.original.confidence * 100)}%` : ''}</Badge>, size: 120 },
    { id: 'review', accessorKey: 'anomaly', header: 'Review', cell: ({ row }) => row.original.anomaly ? <span className="negative-text">{row.original.anomaly}</span> : 'Ready', size: 150 },
  ], []);

  async function chooseMockFile() {
    setError('');
    setStage(1);
    try {
      const preview = await previewCostImport({ file: { name: 'initial-product-costs.xlsx', size: 82_440, mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } });
      setStage(4);
      showToast(`${preview.fileName} analysed`, 'info');
    } catch (previewError) {
      setStage(0);
      setError(previewError instanceof Error ? previewError.message : 'The spreadsheet could not be read.');
    }
  }

  async function apply() {
    if (!costPreview || !snapshot?.session.ownerUserId || !approved) return;
    setError('');
    try {
      const visibleSafeRows = costPreview.rows.filter((row) => row.matchStatus === 'exact' && !row.anomaly && row.productId && row.unitCostMinor && row.unitCostMinor > 0).map((row) => row.id);
      await applyCostImport({ previewId: costPreview.id, approvedRowIds: visibleSafeRows, approveAllExactMatches: true, changedByUserId: snapshot.session.ownerUserId });
      setStage(5);
      showToast('COGS import applied');
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : 'The approved cost rows could not be applied.');
    }
  }

  return (
    <section className="cogs-method-panel" aria-labelledby="import-title">
      <header className="onboarding-section-heading"><div><h2 id="import-title">Initial spreadsheet import</h2><p>A representative preview demonstrates column detection and human approval.</p></div><Badge tone="info">Lightweight prototype</Badge></header>
      <ol className="import-stages" aria-label="Cost import stages">{IMPORT_STAGES.map((label, index) => <li className={index < stage ? 'complete' : index === stage ? 'current' : ''} key={label}><span>{index < stage ? <Check size={12} /> : index + 1}</span>{label}</li>)}</ol>
      {error ? <Alert tone="negative" title="Cost import needs review">{error}</Alert> : null}
      {!costPreview && stage === 0 ? <div className="file-choice"><FileSpreadsheet size={22} /><div><strong>Choose a CSV or Excel file</strong><p>Recognised fields: SKU, ASIN, Product Name, Unit Cost, Currency and Effective Date.</p></div><Button variant="primary" loading={pendingAction === 'cogs-preview'} onClick={() => { void chooseMockFile(); }}>Choose sample file</Button></div> : null}
      {stage > 0 && stage < 4 ? <div className="contained-loading" role="status"><span className="ui-spinner"><i /></span><div><strong>{IMPORT_STAGES[Math.min(stage + 1, 3)]}</strong><p>Reading a safe mocked representation; no file leaves this prototype.</p></div></div> : null}
      {costPreview && stage < 5 ? <>
        <section className="copilot-import-summary" aria-label="Copilot match findings"><header><Sparkles size={18} /><div><strong>Copilot found</strong><span>Suggestions are evidence-based and never applied automatically.</span></div></header><dl><div><dt>Exact SKU matches</dt><dd>{formatCount(costPreview.exactMatches)}</dd></div><div><dt>Suggested matches</dt><dd>{formatCount(costPreview.suggestedMatches)}</dd></div><div><dt>Unmatched rows</dt><dd>{formatCount(costPreview.unmatchedRows)}</dd></div><div><dt>Suspicious values</dt><dd>{formatCount(costPreview.suspiciousValues)}</dd></div></dl></section>
        <EnterpriseDataGrid data={costPreview.rows} columns={columns} ariaLabel="Initial COGS import review sample" canExport={false} searchPlaceholder="Search preview rows" responsivePriorityColumns={['sku', 'product', 'match', 'review']} emptyTitle="No import rows" />
        <Alert tone="warning" title="Approval required">Suggested, unmatched and anomalous rows remain unapplied. This action approves the {formatCount(costPreview.exactMatches)} safe exact matches represented by the review sample.</Alert>
        <div className="approval-row"><Checkbox label={`I reviewed the sample and approve ${formatCount(costPreview.exactMatches)} exact SKU matches`} checked={approved} onChange={(event) => setApproved(event.target.checked)} /><div><ConfirmationDialog trigger={<Button>Discard import</Button>} title="Discard this cost import?" description="The preview and its mocked matches will be removed. No costs have been changed." confirmLabel="Discard import" onConfirm={() => { void discardCostImport(); setStage(0); }} /><Button variant="primary" loading={pendingAction === 'cogs-apply'} disabled={!approved} onClick={() => { void apply(); }}>Approve and apply exact matches</Button></div></div>
      </> : null}
      {stage === 5 ? <Alert tone="positive" title="Profitability coverage improved">Approved exact matches were applied with an effective date. Unmatched and suspicious rows still need review later.</Alert> : null}
      {products.length === 0 ? <Alert tone="warning" title="Product sample unavailable">Wait for marketplace products to finish importing, then return to this method.</Alert> : null}
    </section>
  );
}

function BulkEdit({ products }: { products: OnboardingProduct[] }) {
  const { showToast } = useToast();
  const { snapshot, pendingAction, saveInitialCost } = useOnboarding();
  const sample = products.slice(0, 4);
  const [costs, setCosts] = useState<Record<string, string>>(() => Object.fromEntries(sample.map((product, index) => [product.id, String((3.15 + index * 0.85).toFixed(2))])));
  const [effectiveFrom, setEffectiveFrom] = useState(DEFAULT_DATE);
  const [error, setError] = useState('');

  async function applyBulk() {
    if (!snapshot?.session.ownerUserId) return;
    const invalid = sample.find((product) => !Number.isFinite(Number(costs[product.id])) || Number(costs[product.id]) <= 0);
    if (invalid) { setError(`Enter a positive unit cost for ${invalid.sku}.`); return; }
    setError('');
    try {
      for (const product of sample) await saveInitialCost({ productId: product.id, unitCostMinor: Math.round(Number(costs[product.id]) * 100), currency: 'GBP', effectiveFrom, changedByUserId: snapshot.session.ownerUserId, reason: 'Approved onboarding bulk edit' });
      showToast(`${sample.length} product costs saved`);
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'Bulk costs could not be saved.'); }
  }

  return <section className="cogs-method-panel"><header className="onboarding-section-heading"><div><h2>Bulk edit product costs</h2><p>A small onboarding grid; the full COGS workspace arrives in Phase 5.</p></div></header>{error ? <Alert tone="negative" title="Check cost values">{error}</Alert> : null}<div className="bulk-cost-grid"><div className="bulk-cost-header"><span>Product</span><span>SKU</span><span>Unit cost (GBP)</span></div>{sample.map((product) => <div className="bulk-cost-row" key={product.id}><strong>{product.name}</strong><span className="mono-cell">{product.sku}</span><Input type="number" min="0.01" step="0.01" aria-label={`Unit cost for ${product.name}`} value={costs[product.id] ?? ''} onChange={(event) => setCosts((current) => ({ ...current, [product.id]: event.target.value }))} /></div>)}</div><div className="method-footer"><Field label="Effective date"><Input type="date" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} /></Field><Button variant="primary" loading={pendingAction === 'cogs-save'} disabled={!sample.length} onClick={() => { void applyBulk(); }}>Approve {sample.length} costs</Button></div></section>;
}

function PasteEdit({ products }: { products: OnboardingProduct[] }) {
  const { showToast } = useToast();
  const { snapshot, pendingAction, saveInitialCost } = useOnboarding();
  const sample = products.slice(0, 3);
  const [text, setText] = useState(() => sample.map((product, index) => `${product.sku}\t${(4.2 + index * 1.1).toFixed(2)}\t${DEFAULT_DATE}`).join('\n'));
  const [error, setError] = useState('');
  const rows = useMemo(() => text.split(/\r?\n/).filter(Boolean).map((line, index) => { const [sku = '', cost = '', effectiveFrom = ''] = line.split(/\t|,/).map((value) => value.trim()); const product = products.find((item) => item.sku.toLowerCase() === sku.toLowerCase()); const valid = Boolean(product && Number(cost) > 0 && /^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)); return { id: `${index}-${sku}`, sku, cost, effectiveFrom, product, valid }; }), [products, text]);

  async function applyPaste() {
    if (!snapshot?.session.ownerUserId) return;
    const validRows = rows.filter((row) => row.valid && row.product);
    if (!validRows.length || validRows.length !== rows.length) { setError('Resolve unmatched SKUs, invalid costs or dates before applying pasted rows.'); return; }
    setError('');
    try {
      for (const row of validRows) await saveInitialCost({ productId: row.product!.id, unitCostMinor: Math.round(Number(row.cost) * 100), currency: 'GBP', effectiveFrom: row.effectiveFrom, changedByUserId: snapshot.session.ownerUserId, reason: 'Approved onboarding spreadsheet paste' });
      showToast(`${validRows.length} pasted costs saved`);
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'Pasted costs could not be saved.'); }
  }

  return <section className="cogs-method-panel"><header className="onboarding-section-heading"><div><h2>Paste from Excel</h2><p>Paste tab-separated SKU, Unit Cost and Effective Date values.</p></div><Badge>{rows.length} parsed rows</Badge></header><Field label="Spreadsheet rows" hint="Format: SKU, Unit Cost, Effective Date"><Textarea className="paste-area" value={text} onChange={(event) => setText(event.target.value)} /></Field>{error ? <Alert tone="negative" title="Pasted rows contain errors">{error}</Alert> : null}<div className="paste-preview">{rows.map((row) => <div className={row.valid ? '' : 'invalid'} key={row.id}><span className="mono-cell">{row.sku || 'Missing SKU'}</span><span>{row.cost ? `£${row.cost}` : 'Missing cost'}</span><span>{row.effectiveFrom || 'Missing date'}</span><Badge tone={row.valid ? 'positive' : 'negative'}>{row.valid ? 'Matched' : 'Review'}</Badge></div>)}</div><div className="inline-actions"><Button variant="primary" loading={pendingAction === 'cogs-save'} onClick={() => { void applyPaste(); }}>Approve parsed rows</Button></div></section>;
}

function SingleEdit({ products }: { products: OnboardingProduct[] }) {
  const { showToast } = useToast();
  const { snapshot, pendingAction, saveInitialCost } = useOnboarding();
  const [productId, setProductId] = useState(products[0]?.id ?? '');
  const [cost, setCost] = useState('4.95');
  const [effectiveFrom, setEffectiveFrom] = useState(DEFAULT_DATE);
  const [error, setError] = useState('');
  const selectedProductId = productId || products[0]?.id || '';

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!snapshot?.session.ownerUserId || !selectedProductId || Number(cost) <= 0) { setError('Choose a product and enter a positive unit cost.'); return; }
    setError('');
    try { await saveInitialCost({ productId: selectedProductId, unitCostMinor: Math.round(Number(cost) * 100), currency: 'GBP', effectiveFrom, changedByUserId: snapshot.session.ownerUserId, reason: 'Approved individual onboarding cost' }); showToast('Product cost saved'); }
    catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'The product cost could not be saved.'); }
  }

  return <form className="cogs-method-panel" onSubmit={save}><header className="onboarding-section-heading"><div><h2>Add one product cost</h2><p>Creates an effective-dated internal COGS record without changing marketplace listing data.</p></div></header>{error ? <Alert tone="negative" title="Cost could not be saved">{error}</Alert> : null}<div className="onboarding-form-grid three-columns"><Field label="Product"><Select value={selectedProductId} onChange={(event) => setProductId(event.target.value)}><option value="">Choose product</option>{products.map((product) => <option value={product.id} key={product.id}>{product.sku} · {product.name}</option>)}</Select></Field><Field label="Unit cost (GBP)"><Input type="number" min="0.01" step="0.01" value={cost} onChange={(event) => setCost(event.target.value)} /></Field><Field label="Effective date"><Input type="date" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} /></Field></div><div className="inline-actions"><Button variant="primary" type="submit" loading={pendingAction === 'cogs-save'}>Approve and save cost</Button></div></form>;
}

export function CogsStep() {
  const router = useRouter();
  const { snapshot, loading, pendingAction, listCogsProducts, completeStep, skipStep } = useOnboarding();
  const [method, setMethod] = useState<CogsMethod>('import');
  const [products, setProducts] = useState<OnboardingProduct[]>([]);
  const [error, setError] = useState('');
  const [copilotHelpOpen, setCopilotHelpOpen] = useState(true);
  const methodTabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!snapshot?.cogsCoverage?.productsImported) return;
    let cancelled = false;
    void listCogsProducts().then((items) => { if (!cancelled) setProducts(items); }).catch((loadError) => { if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Products could not be loaded.'); });
    return () => { cancelled = true; };
  }, [listCogsProducts, snapshot?.cogsCoverage?.productsImported]);

  if (loading && !snapshot) return <section className="onboarding-step-card"><Skeleton className="onboarding-heading-skeleton" /><Skeleton className="onboarding-panel-skeleton" /></section>;
  const coverage = snapshot?.cogsCoverage;
  if (!snapshot || !coverage) return <Alert tone="warning" title="Product import is required">Return to initial sync and wait until marketplace products are available.</Alert>;

  async function moveNext(skip: boolean) {
    setError('');
    try { if (skip) await skipStep('cogs'); else await completeStep('cogs'); router.push('/onboarding/users'); }
    catch (stepError) { setError(stepError instanceof Error ? stepError.message : 'COGS readiness could not be saved.'); }
  }

  function handleMethodKeyDown(event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) {
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % METHODS.length;
    if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + METHODS.length) % METHODS.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = METHODS.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    setMethod(METHODS[nextIndex].id);
    methodTabRefs.current[nextIndex]?.focus();
  }

  return <section className="onboarding-step-card"><StepHeading /><CoverageSummary products={coverage.productsImported} complete={coverage.cogsComplete} missing={coverage.cogsMissing} coverage={coverage.coveragePercent} />{coverage.coveragePercent < 100 ? <Alert tone="warning" title="Profitability is incomplete">Revenue and marketplace fees are available, but Net Profit must not be treated as reliable while {formatCount(coverage.cogsMissing)} products are missing cost.</Alert> : <Alert tone="positive" title="COGS coverage is complete">Every imported product has an effective cost record.</Alert>}{error ? <Alert tone="negative" title="COGS setup needs attention">{error}</Alert> : null}<section className="onboarding-section"><header className="onboarding-section-heading"><div><h2>Choose an initial cost method</h2><p>These are lightweight onboarding entry points, not the complete Phase 5 COGS workspace.</p></div></header><div className="cogs-method-options" role="tablist" aria-label="Initial COGS entry methods" aria-orientation="horizontal">{METHODS.map((item, index) => <button ref={(node) => { methodTabRefs.current[index] = node; }} id={`cogs-method-tab-${item.id}`} type="button" role="tab" aria-selected={method === item.id} aria-controls={`cogs-method-panel-${item.id}`} tabIndex={method === item.id ? 0 : -1} onClick={() => setMethod(item.id)} onKeyDown={(event) => handleMethodKeyDown(event, index)} key={item.id}><item.icon size={18} /><span><strong>{item.title}</strong><small>{item.description}</small></span>{item.recommended ? <Badge tone="info">Recommended</Badge> : null}</button>)}</div></section>{METHODS.map((item) => <div id={`cogs-method-panel-${item.id}`} role="tabpanel" aria-labelledby={`cogs-method-tab-${item.id}`} tabIndex={method === item.id ? 0 : -1} hidden={method !== item.id} key={item.id}>{method === item.id ? method === 'import' ? <ImportFlow products={products} /> : method === 'bulk' ? <BulkEdit products={products} /> : method === 'paste' ? <PasteEdit products={products} /> : <SingleEdit products={products} /> : null}</div>)}<aside className="onboarding-context-help cogs-help"><button type="button" onClick={() => setCopilotHelpOpen((open) => !open)} aria-expanded={copilotHelpOpen} aria-controls="cogs-copilot-help"><Sparkles size={16} /><span>Copilot guardrail</span></button><p id="cogs-copilot-help" hidden={!copilotHelpOpen}>Copilot can match rows and flag anomalies. It cannot invent cost, hide confidence, or apply a financial change without your approval.</p></aside><footer className="onboarding-step-footer"><Button onClick={() => router.push('/onboarding/sync')}><ArrowLeft size={15} /> Back</Button><div><button className="text-action" type="button" onClick={() => { void moveNext(true); }}>Continue with incomplete COGS</button><Button variant="primary" loading={pendingAction === 'step-cogs'} onClick={() => { void moveNext(false); }}>Continue setup <ArrowRight size={15} /></Button></div></footer></section>;
}
