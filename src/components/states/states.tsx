import { AlertCircle, Inbox, RefreshCw } from 'lucide-react';

export function PageSkeleton() {
  return (
    <div className="page-skeleton" aria-busy="true" aria-label="Loading page">
      <span className="skeleton skeleton-kicker" />
      <span className="skeleton skeleton-title" />
      <span className="skeleton skeleton-subtitle" />
      <div className="skeleton skeleton-panel" />
    </div>
  );
}

export function EmptyState({ title = 'Nothing to show', description = 'Try changing the current filters or data scope.', actions }: { title?: string; description?: string; actions?: React.ReactNode }) {
  return (
    <section className="inline-state" role="status">
      <span className="inline-state-icon"><Inbox size={20} /></span>
      <strong>{title}</strong>
      <p>{description}</p>
      {actions ? <div className="inline-actions">{actions}</div> : null}
    </section>
  );
}

export function ErrorState({ title = 'We could not load this data', description = 'The mock service returned an error. Try the request again.', onRetry }: { title?: string; description?: string; onRetry?: () => void }) {
  return (
    <section className="inline-state error" role="alert">
      <span className="inline-state-icon"><AlertCircle size={20} /></span>
      <strong>{title}</strong>
      <p>{description}</p>
      {onRetry ? <button className="secondary-button" onClick={onRetry}><RefreshCw size={14} /> Retry</button> : null}
    </section>
  );
}

export function StatusIndicator({ tone, label }: { tone: 'positive' | 'warning' | 'negative' | 'info' | 'neutral'; label: string }) {
  return <span className={`status-indicator ${tone}`}><i aria-hidden="true" />{label}</span>;
}

export const LoadingState = PageSkeleton;
