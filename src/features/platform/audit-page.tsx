'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Info } from 'lucide-react';
import { Button } from '@/src/components/ui/actions';
import { Badge } from '@/src/components/ui/feedback';
import { Select } from '@/src/components/ui/forms';
import { Drawer } from '@/src/components/ui/overlays';
import { usePlatform } from './platform-context';
import { OrganisationLink, PlatformEmpty, PlatformPage, PlatformPanel, formatPlatformDate } from './platform-ui';
import './operations.css';

export function PlatformAuditPage() {
  const { organisations, audit } = usePlatform();
  const searchParams = useSearchParams();
  const [organisation, setOrganisation] = useState(searchParams.get('organisation') ?? 'all');
  const [action, setAction] = useState('all');
  const [area, setArea] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const actions = Array.from(new Set(audit.map(event => event.action))).sort();
  const areas = Array.from(new Set(audit.map(event => event.area))).sort();
  const filtered = audit.filter(event => (organisation === 'all' || event.organisationId === organisation) && (action === 'all' || event.action === action) && (area === 'all' || event.area === area)).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const selected = audit.find(event => event.id === selectedId);
  const selectedOrganisation = organisations.find(item => item.id === selected?.organisationId);
  const hasFilters = organisation !== 'all' || action !== 'all' || area !== 'all';

  return <PlatformPage title="Platform Audit" description="Review Platform Admin activity across Organisations, subscriptions and entitlements." actions={<Badge tone="info">Prototype history</Badge>}>
    <PlatformPanel title="Platform activity" description="Newest first. Actions taken in this prototype appear here as they happen." actions={<Badge>{filtered.length} of {audit.length} events</Badge>}>
      <div className="platform-filters">
        <Select aria-label="Filter audit by Organisation" value={organisation} onChange={event => setOrganisation(event.target.value)}><option value="all">All Organisations</option>{organisations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</Select>
        <Select aria-label="Filter audit by action" value={action} onChange={event => setAction(event.target.value)}><option value="all">All actions</option>{actions.map(item => <option key={item} value={item}>{item}</option>)}</Select>
        <Select aria-label="Filter audit by area" value={area} onChange={event => setArea(event.target.value)}><option value="all">All areas</option>{areas.map(item => <option key={item} value={item}>{item}</option>)}</Select>
        {hasFilters ? <Button variant="ghost" size="compact" onClick={() => { setOrganisation('all'); setAction('all'); setArea('all'); }}>Clear filters</Button> : null}
      </div>
      {filtered.length ? <div className="platform-table-wrap"><table className="platform-table platform-operation-table"><thead><tr><th>Timestamp (UTC)</th><th>Platform Admin</th><th>Action</th><th>Organisation</th><th>Area</th><th>Details</th></tr></thead><tbody>{filtered.map(event => {
        const owner = organisations.find(item => item.id === event.organisationId);
        return <tr key={event.id}>
          <td data-label="Timestamp (UTC)"><time dateTime={event.at}>{formatPlatformDate(event.at)}</time></td>
          <td data-label="Platform Admin">{event.actor}</td>
          <td data-label="Action"><button type="button" className="platform-operation-action" onClick={() => setSelectedId(event.id)} aria-label={`View ${event.action} event`}>{event.action}</button></td>
          <td data-label="Organisation">{owner ? <OrganisationLink organisation={owner} /> : 'Platform-wide'}</td>
          <td data-label="Area"><Badge>{event.area}</Badge></td>
          <td data-label="Details"><div className="platform-operation-issue">{event.details}</div></td>
        </tr>;
      })}</tbody></table></div> : <PlatformEmpty title="No matching audit events" description="Try a different Organisation, action or area to find platform activity." />}
      <div className="platform-operation-caption"><Info size={14} /><span>Representative history plus actions made in this prototype. Select an action to inspect its event details.</span></div>
    </PlatformPanel>
    <Drawer open={Boolean(selected)} onOpenChange={open => { if (!open) setSelectedId(null); }} title={selected?.action ?? 'Audit event'} description="Platform-level administration activity for the selected Organisation.">
      {selected ? <div className="platform-operation-drawer"><Badge>{selected.area}</Badge><dl className="platform-detail-list"><div><dt>Timestamp</dt><dd>{formatPlatformDate(selected.at)}</dd></div><div><dt>Platform Admin</dt><dd>{selected.actor}</dd></div><div><dt>Action</dt><dd>{selected.action}</dd></div><div><dt>Organisation</dt><dd>{selectedOrganisation ? <OrganisationLink organisation={selectedOrganisation} /> : 'Platform-wide'}</dd></div><div><dt>Area</dt><dd>{selected.area}</dd></div><div><dt>Event reference</dt><dd>{selected.id}</dd></div></dl><section><h3>Details</h3><p className="platform-operation-detail-copy">{selected.details}</p></section><p className="platform-note">Prototype audit event. This history demonstrates Platform Admin activity across customer Organisations.</p></div> : null}
    </Drawer>
  </PlatformPage>;
}
