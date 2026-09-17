'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CircleHelp,
  Clock3,
  Link2,
  RefreshCw,
  Store,
  Unplug,
} from 'lucide-react';
import type { Marketplace } from '@/src/domain/models';
import type { SyncDataset, SyncDatasetProgress } from '@/src/domain/onboarding';
import { useOnboarding } from '@/src/components/providers/onboarding-provider';
import { usePrototype } from '@/src/components/providers/prototype-provider';
import { Button } from '@/src/components/ui/actions';
import { Field, Input, Select } from '@/src/components/ui/forms';
import { Alert, Badge, Skeleton, useToast } from '@/src/components/ui/feedback';
import { ConfirmationDialog } from '@/src/components/ui/overlays';
import { MarketplaceBadge, SyncStatusBadge } from '@/src/components/product/patterns';

const MARKETPLACES: Array<{ id: Marketplace; label: string; description: string; defaultName: string }> = [
  { id: 'amazon', label: 'Amazon', description: 'Seller Central account', defaultName: 'Amazon UK' },
  { id: 'ebay', label: 'eBay', description: 'eBay seller account', defaultName: 'eBay UK' },
  { id: 'temu', label: 'Temu', description: 'Temu seller account', defaultName: 'Temu UK' },
];

const DATASET_LABELS: Record<SyncDataset, string> = {
  products: 'Products',
  orders: 'Orders',
  transactions: 'Transactions',
  fees: 'Marketplace fees',
  refunds: 'Refunds',
  advertising: 'Advertising',
};

type ProviderOutcome = 'success' | 'failed' | 'authentication_required';

function formatCount(value: number) {
  return new Intl.NumberFormat('en-GB').format(value);
}

function shortTime(value: string | null) {
  if (!value) return 'Not yet synced';
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function datasetDetail(dataset: SyncDatasetProgress) {
  if (dataset.error) {
    const lastSuccess = dataset.lastSuccessfulSyncAt ? ` Last successful activity ${shortTime(dataset.lastSuccessfulSyncAt)}.` : ' No successful import has completed yet.';
    return `${dataset.error.message}${lastSuccess}`;
  }
  if (dataset.status === 'synced') return `Last successful sync ${shortTime(dataset.lastSuccessfulSyncAt)}`;
  if (dataset.status === 'syncing') return 'Importing now';
  if (dataset.status === 'retrying') return 'Retrying now—previously imported records remain available.';
  return 'Waiting for earlier datasets';
}

function StepLoading() {
  return <section className="onboarding-step-card" aria-label="Loading setup step"><Skeleton className="onboarding-heading-skeleton" /><Skeleton className="onboarding-panel-skeleton" /></section>;
}

function StepHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <header className="onboarding-step-heading"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></header>;
}

function StepNavigation({ backHref, children }: { backHref: string; children: React.ReactNode }) {
  const router = useRouter();
  return <footer className="onboarding-step-footer"><Button type="button" onClick={() => router.push(backHref)}><ArrowLeft size={15} /> Back</Button><div>{children}</div></footer>;
}

function ContextHelp({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return <aside className="onboarding-context-help"><button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}><CircleHelp size={16} /><span>{question}</span></button>{open ? <p>{answer}</p> : null}</aside>;
}

