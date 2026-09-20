'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Info } from 'lucide-react';
import { Button } from '@/src/components/ui/actions';
import { Badge } from '@/src/components/ui/feedback';
import { Select } from '@/src/components/ui/forms';
import { usePlatform } from './platform-context';
import { OrganisationLink, PlatformEmpty, PlatformPage, PlatformPanel, formatPlatformDate } from './platform-ui';
import './operations.css';

const SAMPLE_END = Date.parse('2026-09-19T10:00:00Z');
const SAMPLE_DAY_START = Date.parse('2026-09-19T00:00:00Z');
const PERIODS = [{ value: '1', label: 'Today' }, { value: '7', label: 'Last 7 days' }, { value: '30', label: 'Last 30 days' }];
const number = (value: number) => value.toLocaleString('en-GB');

export function PlatformAIUsagePage() {
  const { organisations, usage } = usePlatform();
  const searchParams = useSearchParams();
  const [organisation, setOrganisation] = useState(searchParams.get('organisation') ?? 'all');
  const [period, setPeriod] = useState('7');
  const periodStart = SAMPLE_DAY_START - (Number(period) - 1) * 24 * 60 * 60 * 1000;
  const filtered = usage.filter(item => (organisation === 'all' || item.organisationId === organisation) && Date.parse(item.at) >= periodStart && Date.parse(item.at) <= SAMPLE_END).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const totalRequests = filtered.reduce((sum, item) => sum + item.requests, 0);
  const features = Array.from(new Set(filtered.map(item => item.feature))).map(feature => {
    const entries = filtered.filter(item => item.feature === feature);
    return { feature, requests: entries.reduce((sum, item) => sum + item.requests, 0), contexts: Array.from(new Set(entries.map(item => item.context))).join(' · ') };
  }).sort((a, b) => b.requests - a.requests);
  const organisationUsage = organisations.map(item => {
    const entries = filtered.filter(entry => entry.organisationId === item.id);
    return { organisation: item, requests: entries.reduce((sum, entry) => sum + entry.requests, 0), features: Array.from(new Set(entries.map(entry => entry.feature))), latest: entries[0]?.at };
  }).filter(item => item.requests > 0).sort((a, b) => b.requests - a.requests);

  return <PlatformPage title="AI / Copilot Usage" description="See how Organisations use Copilot across product features and workspaces." actions={<Badge tone="info">Illustrative usage</Badge>}>
    <div className="platform-filters">
      <Select aria-label="Filter AI usage by Organisation" value={organisation} onChange={event => setOrganisation(event.target.value)}><option value="all">All Organisations</option>{organisations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</Select>
      <Select aria-label="Filter AI usage by period" value={period} onChange={event => setPeriod(event.target.value)}>{PERIODS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</Select>
      {organisation !== 'all' || period !== '7' ? <Button variant="ghost" size="compact" onClick={() => { setOrganisation('all'); setPeriod('7'); }}>Reset filters</Button> : null}
      <span className="platform-muted">Sample period ending 19 Sep 2026 · UTC</span>
    </div>
    <div className="platform-stat-grid">
      <article className="platform-stat"><small>Copilot requests</small><strong>{number(totalRequests)}</strong><span>{PERIODS.find(item => item.value === period)?.label} in sample data</span></article>
      <article className="platform-stat"><small>Organisations using Copilot</small><strong>{organisationUsage.length}</strong><span>Within the selected filters</span></article>
      <article className="platform-stat"><small>Features used</small><strong>{features.length}</strong><span>Distinct product features</span></article>
      <article className="platform-stat"><small>Most recent usage</small><strong className="platform-operation-latest">{filtered.length ? formatPlatformDate(filtered[0].at) : 'No usage'}</strong><span>Illustrative activity timestamp</span></article>
    </div>
    {filtered.length ? <>
      <div className="platform-two-col">
        <PlatformPanel title="Usage by Organisation" description="Total requests in the selected sample period.">
          <div className="platform-table-wrap"><table className="platform-table platform-operation-table"><thead><tr><th>Organisation</th><th>Requests</th><th>Recent usage</th></tr></thead><tbody>{organisationUsage.map(item => <tr key={item.organisation.id}><td data-label="Organisation"><div className="platform-operation-identity"><OrganisationLink organisation={item.organisation} /><small>{item.features.join(' · ')}</small></div></td><td data-label="Requests"><span className="platform-operation-count">{number(item.requests)}</span></td><td data-label="Recent usage">{formatPlatformDate(item.latest ?? null)}</td></tr>)}</tbody></table></div>
        </PlatformPanel>
        <PlatformPanel title="Feature / context" description="What Organisations are asking Copilot to help with."><div className="platform-panel-body platform-operation-features">{features.map(item => <div className="platform-operation-feature" key={item.feature}><div><strong>{item.feature}</strong><span>{number(item.requests)} requests</span></div><meter min={0} max={totalRequests} value={item.requests} aria-label={`${item.feature}: ${number(item.requests)} of ${number(totalRequests)} requests`} /><p>{item.contexts}</p></div>)}</div></PlatformPanel>
      </div>
      <PlatformPanel title="Recent usage" description="Small illustrative activity batches grouped by Organisation and feature." actions={<Badge>{filtered.length} activity records</Badge>}>
        <div className="platform-table-wrap"><table className="platform-table platform-operation-table"><thead><tr><th>Organisation</th><th>Feature</th><th>Context</th><th>Copilot requests</th><th>Last used</th></tr></thead><tbody>{filtered.map(item => {
          const owner = organisations.find(candidate => candidate.id === item.organisationId);
          return <tr key={item.id}><td data-label="Organisation">{owner ? <OrganisationLink organisation={owner} /> : 'Unavailable'}</td><td data-label="Feature">{item.feature}</td><td data-label="Context">{item.context}</td><td data-label="Copilot requests"><span className="platform-operation-count">{number(item.requests)}</span></td><td data-label="Last used">{formatPlatformDate(item.at)}</td></tr>;
        })}</tbody></table></div>
      </PlatformPanel>
    </> : <PlatformPanel title="Usage activity"><PlatformEmpty title="No Copilot usage in this period" description="Try another Organisation or a longer period to explore the illustrative usage history." /></PlatformPanel>}
    <div className="platform-note"><Info size={15} /><span>Request counts are mocked to demonstrate product usage monitoring. Provider billing, token costs and customer charges are not modelled.</span></div>
  </PlatformPage>;
}
