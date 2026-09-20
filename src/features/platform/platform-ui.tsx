import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { PageHeader, SectionHeader } from '@/src/components/product/patterns';
import { EmptyState } from '@/src/components/states/states';
import { Badge, type Tone } from '@/src/components/ui/feedback';
import type { PlatformOrganisation } from '@/src/services/mock/platform-data';

export function PlatformPage({ title, description, actions, children }: { title: string; description: string; actions?: ReactNode; children: ReactNode }) {
  return <div className="platform-page"><PageHeader eyebrow="Tenth Tech · Platform administration" title={title} description={description} actions={actions} />{children}</div>;
}

export function PlatformPanel({ title, description, actions, children }: { title: string; description?: string; actions?: ReactNode; children: ReactNode }) {
  return <section className="platform-panel"><SectionHeader title={title} description={description} actions={actions} /><div className="platform-panel-body">{children}</div></section>;
}

const statusTones: Record<string, Tone> = {
  available: 'positive', restricted: 'warning', 'needs attention': 'warning', active: 'positive', healthy: 'positive', enabled: 'positive', succeeded: 'positive',
  syncing: 'info', trialing: 'info', 'trial / test plan': 'info',
  delayed: 'warning', suspended: 'warning', 'setup incomplete': 'warning',
  failed: 'negative', 'authentication required': 'negative',
  cancelled: 'neutral', disabled: 'neutral', 'not enabled': 'neutral', 'future module': 'neutral',
};

export function StatusBadge({ status }: { status: string }) {
  const label = status === 'trialing' ? 'Trial / Test Plan' : status.replaceAll('_', ' ');
  return <Badge tone={statusTones[label.toLowerCase()] ?? 'neutral'}>{label.charAt(0).toUpperCase() + label.slice(1)}</Badge>;
}

export function PlatformEmpty({ title = 'No matching results', description = 'Try changing or clearing the filters.' }: { title?: string; description?: string }) {
  return <EmptyState title={title} description={description} />;
}

export function OrganisationLink({ organisation }: { organisation: PlatformOrganisation }) {
  return <Link className="platform-text-link" href={`/platform/organisations/${organisation.id}`}>{organisation.name}<ArrowUpRight size={13} aria-hidden="true" /></Link>;
}

const platformDate = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });

export function formatPlatformDate(value: string | null) {
  return value ? `${platformDate.format(new Date(value))} UTC` : 'Never';
}
