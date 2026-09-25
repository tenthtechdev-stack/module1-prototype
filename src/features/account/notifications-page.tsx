'use client';

import { useState } from 'react';
import { BellRing, Boxes, KeyRound, Mail, RefreshCw, Save, ShieldAlert, UserRoundCheck, WalletCards } from 'lucide-react';
import { Button } from '@/src/components/ui/actions';
import { Switch } from '@/src/components/ui/forms';
import { Alert, Badge, useToast } from '@/src/components/ui/feedback';
import { AccountPageHeading, AccountPanel } from '@/src/features/account/account-ui';
import { useNotificationPreferences, type NotificationPreferenceKey, type NotificationPreferences } from '@/src/features/account/account-store';

const PREFERENCE_ROWS = [
  { key: 'financialApprovals' as const, label: 'Financial approvals', description: 'Approval requests and financially governed changes.', icon: WalletCards },
  { key: 'cogsIssues' as const, label: 'COGS / cost issues', description: 'Missing costs, coverage gaps, and imports awaiting review.', icon: Boxes },
  { key: 'marketplaceSync' as const, label: 'Marketplace sync issues', description: 'Delayed, failed, paused, or recovered sync activity.', icon: RefreshCw },
  { key: 'marketplaceAuthentication' as const, label: 'Marketplace authentication', description: 'Expired or disconnected marketplace credentials.', icon: KeyRound },
  { key: 'userActivity' as const, label: 'User & invitation activity', description: 'Invitations accepted and membership changes.', icon: UserRoundCheck },
  { key: 'securityAlerts' as const, label: 'Security alerts', description: 'Password, two-factor, and unfamiliar session notices.', icon: ShieldAlert },
];

function NotificationPreferencesEditor({ preferences, savePreferences }: { preferences: NotificationPreferences; savePreferences: (preferences: NotificationPreferences) => void }) {
  const [draft, setDraft] = useState(preferences);
  const { showToast } = useToast();

  const changed = JSON.stringify(draft) !== JSON.stringify(preferences);

  function toggle(key: NotificationPreferenceKey, channel: 'inApp' | 'email', checked: boolean) {
    setDraft((current) => ({ ...current, [key]: { ...current[key], [channel]: checked } }));
  }

  function save() {
    savePreferences(draft);
    showToast('Notification preferences saved in this browser.', 'positive');
  }

  return <div className="account-page account-notifications-page">
    <AccountPageHeading eyebrow="My account" title="Notifications" description="Choose which account and operational updates you want to see." />
    <div className="account-page-stack">
      <AccountPanel icon={BellRing} title="Notification preferences" description="Preferences follow your personal account across organisation workspaces." aside={<Badge tone="info">Prototype preferences</Badge>}>
        <Alert tone="info" title="No delivery service is connected">In-app and email channels below are a UX preview. Saving them does not send email or create push subscriptions.</Alert>
        <div className="account-preference-table" role="table" aria-label="Notification channel preferences">
          <div className="account-preference-header" role="row"><span role="columnheader">Activity</span><span role="columnheader"><BellRing size={13} /> In-app</span><span role="columnheader"><Mail size={13} /> Email</span></div>
          {PREFERENCE_ROWS.map((row) => <div className="account-preference-row" role="row" key={row.key}>
            <div role="cell" className="account-preference-label"><span><row.icon size={17} aria-hidden="true" /></span><div><strong>{row.label}</strong><small>{row.description}</small></div></div>
            <div role="cell" className="account-preference-channel"><Switch label={`In-app ${row.label}`} checked={draft[row.key].inApp} onCheckedChange={(checked) => toggle(row.key, 'inApp', checked)} /></div>
            <div role="cell" className="account-preference-channel"><Switch label={`Email ${row.label}`} checked={draft[row.key].email} onCheckedChange={(checked) => toggle(row.key, 'email', checked)} /></div>
          </div>)}
        </div>
        <div className="account-form-actions"><Button type="button" variant="ghost" disabled={!changed} onClick={() => setDraft(preferences)}>Discard changes</Button><Button type="button" variant="primary" disabled={!changed} onClick={save}><Save size={15} /> Save preferences</Button></div>
      </AccountPanel>
      <AccountPanel icon={Mail} title="Channel notes" description="How these prototype controls map to a future delivery implementation.">
        <div className="account-channel-notes"><article><span><BellRing size={17} /></span><div><strong>In-app</strong><p>Updates appear in the header notification centre with unread state, timestamps, area labels, and deep links.</p></div></article><article><span><Mail size={17} /></span><div><strong>Email</strong><p>Visual preference only. A production email service, templates, delivery records, and unsubscribe handling are still required.</p></div></article></div>
      </AccountPanel>
    </div>
  </div>;
}

export function NotificationsPage() {
  const [preferences, savePreferences] = useNotificationPreferences();
  return <NotificationPreferencesEditor key={JSON.stringify(preferences)} preferences={preferences} savePreferences={savePreferences} />;
}
