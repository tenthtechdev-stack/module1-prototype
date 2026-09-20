'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Boxes, ChartNoAxesCombined, LockKeyhole } from 'lucide-react';
import { Button } from '@/src/components/ui/actions';
import { Badge } from '@/src/components/ui/feedback';
import { Field, Select } from '@/src/components/ui/forms';
import { Modal } from '@/src/components/ui/overlays';
import { usePlatform } from './platform-context';
import { PLATFORM_MODULES } from '@/src/services/mock/platform-data';
import { PlatformPage, PlatformPanel, StatusBadge, PlatformEmpty } from './platform-ui';

export function PlatformModulesPage() {
  const { organisations, setModule } = usePlatform();
  const query = useSearchParams();
  const [organisationId, setOrganisationId] = useState(query.get('organisation') ?? organisations[0].id);
  const [selected, setSelected] = useState<(typeof PLATFORM_MODULES)[number] | null>(null);
  const org = organisations.find(item => item.id === organisationId);
  const enabled = selected && org?.modules.includes(selected.key);
  return <PlatformPage title="Module Entitlements" description="Choose what each organisation is entitled to use. Subscription and customer permissions are managed separately.">
    <PlatformPanel title="Organisation module access" description="Nine business modules · Module 01 is currently available."><div className="platform-filters"><Field label="Organisation"><Select value={organisationId} onChange={event => setOrganisationId(event.target.value)}>{!org ? <option value={organisationId}>Unknown organisation</option> : null}{organisations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>{org ? <div className="platform-row-actions"><StatusBadge status={org.status} /><span className="platform-note">Test Plan: {org.subscription.status}</span><Badge tone="info">{org.modules.length} entitlement{org.modules.length === 1 ? '' : 's'}</Badge></div> : null}</div></PlatformPanel>
    {org ? <><div className="platform-module-grid">{PLATFORM_MODULES.map(module => {
      const hasModule = org.modules.includes(module.key);
      return <article key={module.key} className={`platform-module-card${hasModule ? ' enabled' : ''}`}><header><small>Module {module.number}</small>{module.available ? <ChartNoAxesCombined size={19} /> : <Boxes size={19} />}</header><h2>{module.name}</h2><div className="platform-row-actions"><Badge tone={hasModule ? 'positive' : 'neutral'}>{hasModule ? 'Enabled' : 'Not enabled'}</Badge>{!module.available ? <Badge>Future module</Badge> : null}</div><p>{module.available ? 'Marketplace performance, profitability, costs and reporting.' : 'Future module. Entitlement can be staged for this prototype; no workspace is available.'}</p><Button onClick={() => setSelected(module)} variant={module.available ? 'secondary' : 'ghost'}>{hasModule ? 'Disable entitlement' : module.available ? 'Enable entitlement' : 'Stage entitlement'}</Button></article>;
    })}</div><p className="platform-note"><LockKeyhole size={12} /> Enabling an entitlement does not activate a subscription, reactivate a suspended organisation, or grant customer permissions. Future module workspaces remain unavailable.</p></> : <PlatformEmpty description="Choose an existing organisation to manage its modules." />}
    <Modal open={Boolean(selected)} onOpenChange={open => { if (!open) setSelected(null); }} title={enabled ? 'Disable module entitlement?' : 'Enable module entitlement?'} description={org && selected ? `${org.name} · ${selected.name}` : 'Module entitlement'} footer={<Button variant={enabled ? 'danger' : 'primary'} onClick={() => { if (org && selected) setModule(org.id, selected.key, !enabled); setSelected(null); }}>{enabled ? 'Disable entitlement' : 'Enable entitlement'}</Button>}><div className="platform-dialog-form"><p>{enabled ? 'This removes the organisation’s mocked entitlement to this module.' : 'This adds the module to the organisation’s mocked entitlements.'}</p>{selected && !selected.available ? <p className="platform-note">Future module: this stages an entitlement only. It does not unlock any new screens or functionality.</p> : null}<p className="platform-note">Subscription status and customer roles will remain unchanged. This change will appear in Platform Audit.</p></div></Modal>
  </PlatformPage>;
}
