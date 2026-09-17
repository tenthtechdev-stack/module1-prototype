'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, FileSpreadsheet, FileUp, History, Info, LockKeyhole, ShieldCheck, Store, TableProperties } from 'lucide-react';
import { useAnalysisContext } from '@/src/components/providers/analysis-context-provider';
import { AccessState, useAccess } from '@/src/components/rbac/access';
import { PageHeader } from '@/src/components/product/patterns';
import { Button } from '@/src/components/ui/actions';
import { Alert, Badge, Spinner, useToast } from '@/src/components/ui/feedback';
import { Field, Select } from '@/src/components/ui/forms';
import { Breadcrumbs } from '@/src/components/ui/navigation';
import { detectCogsColumnMapping, parseDelimitedText, type ParsedTabularData } from '@/src/domain/cogs';
import { formatDate, formatInteger } from '@/src/domain/calculations';
import { CogsSubNavigation } from '@/src/features/cogs/product-groups/cogs-sub-navigation';
import { useCogsActions, useCogsWorkspace } from '@/src/services/hooks/use-cogs';

interface ParsedSheet { name: string; parsed: ParsedTabularData }

function safeCell(value: unknown) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).replace(/[\t\r\n]+/g, ' ').trim();
}

function matrixToParsed(data: unknown[][]) {
  return parseDelimitedText(data.map((row) => row.map(safeCell).join('\t')).join('\n'));
}

