import type { DataFreshness, Marketplace, SyncStatus } from '@/src/domain/models';
import { HelpCircle } from 'lucide-react';
import { formatMoney, formatPercentage, normaliseDisplayBps } from '@/src/domain/calculations';
import { Badge, type Tone } from '@/src/components/ui/feedback';
import { Tooltip } from '@/src/components/ui/overlays';

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: React.ReactNode }) {
  return <header className="page-heading"><div>{eyebrow ? <p>{eyebrow}</p> : null}<h1>{title}</h1>{description ? <span>{description}</span> : null}</div>{actions ? <div className="page-heading-actions">{actions}</div> : null}</header>;
}

export function PageToolbar({ children }: { children: React.ReactNode }) { return <div className="page-toolbar">{children}</div>; }
export function FilterBar({ children }: { children: React.ReactNode }) { return <div className="filter-bar">{children}</div>; }
export function SectionHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) { return <header className="section-header"><div><h2>{title}</h2>{description ? <p>{description}</p> : null}</div>{actions}</header>; }
export function MetricValue({ label, value, detail, help }: { label: string; value: string; detail?: string; help?: string }) { return <div className="metric-value"><div className="metric-value-label"><small>{label}</small>{help ? <Tooltip label={help}><button type="button" className="metric-help" aria-label={`About ${label}`}><HelpCircle size={13} /></button></Tooltip> : null}</div><strong>{value}</strong>{detail ? <span>{detail}</span> : null}</div>; }
export function MoneyValue({ pence, sensitive = false, allowed = true }: { pence: number | null; sensitive?: boolean; allowed?: boolean }) { return <span className="numeric">{sensitive && !allowed ? 'Restricted' : formatMoney(pence)}</span>; }
export function PercentageDelta({ bps }: { bps: number | null }) { const value = normaliseDisplayBps(bps); return <span className={value === null || value === 0 ? 'delta neutral' : value > 0 ? 'delta positive' : 'delta negative'}>{formatPercentage(value, { signed: true })}</span>; }
export function MarketplaceBadge({ marketplace }: { marketplace: Marketplace }) {
  const label = marketplace === 'ebay' ? 'eBay' : marketplace[0].toUpperCase() + marketplace.slice(1);
  return <Badge tone={marketplace === 'amazon' ? 'warning' : marketplace === 'ebay' ? 'info' : 'neutral'}>{label}</Badge>;
}
export function CompanyBadge({ name }: { name: string }) { return <Badge>{name}</Badge>; }
export function AttentionBadge({ count }: { count: number }) { return <Badge tone={count ? 'warning' : 'positive'}>{count ? `${count} need attention` : 'No issues'}</Badge>; }

const statusTone: Record<SyncStatus, Tone> = {
  connected: 'positive', synced: 'positive', syncing: 'info', pending: 'neutral', delayed: 'warning', failed: 'negative', retrying: 'info', disconnected: 'neutral', authentication_required: 'negative',
};

export function SyncStatusBadge({ status }: { status: SyncStatus }) { return <Badge tone={statusTone[status]}>{status.replaceAll('_', ' ')}</Badge>; }
export function FreshnessIndicator({ freshness }: { freshness: DataFreshness }) { return <Badge tone={freshness.state === 'fresh' ? 'positive' : freshness.state === 'warning' ? 'warning' : freshness.state === 'error' ? 'negative' : 'info'}>{freshness.label}</Badge>; }
