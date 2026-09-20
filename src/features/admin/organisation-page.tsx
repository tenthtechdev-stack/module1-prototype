'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowRight, Building2, Pencil, ShieldCheck, Store, Users } from 'lucide-react';
import { PageHeader } from '@/src/components/product/patterns';
import { Button } from '@/src/components/ui/actions';
import { Badge, useToast } from '@/src/components/ui/feedback';
import { Field, Input } from '@/src/components/ui/forms';
import { Modal } from '@/src/components/ui/overlays';
import { formatDate } from '@/src/domain/calculations';
import { useAdmin } from './admin-context';

export function OrganisationPage() {
  const { orgSlug, organisation, setOrganisation, companies, accounts, users, recordAudit } = useAdmin();
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(organisation.name);
  function save(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    recordAudit({ action: 'Organisation updated', area: 'Organisation', entity: name.trim(), before: organisation.name, after: name.trim() });
    setOrganisation(current => ({ ...current, name: name.trim() }));
    setEditing(false); showToast('Organisation details updated');
  }
  return <div className="admin-page">
    <PageHeader eyebrow="Tenant Administration" title="Organisation" description="Manage the workspace your companies and teams share." actions={<Button variant="primary" onClick={() => { setName(organisation.name); setEditing(true); }}><Pencil size={14} />Edit organisation</Button>} />
    <div className="admin-stats"><article><small>Organisation status</small><strong>Active</strong><span>Your workspace is ready</span></article><article><small>Companies</small><strong>{companies.length}</strong><span>{companies.filter(company => company.status === 'active').length} active trading companies</span></article><article><small>Marketplace accounts</small><strong>{accounts.length}</strong><span>Amazon, eBay and Temu</span></article><article><small>People</small><strong>{users.length}</strong><span>{users.filter(user => user.status === 'active').length} active · {users.filter(user => user.status === 'invited').length} invited</span></article></div>
    <div className="admin-two-columns">
      <section className="admin-panel"><div className="admin-organisation-summary"><span className="admin-organisation-logo">{organisation.name.split(/\s+/).slice(0, 2).map(word => word[0]).join('')}</span><div><h2>{organisation.name}</h2><p>Organisation workspace</p></div><Badge tone="positive">Active</Badge></div><div className="admin-panel-body"><dl className="admin-detail-list"><div><dt>Organisation name</dt><dd>{organisation.name}</dd></div><div><dt>Workspace slug</dt><dd>{organisation.slug}</dd></div><div><dt>Reporting currency</dt><dd>GBP · British Pound</dd></div><div><dt>Timezone</dt><dd>{organisation.timeZone}</dd></div><div><dt>Date display</dt><dd>Day · Month · Year — 15 Aug 2026</dd></div><div><dt>Created</dt><dd>{formatDate(organisation.createdAt)}</dd></div></dl></div></section>
      <section className="admin-panel"><header className="admin-panel-heading"><div><h2>Your administration workspace</h2><p>Set up the business, then give your team access.</p></div></header><Link className="admin-quick-link" href={`/o/${orgSlug}/admin/companies`}><Building2 size={19} /><span><strong>Manage companies</strong><small>Trading entities and their marketplace accounts</small></span><ArrowRight size={15} /></Link><Link className="admin-quick-link" href={`/o/${orgSlug}/admin/marketplace-accounts`}><Store size={19} /><span><strong>Connect marketplaces</strong><small>Account connections and sync status</small></span><ArrowRight size={15} /></Link><Link className="admin-quick-link" href={`/o/${orgSlug}/admin/users`}><Users size={19} /><span><strong>Invite your team</strong><small>Roles, company and account assignments</small></span><ArrowRight size={15} /></Link><Link className="admin-quick-link" href={`/o/${orgSlug}/admin/roles`}><ShieldCheck size={19} /><span><strong>Review permissions</strong><small>Understand the seven default roles</small></span><ArrowRight size={15} /></Link></section>
    </div>
    <div className="admin-access-chain"><div><small>01 · Organisation</small><strong>One shared subscription</strong><p>The workspace for your business.</p></div><ArrowRight size={17} /><div><small>02 · Companies</small><strong>Separate trading entities</strong><p>Each owns its Products and accounts.</p></div><ArrowRight size={17} /><div><small>03 · People</small><strong>Clear, assigned access</strong><p>Roles define actions; assignments define scope.</p></div></div>
    <Modal open={editing} onOpenChange={setEditing} title="Edit organisation" description="Update the name your team sees in Organisation settings."><form className="admin-form" onSubmit={save}><Field label="Organisation name"><Input autoFocus required maxLength={100} value={name} onChange={event => setName(event.target.value)} /></Field><Field label="Workspace slug" hint="The workspace URL stays the same."><Input readOnly value={organisation.slug} /></Field><p className="admin-inline-note">Reporting currency and timezone are shown for reference. This prototype supports editing the organisation name.</p><div className="admin-form-actions"><Button onClick={() => setEditing(false)}>Cancel</Button><Button variant="primary" type="submit" disabled={!name.trim()}>Save changes</Button></div></form></Modal>
  </div>;
}
