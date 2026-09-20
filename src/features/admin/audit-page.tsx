'use client';

import { useState } from 'react';
import { Eye, ScrollText } from 'lucide-react';
import { PageHeader } from '@/src/components/product/patterns';
import { Button } from '@/src/components/ui/actions';
import { Badge } from '@/src/components/ui/feedback';
import { SearchInput, Select } from '@/src/components/ui/forms';
import { Drawer } from '@/src/components/ui/overlays';
import { useAccessRuntime } from '@/src/components/rbac/access';
import { formatDate } from '@/src/domain/calculations';
import { useAdmin, type AdminAuditEvent } from './admin-context';

const timestamp = (value: string) => `${formatDate(value, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC`;
export function AuditPage() {
  const { audit, companies, companyName } = useAdmin();
  const { role, assignment } = useAccessRuntime();
  const [search, setSearch] = useState('');
  const [area, setArea] = useState('all');
  const [company, setCompany] = useState('all');
  const [selected, setSelected] = useState<AdminAuditEvent | null>(null);
  const permittedCompanies = companies.filter(item => assignment.companyIds === 'all' || assignment.companyIds.includes(item.id));
  const scoped = audit.filter(event => assignment.companyIds === 'all' || Boolean(event.companyId && assignment.companyIds.includes(event.companyId)));
  const visible = scoped.filter(event => (area === 'all' || event.area === area) && (company === 'all' || event.companyId === company) && `${event.actor} ${event.action} ${event.entity}`.toLowerCase().includes(search.trim().toLowerCase()));
  const areas = [...new Set(scoped.map(event => event.area))].sort();
  return <div className="admin-page"><PageHeader eyebrow="Tenant Administration" title="Audit" description="Review who changed what across your Organisation and its workspace." actions={<Badge><Eye size={12} />Read-only history</Badge>} />
    <div className="admin-stats"><article><small>Visible events</small><strong>{scoped.length}</strong><span>Representative activity and this session</span></article><article><small>Workspace areas</small><strong>{areas.length}</strong><span>Administration and Module 01</span></article><article><small>Current role</small><strong style={{ fontSize: 16 }}>{role.label}</strong><span>Read-only activity review</span></article><article><small>Company scope</small><strong>{assignment.companyIds === 'all' ? 'All' : permittedCompanies.length}</strong><span>History follows your assignments</span></article></div>
    <section className="admin-panel"><header className="admin-panel-heading"><div><h2>Organisation activity</h2><p>Open an event to review its details and before / after values.</p></div><ScrollText size={18} /></header><div className="admin-toolbar"><SearchInput aria-label="Search audit events" placeholder="Search actor, action or entity" value={search} onChange={event => setSearch(event.target.value)} /><Select aria-label="Filter audit by area" value={area} onChange={event => setArea(event.target.value)}><option value="all">All areas</option>{areas.map(item => <option key={item}>{item}</option>)}</Select><Select aria-label="Filter audit by Company" value={company} onChange={event => setCompany(event.target.value)}><option value="all">All assigned Companies</option>{permittedCompanies.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</Select><small>{visible.length} events</small></div>
    {visible.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Date / Time</th><th>Actor</th><th>Action / Entity</th><th>Area</th><th>Company</th><th>Details</th></tr></thead><tbody>{visible.map(event => <tr key={event.id}><td data-label="Date / Time"><strong>{formatDate(event.timestamp)}</strong><small>{formatDate(event.timestamp, { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC</small></td><td data-label="Actor">{event.actor}</td><td data-label="Action / Entity"><strong>{event.action}</strong><small>{event.entity}</small></td><td data-label="Area"><Badge>{event.area}</Badge></td><td data-label="Company">{event.companyId ? companyName(event.companyId) : 'Organisation-wide'}</td><td><Button size="compact" onClick={() => setSelected(event)} aria-label={`View ${event.action} details`}>View details</Button></td></tr>)}</tbody></table></div> : <div className="admin-empty"><h3>No matching events</h3><p>Try a different search or clear the filters.</p><Button onClick={() => { setSearch(''); setArea('all'); setCompany('all'); }}>Clear filters</Button></div>}</section>
    <Drawer open={Boolean(selected)} onOpenChange={open => !open && setSelected(null)} title={selected?.action ?? 'Event details'} description="Activity details are shown as recorded for this event.">{selected ? <><Badge>{selected.area}</Badge><dl className="admin-detail-list"><div><dt>Actor</dt><dd>{selected.actor}</dd></div><div><dt>Date / Time</dt><dd>{timestamp(selected.timestamp)}</dd></div><div><dt>Action</dt><dd>{selected.action}</dd></div><div><dt>Entity</dt><dd>{selected.entity}</dd></div><div><dt>Company</dt><dd>{selected.companyId ? companyName(selected.companyId) : 'Organisation-wide'}</dd></div><div><dt>Source</dt><dd>{selected.source}</dd></div>{selected.reason ? <div><dt>Reason</dt><dd>{selected.reason}</dd></div> : null}</dl><div className="admin-audit-diff"><div><small>Before</small><p>{selected.before ?? 'No previous value'}</p></div><div><small>After</small><p>{selected.after ?? 'No value change recorded'}</p></div></div><Button onClick={() => setSelected(null)}>Done</Button></> : null}</Drawer>
  </div>;
}
