'use client';

import Link from 'next/link';
import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, RefreshCw, ShieldAlert } from 'lucide-react';
import type { DashboardAttentionItem, DashboardSyncItem } from '@/src/domain/analytics';
import { useAccess } from '@/src/components/rbac/access';
import { TransactionsLink } from '@/src/features/transactions/transaction-links';

function SyncIcon({ state }: { state: DashboardSyncItem['state'] }) {
  if (state === 'synced') return <CheckCircle2 size={15} />;
  if (state === 'failed') return <ShieldAlert size={15} />;
  if (state === 'syncing') return <RefreshCw size={15} className="spin" />;
  return <Clock3 size={15} />;
}

export function AttentionSyncSummary({ attention, sync, orgSlug }: { attention: DashboardAttentionItem[]; sync: DashboardSyncItem[]; orgSlug: string }) {
  const cogsAccess = useAccess('cogs.view');
  const productsAccess = useAccess('products.view');
  const syncAccess = useAccess('sync.view');
  const retryAccess = useAccess('sync.retry');
  const marketplaceManagement = useAccess('marketplaces.manage');
  const canOpenAttention = (item: DashboardAttentionItem) => item.href.includes('/cogs')
    ? cogsAccess.allowed
    : item.href.includes('/operations/sync-health')
      ? syncAccess.allowed
      : productsAccess.allowed;
  return <section className="dashboard-section operations-summary" aria-labelledby="attention-title">
    <div className="attention-panel"><header><div><h2 id="attention-title">Needs Attention <span>{attention.length}</span></h2><p>Operational issues that may affect the selected financial view.</p></div>{syncAccess.allowed ? <Link href={`/o/${orgSlug}/operations/attention`}>View all <ArrowRight size={13} /></Link> : null}</header>
      {attention.length ? <div className="attention-list">{attention.map((item) => {
        const content = <><AlertTriangle size={14} /><span><strong>{item.title}</strong><small>{item.detail}</small></span><b className={item.severity}>{item.severity}</b></>;
        if (item.id === 'losses') return <TransactionsLink profitability="loss-making" key={item.id}>{content}</TransactionsLink>;
        return canOpenAttention(item) ? <Link href={item.href} key={item.id}>{content}</Link> : <div key={item.id}>{content}</div>;
      })}</div> : <div className="mini-empty"><CheckCircle2 size={17} /><span>No material issues in the selected scope.</span></div>}
    </div>
    <div className="sync-panel"><header><div><h2>Marketplace data</h2><p>Can you trust the selected source data?</p></div>{syncAccess.allowed ? <Link href={`/o/${orgSlug}/operations/sync-health`}>View Sync Health</Link> : null}</header>
      <div className="sync-list">{sync.map((item) => <div key={item.marketplace} className={item.state}><span><SyncIcon state={item.state} /><strong>{item.label}</strong></span><span><b>{item.state === 'synced' ? 'Synced' : item.state === 'partial' ? 'Partial' : item.state === 'failed' ? 'Action required' : 'Importing'}</b><small>{item.detail}</small>{item.state === 'failed' && marketplaceManagement.allowed ? <Link href={`/o/${orgSlug}/admin/marketplace-accounts?marketplace=${item.marketplace}`}>Reconnect {item.label}</Link> : item.state === 'failed' && retryAccess.allowed ? <Link href={`/o/${orgSlug}/operations/sync-health`}>Resolve sync</Link> : null}</span></div>)}</div>
    </div>
  </section>;
}
