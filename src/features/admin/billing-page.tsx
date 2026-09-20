'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Boxes, ChartNoAxesCombined, CheckCircle2, CreditCard, LockKeyhole } from 'lucide-react';
import { PageHeader } from '@/src/components/product/patterns';
import { Button } from '@/src/components/ui/actions';
import { Badge } from '@/src/components/ui/feedback';
import { Drawer } from '@/src/components/ui/overlays';
import { useAccessRuntime } from '@/src/components/rbac/access';
import { useAnalysisContext } from '@/src/components/providers/analysis-context-provider';
import { formatDate } from '@/src/domain/calculations';
import type { ModuleEntitlementKey } from '@/src/domain/models';
import { useAdmin } from './admin-context';

const modules: Array<{ key: ModuleEntitlementKey; name: string }> = [
  { key: 'marketplace-profitability', name: 'Marketplace Profitability & Analytics' },
  { key: 'products-inventory', name: 'Products & Inventory' },
  { key: 'purchasing-suppliers', name: 'Purchasing & Suppliers' },
  { key: 'sales-customers', name: 'Sales & Customers' },
  { key: 'warehouse', name: 'Warehouse' },
  { key: 'fulfilment', name: 'Fulfilment' },
  { key: 'finance', name: 'Finance' },
  { key: 'communications', name: 'Communications' },
  { key: 'platform-completion', name: 'Platform Completion' },
];
export function BillingPage() {
  const { orgSlug, organisation } = useAdmin();
  const { workspace } = useAnalysisContext();
  const { subscriptionStatus, entitlements } = useAccessRuntime();
  const [details, setDetails] = useState(false);
  const active = subscriptionStatus === 'active' || subscriptionStatus === 'trialing';
  const enabled = entitlements.has('marketplace-profitability');
  return <div className="admin-page"><PageHeader eyebrow="Tenant Administration" title="Billing & Modules" description="Your subscription and module entitlements, with team permissions managed separately." />
    <section className="admin-panel"><div className="admin-plan-card"><span className="admin-plan-icon"><CreditCard size={25} /></span><div><Badge tone={active ? 'positive' : 'warning'}>{active ? 'Active' : subscriptionStatus.replaceAll('_', ' ')}</Badge><h2>Test Plan</h2><p>{organisation.name} · Organisation subscription</p></div><Button onClick={() => setDetails(true)}>View billing details<ArrowRight size={14} /></Button></div><div className="admin-panel-body"><p style={{ marginBottom: 0 }}>Commercial pricing is being finalised. This workspace demonstrates Module 01 access through the Test Plan.</p></div></section>
    <div className="admin-access-chain"><div><small>01 · Subscription</small><strong>Test Plan · {active ? 'Active' : 'Restricted'}</strong><p>The organisation’s plan status.</p></div><ArrowRight size={17} /><div><small>02 · Module entitlement</small><strong>Module 01 · {enabled ? 'Enabled' : 'Not enabled'}</strong><p>The business functionality included.</p></div><ArrowRight size={17} /><div><small>03 · Team access</small><strong>Role + assignments</strong><p>The actions and data each person can access.</p></div></div>
    <section className="admin-panel"><header className="admin-panel-heading"><div><h2>Business modules</h2><p>{enabled ? '1 enabled module' : 'No enabled modules'} · Future modules are not available in this workspace.</p></div><Boxes size={19} /></header><div className="admin-module-grid">{modules.map((module, index) => { const isEnabled = index === 0 && enabled; return <article key={module.key} className={`admin-module-card${isEnabled ? ' enabled' : ''}`}><div><small>Module {String(index + 1).padStart(2, '0')}</small>{isEnabled ? <CheckCircle2 size={17} /> : <LockKeyhole size={16} />}</div><h3>{module.name}</h3><div><Badge tone={isEnabled ? 'positive' : 'neutral'}>{isEnabled ? 'Enabled' : 'Not enabled'}</Badge></div><p>{index === 0 ? isEnabled ? 'Amazon, eBay and Temu performance, costs, expenses and reporting.' : 'This organisation does not currently have Module 01 access.' : 'Coming later · not available to activate.'}</p></article>; })}</div></section>
    <p className="admin-inline-note">Module access does not grant administration or financial permissions. <Link className="admin-text-link" href={`/o/${orgSlug}/admin/roles`}>Review Roles & Permissions</Link> to see how access is assigned.</p>
    <Drawer open={details} onOpenChange={setDetails} title="Billing details" description="Subscription details for this Organisation."><div className="admin-form"><span className="admin-plan-icon"><ChartNoAxesCombined size={24} /></span><dl className="admin-detail-list"><div><dt>Organisation</dt><dd>{organisation.name}</dd></div><div><dt>Plan</dt><dd>Test Plan</dd></div><div><dt>Status</dt><dd><Badge tone={active ? 'positive' : 'warning'}>{active ? 'Active' : subscriptionStatus.replaceAll('_', ' ')}</Badge></dd></div><div><dt>Next review</dt><dd>{workspace.subscription.renewsAt ? formatDate(workspace.subscription.renewsAt) : 'Not scheduled'}</dd></div><div><dt>Module 01</dt><dd>{enabled ? 'Enabled' : 'Not enabled'}</dd></div><div><dt>Commercial price</dt><dd>Not yet finalised</dd></div></dl><p className="admin-inline-note">No payment is collected here. Billing changes and payment methods will be available when commercial plans are approved.</p><Button onClick={() => setDetails(false)}>Done</Button></div></Drawer>
  </div>;
}
