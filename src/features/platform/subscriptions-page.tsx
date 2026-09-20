'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/src/components/ui/actions';
import { Field, Select } from '@/src/components/ui/forms';
import { Modal } from '@/src/components/ui/overlays';
import { usePlatform } from './platform-context';
import { PlatformPage, PlatformPanel, StatusBadge, OrganisationLink, formatPlatformDate, PlatformEmpty } from './platform-ui';
import type { PlatformOrganisation } from '@/src/services/mock/platform-data';

type PlanStatus = PlatformOrganisation['subscription']['status'];
export function PlatformSubscriptionsPage() {
  const { organisations, setSubscriptionStatus } = usePlatform();
  const query = useSearchParams();
  const [organisationId, setOrganisationId] = useState(query.get('organisation') ?? 'all');
  const [editing, setEditing] = useState<PlatformOrganisation | null>(null);
  const [status, setStatus] = useState<PlanStatus>('active');
  const filtered = organisations.filter(org => organisationId === 'all' || org.id === organisationId);
  function edit(org: PlatformOrganisation, nextStatus: PlanStatus = org.subscription.status) { setEditing(org); setStatus(nextStatus); }
  return <PlatformPage title="Subscriptions" description="Manage each organisation’s Test Plan and inspect its Module 01 access.">
    <div className="platform-access-chain"><div><small>01 · Subscription</small><strong>Is the Test Plan active?</strong><p>Plan status controls the subscription layer.</p></div><div><small>02 · Module entitlement</small><strong>Which modules are enabled?</strong><p>Managed independently for each organisation.</p></div><div><small>03 · Customer RBAC</small><strong>What can each person do?</strong><p>Roles and assignments stay with Organisation Admin.</p></div></div>
    <PlatformPanel title="Organisation subscriptions" description="Test Plan only · no commercial price or payment collection."><div className="platform-filters"><Field label="Organisation"><Select value={organisationId} onChange={event => setOrganisationId(event.target.value)}><option value="all">All organisations</option>{organisations.map(org => <option key={org.id} value={org.id}>{org.name}</option>)}</Select></Field><span className="platform-note">{filtered.length} subscriptions</span></div>
      {filtered.length ? <div className="platform-table-wrap"><table className="platform-table"><thead><tr><th>Organisation</th><th>Plan / status</th><th>Module 01 access</th><th>Start date</th><th>Test-plan review</th><th>Actions</th></tr></thead><tbody>{filtered.map(org => {
        const entitled = org.modules.includes('marketplace-profitability');
        const subscriptionActive = org.subscription.status === 'active' || org.subscription.status === 'trialing';
        const access = org.status !== 'Suspended' && org.status !== 'Setup Incomplete' && subscriptionActive && entitled;
        return <tr key={org.id}><td data-label="Organisation"><div><OrganisationLink organisation={org} /><small>{org.status}</small></div></td><td data-label="Plan / status"><div>Test Plan<small><StatusBadge status={org.subscription.status} /></small></div></td><td data-label="Module 01"><div><StatusBadge status={access ? 'Available' : 'Restricted'} /><small>{!entitled ? 'Module not enabled' : !subscriptionActive ? 'Subscription restricted' : org.status === 'Suspended' ? 'Organisation suspended' : org.status === 'Setup Incomplete' ? 'Setup incomplete' : 'Subject to customer RBAC'}</small><Link className="platform-text-link" href={`/platform/modules?organisation=${org.id}`}>Manage entitlement</Link></div></td><td data-label="Start date">{formatPlatformDate(org.subscription.startsAt)}</td><td data-label="Plan review"><div>{formatPlatformDate(org.subscription.reviewAt)}<small>Manual Test Plan review · no charge</small></div></td><td data-label="Actions"><div className="platform-row-actions">{org.subscription.status === 'active' ? <Button size="compact" onClick={() => edit(org,'suspended')}>Suspend</Button> : <Button size="compact" onClick={() => edit(org,'active')}>{org.subscription.status === 'suspended' ? 'Resume' : 'Activate'}</Button>}<Button variant="ghost" size="compact" onClick={() => edit(org)}>Change status</Button></div></td></tr>;
      })}</tbody></table></div> : <PlatformEmpty description="No organisation matches this subscription filter." />}
    </PlatformPanel>
    <p className="platform-note">Subscription changes keep module entitlements and customer permissions intact. Organisation suspension remains a separate access restriction.</p>
    <Modal open={Boolean(editing)} onOpenChange={open => { if (!open) setEditing(null); }} title="Change subscription status" description={editing ? `${editing.name} · Test Plan` : 'Test Plan'} footer={<Button variant="primary" disabled={!editing || status === editing.subscription.status} onClick={() => { if (editing) setSubscriptionStatus(editing.id,status); setEditing(null); }}>Save prototype change<ArrowRight size={14} /></Button>}><div className="platform-dialog-form"><Field label="Subscription status"><Select value={status} onChange={event => setStatus(event.target.value as PlanStatus)}><option value="active">Active</option><option value="trialing">Trial / Test Plan</option><option value="suspended">Suspended</option><option value="cancelled">Cancelled</option></Select></Field><p className="platform-note">This changes the mocked subscription only. No payment is collected. Organisation lifecycle, module entitlements and customer roles remain unchanged.</p></div></Modal>
  </PlatformPage>;
}