function fileSize(bytes: number) {
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(1)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function importStatusTone(status: string) {
  return status === 'applied' ? 'positive' as const : status === 'failed' ? 'negative' as const : status === 'awaiting-approval' ? 'info' as const : 'warning' as const;
}

export function CogsImportStartPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { workspace, context } = useAnalysisContext();
  const marketplaceManagement = useAccess('marketplaces.manage');
  const actions = useCogsActions();
  const requestedCompany = searchParams.get('company');
  const viewHistory = searchParams.get('view') === 'history';
  const history = useCogsWorkspace({ pageSize: 1, allowUnavailableMarketplace: viewHistory });
  const { showToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [companyId, setCompanyId] = useState(() => requestedCompany && actions.companies.some((company) => company.id === requestedCompany) ? requestedCompany : context.companyId !== 'all' ? context.companyId : actions.companies[0]?.id ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [fileType, setFileType] = useState<'csv' | 'xlsx' | null>(null);
  const [sheets, setSheets] = useState<ParsedSheet[]>([]);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [parseState, setParseState] = useState<'idle' | 'reading' | 'ready' | 'error'>('idle');
  const [error, setError] = useState('');
  const selected = sheets.find((sheet) => sheet.name === selectedSheet) ?? sheets[0];
  const mapping = useMemo(() => detectCogsColumnMapping(selected?.parsed.headers ?? []), [selected]);
  const mappedCount = mapping.filter((item) => item.sourceColumn).length;
  const orgSlug = workspace.organisation.slug;

  if (!actions.access.allowed) return <AccessState decision={actions.access} />;
  if (!viewHistory && actions.marketplaceState === 'no-authorised') return <AccessState decision={{ allowed: false, reason: 'assignment_out_of_scope' }} />;
  if (!viewHistory && !actions.permissions.canImport) return <AccessState decision={{ allowed: false, reason: 'capability_missing' }} />;
  if (!viewHistory && actions.marketplaceState === 'none-connected') return <div className="cogs-page"><Breadcrumbs items={[{ label: workspace.organisation.name }, { label: 'COGS', href: `/o/${orgSlug}/cogs` }, { label: 'Import costs' }]} /><PageHeader eyebrow="Governed cost intake" title="Import Product costs" description="Select one Company, then review every proposed financial change." /><section className="cogs-empty-state"><Store size={25} /><h2>No Products available for COGS setup.</h2><p>Connect and sync a marketplace first.</p>{marketplaceManagement.allowed ? <Link className="ui-button primary compact" href={`/o/${orgSlug}/admin/marketplace-accounts`}>Connect marketplace</Link> : null}</section></div>;

  function clearFile() {
    setFile(null); setFileType(null); setSheets([]); setSelectedSheet(''); setParseState('idle'); setError('');
    if (inputRef.current) inputRef.current.value = '';
  }

  function changeCompany(next: string) {
    if (file && !window.confirm('Change import company? Current parsed data and Product matches will be cleared.')) return;
    setCompanyId(next);
    if (file) clearFile();
  }

  async function parseFile(nextFile: File) {
    setError(''); setParseState('reading'); setFile(nextFile); setSheets([]); setSelectedSheet('');
    const lowerName = nextFile.name.toLocaleLowerCase('en-GB');
    try {
      if (nextFile.size > 5 * 1_048_576) throw new Error('This prototype accepts files up to 5 MB and 5,000 rows per sheet.');
      if (lowerName.endsWith('.csv')) {
        const parsed = parseDelimitedText(await nextFile.text());
        if (!parsed.rows.length) throw new Error('The CSV contains no data rows.');
        if (parsed.rows.length > 5_000) throw new Error('This prototype accepts up to 5,000 rows per import.');
        setFileType('csv'); setSheets([{ name: 'CSV data', parsed }]); setSelectedSheet('CSV data');
      } else if (lowerName.endsWith('.xlsx')) {
        const { default: readWorkbook } = await import('read-excel-file/browser');
        const workbook = await readWorkbook(nextFile);
        const parsedSheets = workbook.map((sheet) => ({ name: sheet.sheet, parsed: matrixToParsed(sheet.data as unknown[][]) })).filter((sheet) => sheet.parsed.headers.length > 0);
        if (!parsedSheets.length) throw new Error('The workbook contains no readable sheets.');
        if (parsedSheets.some((sheet) => sheet.parsed.rows.length > 5_000)) throw new Error('This prototype accepts up to 5,000 rows in the selected sheet.');
        setFileType('xlsx'); setSheets(parsedSheets); setSelectedSheet(parsedSheets[0].name);
      } else {
        throw new Error('Choose a .csv or .xlsx file. Legacy .xls and macro-enabled workbooks are not supported.');
      }
      setParseState('ready');
    } catch (caught) {
      setParseState('error'); setError(caught instanceof Error ? caught.message : 'The file could not be read safely.');
    }
  }

  function useDemoFile() {
    const companyRows = history.query.data?.allRows.filter((row) => row.product.ownerCompanyId === companyId).slice(0, 8) ?? [];
    const csv = `Our SKU,Product Title,New Buy Price,Currency,Effective Date\n${companyRows.map((row, index) => `"${row.product.internalSku}","${row.product.title}",${row.current ? ((row.current.unitCostMinor + 20 + index * 7) / 100).toFixed(2) : (6.25 + index).toFixed(2)},${row.current?.currency ?? 'GBP'},2026-09-01`).join('\n')}`;
    void parseFile(new File([csv], 'supplier-costs-sep-2026.csv', { type: 'text/csv' }));
  }

  async function startAnalysis() {
    if (!file || !fileType || !selected || !companyId) return;
    setError('');
    try {
      const batch = await actions.createImport({ companyId, fileName: file.name, fileType, fileSize: file.size, sheetNames: fileType === 'xlsx' ? sheets.map((sheet) => sheet.name) : [], selectedSheet: fileType === 'xlsx' ? selected.name : null, headers: selected.parsed.headers, rawRows: selected.parsed.rows, mapping, reason: 'Supplier pricing import', note: 'Binary workbook content was not persisted; only safe parsed values and metadata were retained.' });
      showToast(`${selected.parsed.rows.length} rows staged. No COGS has been applied.`, 'info');
      router.push(`/o/${orgSlug}/cogs/import/${encodeURIComponent(batch.id)}`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'The import could not be created.'); }
  }

  const recentImports = history.query.data?.recentImports ?? [];
  return <div className="cogs-import-page">
    <Breadcrumbs items={[{ label: workspace.organisation.name, href: `/o/${orgSlug}/dashboard` }, { label: 'COGS', href: `/o/${orgSlug}/cogs` }, { label: viewHistory ? 'Imports' : 'Import costs' }]} />
    <PageHeader eyebrow="Governed cost intake" title={viewHistory ? 'COGS imports' : 'Import Product costs'} description={viewHistory ? 'Review persisted import batches, proposals and approvals.' : 'Select one Company, read a CSV or XLSX locally, then review every proposed financial change.'} actions={<Link className="ui-button secondary compact" href={`/o/${orgSlug}/cogs`}><ArrowLeft size={14} /> COGS workspace</Link>} />
    <CogsSubNavigation orgSlug={orgSlug} active="imports" companyId={companyId || 'all'} />
    <nav className="cogs-view-tabs" aria-label="COGS import views">{actions.permissions.canImport ? <Link aria-current={!viewHistory ? 'page' : undefined} href={`/o/${orgSlug}/cogs/import${companyId ? `?company=${encodeURIComponent(companyId)}` : ''}`}>New import</Link> : null}<Link aria-current={viewHistory ? 'page' : undefined} href={`/o/${orgSlug}/cogs/import?view=history`}>Import history {recentImports.length ? <Badge>{recentImports.length}</Badge> : null}</Link></nav>
    {viewHistory ? <section className="cogs-import-history"><header><div><span className="eyebrow">Canonical batch log</span><h2>Recent imports and proposals</h2><p>Reload-safe metadata, source rows, mappings, review decisions and results.</p></div></header>{history.query.isPending ? <div className="cogs-import-loading"><Spinner label="Loading import history" /> Loading import history…</div> : recentImports.length ? <div className="cogs-import-history-list">{recentImports.map((batch) => <Link key={batch.id} href={`/o/${orgSlug}/cogs/import/${encodeURIComponent(batch.id)}`}><span className="import-file-icon"><FileSpreadsheet size={17} /></span><span><strong>{batch.fileName}</strong><small>{batch.id} · {batch.rowCount} rows · {batch.createdByName}</small></span><span><Badge tone={importStatusTone(batch.status)}>{batch.status.replaceAll('-', ' ')}</Badge><small>{formatDate(batch.updatedAt)}</small></span><ArrowRight size={15} /></Link>)}</div> : <Alert tone="info" title="No import history yet">Upload a CSV/XLSX, paste rows, or prepare a direct Product cost proposal.</Alert>}</section> : <>
      <ol className="cogs-import-stepper" aria-label="Import workflow"><li aria-current="step"><span>1</span><strong>Company & file</strong></li><li><span>2</span><strong>Map columns</strong></li><li><span>3</span><strong>Match Products</strong></li><li><span>4</span><strong>Review issues</strong></li><li><span>5</span><strong>Approve & apply</strong></li></ol>
      <div className="cogs-import-start-grid">
        <section className="cogs-import-card"><header><span className="import-card-icon"><LockKeyhole size={18} /></span><div><span className="eyebrow">Step 1</span><h2>Choose the owning Company</h2><p>SKU and listing identifiers are resolved only inside this Company’s authorised catalogue.</p></div></header><Field label="Company"><Select value={companyId} onChange={(event) => changeCompany(event.target.value)}><option value="">Choose Company</option>{actions.companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</Select></Field><Alert tone="info" title="Company-safe by default">The same internal SKU may legally exist elsewhere. Products from another Company are never candidates.</Alert></section>
        <section className="cogs-import-card"><header><span className="import-card-icon"><FileUp size={18} /></span><div><span className="eyebrow">Step 2</span><h2>Upload CSV or XLSX</h2><p>Choose a file or use the deterministic demo. Drag and drop is never required.</p></div></header><label className={`cogs-file-picker${parseState === 'reading' ? ' reading' : ''}`}><input ref={inputRef} type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => { const next = event.target.files?.[0]; if (next) void parseFile(next); }} /><FileSpreadsheet size={24} /><strong>{parseState === 'reading' ? 'Reading workbook…' : file?.name ?? 'Choose cost file'}</strong><span>{file ? fileSize(file.size) : 'CSV or XLSX · up to 5 MB · 5,000 rows'}</span>{parseState === 'reading' ? <Spinner label="Reading file" /> : <span className="ui-button secondary compact">Browse files</span>}</label><div className="cogs-upload-actions"><Button size="compact" onClick={useDemoFile} disabled={!companyId}>Use demo CSV</Button>{file ? <Button size="compact" variant="ghost" onClick={clearFile}>Remove file</Button> : null}</div></section>
      </div>
      {parseState === 'error' ? <Alert tone="negative" title="File could not be read">{error}</Alert> : null}
      {parseState === 'ready' && file && selected ? <section className="cogs-file-analysis" aria-live="polite"><header><div><span className="eyebrow">Safe parse complete</span><h2>{file.name}</h2><p>Only parsed display values and metadata continue to review. The binary file and local path are not persisted.</p></div><Badge tone="positive"><CheckCircle2 size={12} /> Ready</Badge></header>{fileType === 'xlsx' && sheets.length > 1 ? <Field label="Workbook sheet" hint="Sheets are never combined automatically."><Select value={selected.name} onChange={(event) => setSelectedSheet(event.target.value)}>{sheets.map((sheet) => <option key={sheet.name}>{sheet.name}</option>)}</Select></Field> : null}<div className="cogs-file-metrics"><article><TableProperties size={17} /><span><small>Rows</small><strong>{formatInteger(selected.parsed.rows.length)}</strong></span></article><article><FileSpreadsheet size={17} /><span><small>Columns</small><strong>{selected.parsed.headers.length}</strong></span></article><article><ShieldCheck size={17} /><span><small>Detected mappings</small><strong>{mappedCount}</strong></span></article><article><History size={17} /><span><small>Selected Company</small><strong>{actions.companies.find((company) => company.id === companyId)?.name ?? '—'}</strong></span></article></div><div className="cogs-detected-columns">{mapping.filter((item) => item.sourceColumn).map((item) => <span key={item.field}><strong>{item.sourceColumn}</strong><ArrowRight size={12} /><em>{item.field}</em><Badge tone={item.confidence >= 95 ? 'positive' : 'info'}>{item.confidence}%</Badge></span>)}</div>{!mapping.some((item) => item.field === 'unitCost' && item.sourceColumn) ? <Alert tone="warning" title="No reliable cost column detected">A human must choose the cost column on the next step. Copilot will not select a random numeric column.</Alert> : null}<div className="cogs-analysis-note"><Info size={15} /><span><strong>Parsing safety</strong><small>Spreadsheet text is never rendered as HTML. Macros are unsupported and formulas are not executed.</small></span></div><div className="cogs-dialog-actions"><Button onClick={clearFile}>Choose another file</Button><Button variant="primary" loading={actions.createImportMutation.isPending} disabled={!companyId || !selected.parsed.rows.length} onClick={() => { void startAnalysis(); }}>Continue to column mapping <ArrowRight size={15} /></Button></div></section> : null}
      <p className="cogs-mobile-advice">For large spreadsheet editing, desktop is recommended. Mobile still supports import review and approval.</p>
    </>}
  </div>;
}