export function MarketplacesStep() {
  const router = useRouter();
  const { showToast } = useToast();
  const { scenarioId } = usePrototype();
  const {
    snapshot,
    loading,
    pendingAction,
    connectMarketplace,
    retryMarketplace,
    disconnectMarketplace,
    completeStep,
  } = useOnboarding();
  const [selected, setSelected] = useState<Marketplace | null>(null);
  const [companyId, setCompanyId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [regionCode, setRegionCode] = useState('GB');
  const [providerOutcome, setProviderOutcome] = useState<ProviderOutcome>('success');
  const [error, setError] = useState('');

  const accountsByCompany = useMemo(() => snapshot?.companies.map((company) => ({
    company,
    accounts: snapshot.marketplaceAccounts.filter((account) => account.companyId === company.id),
  })).filter((group) => group.accounts.length) ?? [], [snapshot]);

  if (loading && !snapshot) return <StepLoading />;
  if (!snapshot?.organisation) return <Alert tone="warning" title="Organisation setup is required">Create your organisation and first company before connecting a marketplace.</Alert>;

  function chooseMarketplace(marketplace: Marketplace) {
    const definition = MARKETPLACES.find((item) => item.id === marketplace)!;
    setSelected(marketplace);
    setCompanyId(snapshot!.companies[0]?.id ?? '');
    setDisplayName(`${snapshot!.companies[0]?.name.replace(/\s+(Ltd|Limited)$/i, '') ?? 'My store'} ${definition.defaultName}`);
    setRegionCode('GB');
    setProviderOutcome(scenarioId === 'ebay-auth-failed' && marketplace === 'ebay' ? 'authentication_required' : 'success');
    setError('');
  }

  async function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !companyId || !displayName.trim()) {
      setError('Choose the owning company and enter the account or store name.');
      return;
    }
    setError('');
    try {
      await connectMarketplace({
        companyId,
        marketplace: selected,
        displayName: displayName.trim(),
        regionCode,
        outcome: providerOutcome,
      });
      showToast(`${MARKETPLACES.find((item) => item.id === selected)?.label} account connected`);
      setSelected(null);
    } catch (connectionError) {
      setError(connectionError instanceof Error ? connectionError.message : 'The marketplace connection failed.');
    }
  }

  async function retry(accountId: string) {
    setError('');
    try {
      await retryMarketplace(accountId);
      showToast('Marketplace connection restored');
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : 'The marketplace connection could not be retried.');
    }
  }

  async function disconnect(accountId: string) {
    setError('');
    try {
      await disconnectMarketplace(accountId);
      showToast('Marketplace account disconnected', 'info');
    } catch (disconnectError) {
      setError(disconnectError instanceof Error ? disconnectError.message : 'The marketplace account could not be disconnected.');
    }
  }

  async function continueToSync() {
    if (!snapshot?.marketplaceAccounts.some((account) => account.connectionStatus === 'connected')) {
      setError('Connect at least one marketplace account to begin importing products and sales data.');
      return;
    }
    try {
      await completeStep('marketplaces');
      router.push('/onboarding/sync');
    } catch (stepError) {
      setError(stepError instanceof Error ? stepError.message : 'Marketplace setup could not be completed.');
    }
  }

  return (
    <section className="onboarding-step-card">
      <StepHeading eyebrow="Marketplace setup" title="Connect seller accounts" description="Every marketplace account belongs to a company. This keeps ownership and reporting scope unambiguous." />

      <div className="hierarchy-strip" aria-label="Marketplace ownership hierarchy"><span>Organisation</span><ArrowRight size={14} /><span>Company</span><ArrowRight size={14} /><strong>Marketplace account</strong></div>
      {error ? <Alert tone="negative" title="Marketplace setup needs attention">{error}</Alert> : null}

      <section className="onboarding-section" aria-labelledby="marketplace-options-title">
        <header className="onboarding-section-heading"><div><h2 id="marketplace-options-title">Available marketplaces</h2><p>Simulated OAuth authorisation only—no live seller credentials are used.</p></div><Badge tone="info">Prototype connections</Badge></header>
        <div className="marketplace-options">
          {MARKETPLACES.map((marketplace) => {
            const connectedCount = snapshot.marketplaceAccounts.filter((account) => account.marketplace === marketplace.id && account.connectionStatus === 'connected').length;
            return <article className="marketplace-option" key={marketplace.id}><span className={`marketplace-logo ${marketplace.id}`}>{marketplace.label.slice(0, 1)}</span><div><strong>{marketplace.label}</strong><small>{marketplace.description}</small></div>{connectedCount ? <Badge tone="positive">{connectedCount} connected</Badge> : null}<Button size="compact" onClick={() => chooseMarketplace(marketplace.id)}><Link2 size={14} /> Connect</Button></article>;
          })}
        </div>
      </section>

      {selected ? (
        <form className="onboarding-section marketplace-connect-form" onSubmit={connect} aria-label={`Connect ${selected}`}>
          <header className="onboarding-section-heading"><div><h2>Authorise {MARKETPLACES.find((item) => item.id === selected)?.label}</h2><p>Choose a deterministic sandbox response, then run the simulated provider authorisation. No live credentials are used.</p></div><SyncStatusBadge status={pendingAction === 'marketplace' ? 'syncing' : 'pending'} /></header>
          <div className="onboarding-form-grid two-columns">
            <Field label="Owning company"><Select value={companyId} onChange={(event) => setCompanyId(event.target.value)} required><option value="">Choose company</option>{snapshot.companies.map((company) => <option value={company.id} key={company.id}>{company.name}</option>)}</Select></Field>
            <Field label="Account / store display name"><Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></Field>
            <Field label="Region"><Select value={regionCode} onChange={(event) => setRegionCode(event.target.value)}><option value="GB">United Kingdom</option><option value="IE">Ireland</option><option value="DE">Germany</option></Select></Field>
            <Field label="Provider response (prototype)"><Select value={providerOutcome} onChange={(event) => setProviderOutcome(event.target.value as ProviderOutcome)}><option value="success">Authorisation succeeds</option><option value="authentication_required">Authorisation not granted</option><option value="failed">Provider rejects connection</option></Select></Field>
          </div>
          <div className="inline-actions"><Button type="button" onClick={() => setSelected(null)}>Cancel</Button><Button type="submit" variant="primary" loading={pendingAction === 'marketplace'}>Authorise and connect</Button></div>
        </form>
      ) : null}

      <section className="onboarding-section" aria-labelledby="connected-accounts-title">
        <header className="onboarding-section-heading"><div><h2 id="connected-accounts-title">Marketplace accounts</h2><p>Company ownership and unsuccessful provider responses remain visible until resolved.</p></div><Badge tone={snapshot.marketplaceAccounts.length ? 'positive' : 'neutral'}>{snapshot.marketplaceAccounts.length} accounts</Badge></header>
        {accountsByCompany.length ? <div className="company-account-groups">{accountsByCompany.map(({ company, accounts }) => <section key={company.id}><h3>{company.name}</h3>{accounts.map((account) => <article className="connected-account-row" key={account.id}><MarketplaceBadge marketplace={account.marketplace} /><div><strong>{account.displayName}</strong><small>{account.regionCode} · {account.connectedAt ? `Connected ${shortTime(account.connectedAt)}` : account.authenticationStatus === 'rejected' ? 'Provider rejected connection' : account.authenticationStatus === 'required' ? 'Authorisation required' : 'Connection pending'}</small></div><SyncStatusBadge status={account.status} />{account.authenticationStatus !== 'authorised' ? <Button size="compact" loading={pendingAction === 'marketplace-retry'} onClick={() => { void retry(account.id); }}><RefreshCw size={13} /> {account.authenticationStatus === 'rejected' ? 'Retry connection' : 'Reconnect'}</Button> : <ConfirmationDialog trigger={<Button size="compact"><Unplug size={13} /> Disconnect</Button>} title={`Disconnect ${account.displayName}?`} description="Historical mock data linked to this account will no longer be included in current onboarding. Accounts with an active initial sync cannot be disconnected." confirmLabel="Disconnect account" onConfirm={() => { void disconnect(account.id); }} />}</article>)}</section>)}</div> : <div className="onboarding-empty-row"><Store size={20} /><div><strong>No marketplace accounts connected</strong><p>Connect Amazon, eBay or Temu to make marketplace data available.</p></div></div>}
      </section>

      <ContextHelp question="Which marketplace account belongs to which company?" answer="Choose the legal or trading company that owns the seller account and receives its marketplace settlements. You can connect several accounts to one company." />
      <StepNavigation backHref="/onboarding/companies"><Button variant="primary" onClick={() => { void continueToSync(); }} disabled={pendingAction !== null}>Continue to initial sync <ArrowRight size={15} /></Button></StepNavigation>
    </section>
  );
}

export function SyncStep() {
  const router = useRouter();
  const { showToast } = useToast();
  const { snapshot, syncProgress, loading, pendingAction, startSync, refreshSync, retryDataset, completeStep } = useOnboarding();
  const [error, setError] = useState('');
  const refreshSyncRef = useRef(refreshSync);
  const organisationId = snapshot?.organisation?.id;

  useEffect(() => { refreshSyncRef.current = refreshSync; }, [refreshSync]);

  useEffect(() => {
    if (!organisationId) return;
    let cancelled = false;
    let timer: number | undefined;
    async function poll() {
      try {
        const progress = await refreshSyncRef.current();
        if (!cancelled && progress?.startedAt && progress.status !== 'synced') timer = window.setTimeout(poll, 1_250);
      } catch (pollError) {
        if (!cancelled) setError(pollError instanceof Error ? pollError.message : 'Sync progress could not be loaded.');
      }
    }
    void poll();
    return () => { cancelled = true; if (timer) window.clearTimeout(timer); };
  }, [organisationId]);

  if (loading && !snapshot) return <StepLoading />;
  if (!snapshot?.organisation) return <Alert tone="warning" title="Organisation setup is required">Complete the earlier setup steps before starting marketplace sync.</Alert>;

  async function begin() {
    setError('');
    try {
      await startSync();
      showToast('Initial marketplace import started');
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : 'The initial import could not be started.');
    }
  }

  async function retry(accountId: string, dataset: SyncDataset) {
    setError('');
    try {
      await retryDataset(accountId, dataset);
      showToast(`${DATASET_LABELS[dataset]} retry started`, 'info');
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : 'The dataset retry could not be started.');
    }
  }

  async function continueToCogs() {
    setError('');
    try {
      await completeStep('sync');
      router.push('/onboarding/cogs');
    } catch (stepError) {
      setError(stepError instanceof Error ? stepError.message : 'Wait for product data before continuing.');
    }
  }

  const accountName = (id: string) => snapshot.marketplaceAccounts.find((account) => account.id === id)?.displayName ?? 'Marketplace account';
  const progress = syncProgress;
  const hasIssues = progress?.accounts.some((account) => account.datasets.some((dataset) => ['failed', 'delayed', 'authentication_required'].includes(dataset.status))) ?? false;

  return (
    <section className="onboarding-step-card">
      <StepHeading eyebrow="Initial marketplace sync" title="Import marketplace history" description="Products arrive first; orders, fees, refunds and advertising follow in stages. The import continues if you leave this page." />
      {error ? <Alert tone="negative" title="Sync needs attention">{error}</Alert> : null}

      {!progress?.startedAt ? <section className="onboarding-section sync-start-panel"><div className="sync-start-icon"><RefreshCw size={21} /></div><div><h2>Ready to import</h2><p>{snapshot.marketplaceAccounts.length} connected account{snapshot.marketplaceAccounts.length === 1 ? '' : 's'} will be imported. Marketplace records remain read-only.</p></div><Button variant="primary" loading={pendingAction === 'sync-start'} onClick={() => { void begin(); }}>Start initial sync</Button></section> : (
        <>
          <section className="onboarding-section overall-sync" aria-live="polite">
            <header className="onboarding-section-heading"><div><h2>Historical import</h2><p>Updated just now · You can continue setup once products are available.</p></div><SyncStatusBadge status={progress.status} /></header>
            <div className="progress-label"><strong>{progress.progressPercent}% complete</strong><span>{formatCount(progress.imported.transactions + progress.imported.orders + progress.imported.listings)} records imported</span></div>
            <progress value={progress.progressPercent} max={100} aria-label={`Historical import ${progress.progressPercent}% complete`} />
          </section>

          {hasIssues ? <Alert tone="warning" title="Some marketplace data is incomplete">Healthy datasets remain available. Failed, delayed or expired authorisation states stay visible until resolved.</Alert> : null}

          <div className="sync-account-list">
            {progress.accounts.map((account) => <section className="onboarding-section sync-account" key={account.marketplaceAccountId} aria-labelledby={`sync-${account.marketplaceAccountId}`}><header className="onboarding-section-heading"><div><MarketplaceBadge marketplace={account.marketplace} /><h2 id={`sync-${account.marketplaceAccountId}`}>{accountName(account.marketplaceAccountId)}</h2><p>Historical import {account.progressPercent}% · Last activity {shortTime(account.updatedAt)}</p></div><SyncStatusBadge status={account.status} /></header><div className="sync-dataset-list">{account.datasets.map((dataset) => <article className="sync-dataset-row" key={dataset.dataset}><div><strong>{DATASET_LABELS[dataset.dataset]}</strong><small>{datasetDetail(dataset)}</small></div><span className="numeric">{dataset.recordsImported ? formatCount(dataset.recordsImported) : '—'}</span><SyncStatusBadge status={dataset.status} />{dataset.error?.retryable ? <Button size="compact" loading={pendingAction === 'sync-retry'} onClick={() => { void retry(account.marketplaceAccountId, dataset.dataset); }}><RefreshCw size={13} /> Retry</Button> : dataset.status === 'authentication_required' ? <Button size="compact" onClick={() => router.push('/onboarding/marketplaces')}>Reconnect</Button> : <span className="dataset-action-placeholder" />}</article>)}</div></section>)}
          </div>

          {progress.imported.products > 0 ? <section className="products-imported-transition"><header><CheckCircle2 size={20} /><div><h2>Marketplace data imported</h2><p>Product and sales data is becoming available. Acquisition cost usually is not supplied by marketplaces, so COGS is added separately.</p></div></header><dl><div><dt>Products</dt><dd>{formatCount(progress.imported.products)}</dd></div><div><dt>Listings</dt><dd>{formatCount(progress.imported.listings)}</dd></div><div><dt>Orders</dt><dd>{formatCount(progress.imported.orders)}</dd></div><div><dt>Transactions</dt><dd>{formatCount(progress.imported.transactions)}</dd></div></dl></section> : null}
        </>
      )}

      <ContextHelp question="Why are Amazon fees still syncing?" answer="Marketplace datasets arrive through separate feeds. Product data can be ready while fees or advertising are still importing, so profitability remains partial until those feeds catch up." />
      <StepNavigation backHref="/onboarding/marketplaces"><div className="continue-copy"><Clock3 size={14} /><span>Historical import continues in the background.</span></div><Button variant="primary" onClick={() => { void continueToCogs(); }} disabled={!progress?.canContinue || pendingAction !== null}>Continue to COGS <ArrowRight size={15} /></Button></StepNavigation>
    </section>
  );
}
