'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  CircleHelp,
  Copy,
  Mail,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Store,
  UserPlus,
  Users,
} from 'lucide-react';
import { ROLE_PRESETS } from '@/src/domain/permissions';
import { useOnboarding } from '@/src/components/providers/onboarding-provider';
import { usePrototype } from '@/src/components/providers/prototype-provider';
import { Button } from '@/src/components/ui/actions';
import { Checkbox, Field, Input, Select } from '@/src/components/ui/forms';
import { Alert, Badge, Skeleton, useToast } from '@/src/components/ui/feedback';
import { ConfirmationDialog } from '@/src/components/ui/overlays';
import { SyncStatusBadge } from '@/src/components/product/patterns';

const TENANT_ROLES = ROLE_PRESETS.filter((role) => role.surface === 'tenant');

function formatCount(value: number) {
  return new Intl.NumberFormat('en-GB').format(value);
}

function StepHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <header className="onboarding-step-heading"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></header>;
}

export function UsersStep() {
  const router = useRouter();
  const { showToast } = useToast();
  const { snapshot, loading, pendingAction, inviteUser, resendInvitation, removeInvitation, completeStep, skipStep, finish } = useOnboarding();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState('finance');
  const [companyScope, setCompanyScope] = useState('all');
  const [accountIds, setAccountIds] = useState<string[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState('');
  const [accessHelpOpen, setAccessHelpOpen] = useState(true);

  const availableAccounts = useMemo(() => snapshot?.marketplaceAccounts.filter((account) => companyScope === 'all' || account.companyId === companyScope) ?? [], [companyScope, snapshot]);

  if (loading && !snapshot) return <section className="onboarding-step-card"><Skeleton className="onboarding-heading-skeleton" /><Skeleton className="onboarding-panel-skeleton" /></section>;
  if (!snapshot?.organisation) return <Alert tone="warning" title="Organisation setup is required">Complete organisation setup before inviting team members.</Alert>;

  function resetDraft() {
    setName(''); setEmail(''); setRoleId('finance'); setCompanyScope('all'); setAccountIds([]); setFormOpen(false); setError('');
  }

  async function sendInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || !email.trim()) { setError('Enter the person’s name and a valid work email.'); return; }
    setError('');
    try {
      await inviteUser({
        name: name.trim(),
        email: email.trim(),
        roleId,
        companyIds: companyScope === 'all' ? 'all' : [companyScope],
        marketplaceAccountIds: accountIds.length ? accountIds : companyScope === 'all' ? 'all' : availableAccounts.map((account) => account.id),
        outcome: email.toLowerCase().startsWith('fail@') ? 'failure' : 'success',
      });
      showToast('Invitation sent');
      resetDraft();
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : 'The invitation could not be sent.');
    }
  }

  async function resend(invitationId: string, fail = false) {
    setError('');
    try { await resendInvitation(invitationId, fail ? 'failure' : 'success'); showToast('Invitation resent'); }
    catch (resendError) { setError(resendError instanceof Error ? resendError.message : 'The invitation could not be resent.'); }
  }

  async function remove(invitationId: string) {
    setError('');
    try { await removeInvitation(invitationId); showToast('Invitation removed', 'info'); }
    catch (removeError) { setError(removeError instanceof Error ? removeError.message : 'The invitation could not be removed.'); }
  }

  async function copyLink(id: string, token: string) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/auth/invite/${token}`);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId(''), 1800);
    } catch { setError('The invitation link could not be copied. Open it directly instead.'); }
  }

  async function continueToComplete(skip: boolean) {
    setError('');
    try {
      if (skip) await skipStep('users'); else await completeStep('users');
      await finish();
      router.push('/onboarding/complete');
    } catch (stepError) { setError(stepError instanceof Error ? stepError.message : 'Setup could not be completed yet.'); }
  }

  const companyName = (id: string) => snapshot.companies.find((company) => company.id === id)?.name ?? 'Unknown company';
  const accountName = (id: string) => snapshot.marketplaceAccounts.find((account) => account.id === id)?.displayName ?? 'Unknown account';

  return <section className="onboarding-step-card"><StepHeading eyebrow="Team access" title="Invite your team" description="The registered owner is already Organisation Admin. Additional users inherit the organisation subscription and receive role plus assignment scope." /><Alert tone="positive" title={`${snapshot.account.firstName} ${snapshot.account.lastName} is Organisation Admin`}>The initial owner has full tenant setup access. Invited employees never repeat subscription, payment or organisation onboarding.</Alert>{error ? <Alert tone="negative" title="Invitation setup needs attention">{error}</Alert> : null}<section className="onboarding-section"><header className="onboarding-section-heading"><div><h2>Pending and accepted invitations</h2><p>Fake email delivery only. Open an invitation link to test employee acceptance.</p></div><Button variant="primary" onClick={() => setFormOpen(true)}><UserPlus size={14} /> Add invitation</Button></header>{snapshot.invitations.filter((item) => item.status !== 'cancelled').length ? <div className="invitation-list">{snapshot.invitations.filter((item) => item.status !== 'cancelled').map((invitation) => { const role = TENANT_ROLES.find((item) => item.id === invitation.roleId); return <article className="invitation-row" key={invitation.id}><span className="invitation-avatar">{invitation.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</span><div className="invitation-person"><strong>{invitation.name}</strong><small>{invitation.email}</small></div><div className="invitation-scope"><strong>{role?.label ?? invitation.roleId}</strong><small>{invitation.companyIds === 'all' ? 'All companies' : invitation.companyIds.map(companyName).join(', ')}{invitation.marketplaceAccountIds === 'all' ? ' · All accounts' : invitation.marketplaceAccountIds.length ? ` · ${invitation.marketplaceAccountIds.map(accountName).join(', ')}` : ''}</small></div><Badge tone={invitation.status === 'accepted' ? 'positive' : invitation.status === 'failed' ? 'negative' : 'warning'}>{invitation.status === 'pending' ? 'Invitation pending' : invitation.status}</Badge><div className="invitation-actions">{invitation.status !== 'accepted' ? <><Link className="ui-button secondary compact" href={`/auth/invite/${invitation.token}`} target="_blank">Open invite</Link><Button size="compact" onClick={() => { void copyLink(invitation.id, invitation.token); }}><Copy size={13} /> {copiedId === invitation.id ? 'Copied' : 'Copy link'}</Button><Button size="compact" loading={pendingAction === 'invitation-resend'} onClick={() => { void resend(invitation.id); }}><RefreshCw size={13} /> Resend</Button><ConfirmationDialog trigger={<Button size="compact">Remove</Button>} title={`Remove invitation for ${invitation.name}?`} description="The invitation link will no longer be available. No accepted user account will be deleted." confirmLabel="Remove invitation" onConfirm={() => { void remove(invitation.id); }} /></> : <span>Joined organisation</span>}</div></article>; })}</div> : <div className="onboarding-empty-row"><Users size={20} /><div><strong>No additional users invited</strong><p>You can skip this step and invite people later from Administration → Users.</p></div></div>}</section>{formOpen ? <form className="onboarding-section invitation-form" onSubmit={sendInvite}><header className="onboarding-section-heading"><div><h2>New invitation</h2><p>Review the role and assignment before fake email delivery.</p></div><Badge tone="info">Draft · editable</Badge></header><div className="onboarding-form-grid two-columns"><Field label="Name"><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Emma Richardson" /></Field><Field label="Work email" hint="Use fail@… to demonstrate send failure"><Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="emma@company.co.uk" /></Field><Field label="Role template"><Select value={roleId} onChange={(event) => setRoleId(event.target.value)}>{TENANT_ROLES.map((role) => <option value={role.id} key={role.id}>{role.label}</option>)}</Select></Field><Field label="Company assignment"><Select value={companyScope} onChange={(event) => { setCompanyScope(event.target.value); setAccountIds([]); }}><option value="all">All companies</option>{snapshot.companies.map((company) => <option value={company.id} key={company.id}>{company.name}</option>)}</Select></Field></div><fieldset className="account-assignment-options"><legend>Marketplace / account assignment</legend><p>Leave all unselected to assign every account within the chosen company scope.</p>{availableAccounts.map((account) => <Checkbox key={account.id} label={`${account.displayName} (${account.marketplace})`} checked={accountIds.includes(account.id)} onChange={(event) => setAccountIds((current) => event.target.checked ? [...current, account.id] : current.filter((id) => id !== account.id))} />)}</fieldset><div className="inline-actions"><Button type="button" onClick={resetDraft}>Cancel</Button><Button variant="primary" type="submit" loading={pendingAction === 'invitation'}><Mail size={14} /> Send invitation</Button></div></form> : null}<aside className="onboarding-context-help"><button type="button" onClick={() => setAccessHelpOpen((open) => !open)} aria-expanded={accessHelpOpen} aria-controls="employee-access-help"><CircleHelp size={16} /><span>How employee access works</span></button><p id="employee-access-help" hidden={!accessHelpOpen}>Organisation subscription → Module 01 entitlement → assigned role → company and marketplace-account scope. Invitations never create new billing.</p></aside><footer className="onboarding-step-footer"><Button onClick={() => router.push('/onboarding/cogs')}><ArrowLeft size={15} /> Back</Button><div><button type="button" className="text-action" onClick={() => { void continueToComplete(true); }}>Skip for now</button><Button variant="primary" loading={pendingAction === 'finish' || pendingAction === 'step-users'} onClick={() => { void continueToComplete(false); }}>Complete setup <ArrowRight size={15} /></Button></div></footer></section>;
}

export function CompleteStep() {
  const router = useRouter();
  const { scenarioId } = usePrototype();
  const { snapshot, syncProgress, loading, pendingAction, refreshSync, finish } = useOnboarding();
  const [error, setError] = useState('');
  const [nextAnswer, setNextAnswer] = useState(false);
  const refreshSyncRef = useRef(refreshSync);
  const organisationId = snapshot?.organisation?.id;

  useEffect(() => { refreshSyncRef.current = refreshSync; }, [refreshSync]);

  useEffect(() => {
    if (!organisationId) return;
    let cancelled = false;
    void refreshSyncRef.current().catch((syncError) => { if (!cancelled) setError(syncError instanceof Error ? syncError.message : 'Sync progress could not be refreshed.'); });
    return () => { cancelled = true; };
  }, [organisationId]);

  if (loading && !snapshot) return <section className="onboarding-step-card"><Skeleton className="onboarding-heading-skeleton" /><Skeleton className="onboarding-panel-skeleton" /></section>;
  if (!snapshot?.organisation) return <Alert tone="warning" title="Setup summary unavailable">Complete organisation setup before reviewing readiness.</Alert>;
  const coverage = snapshot.cogsCoverage;
  const activeInvites = snapshot.invitations.filter((item) => item.status !== 'cancelled' && item.status !== 'failed');
  const slug = snapshot.organisation.slug;
  const completed = snapshot.session.status === 'complete';
  const moduleEnabled = scenarioId !== 'module-unavailable';
  const subscriptionActive = scenarioId !== 'past-due';
  const syncNeedsAttention = !syncProgress?.startedAt || syncProgress.status !== 'synced';
  const cogsNeedsAttention = !coverage?.reliableProfitability;
  const operationalAttention = [
    syncNeedsAttention ? 'historical marketplace sync is unfinished' : null,
    cogsNeedsAttention ? 'some product costs are still missing' : null,
  ].filter(Boolean).join(' and ');

  async function finishSetup() {
    setError('');
    try { await finish(); }
    catch (finishError) { setError(finishError instanceof Error ? finishError.message : 'Complete or skip each remaining step before finishing.'); }
  }

  return <section className="onboarding-step-card complete-step"><StepHeading eyebrow="Operational readiness" title="Setup is complete" description={operationalAttention ? `${snapshot.organisation.name} has finished onboarding. Operational attention remains: ${operationalAttention}. These conditions remain visible after you enter the workspace.` : `${snapshot.organisation.name} has finished onboarding and the readiness checks below are clear.`} />{error ? <Alert tone="warning" title="Readiness information needs attention">{error}</Alert> : null}{!subscriptionActive ? <Alert tone="warning" title="Test subscription needs attention">The Past Due Subscription scenario is active. Tenant access will be restricted to billing until the mocked subscription is restored.</Alert> : null}{!moduleEnabled ? <Alert tone="warning" title="Module 01 is unavailable">The Module Entitlement Disabled scenario is active. The tenant shell will preserve the module access restriction.</Alert> : null}<section className="readiness-summary" aria-label="Setup readiness summary"><article><span><Building2 size={18} /></span><div><strong>Organisation</strong><p>{snapshot.organisation.name}</p></div><Badge tone="positive">Ready</Badge></article><article><span><ShieldCheck size={18} /></span><div><strong>Module 01</strong><p>Marketplace Profitability &amp; Analytics</p></div><Badge tone={moduleEnabled ? 'positive' : 'warning'}>{moduleEnabled ? 'Enabled' : 'Unavailable'}</Badge></article><article><span><Store size={18} /></span><div><strong>Companies &amp; accounts</strong><p>{snapshot.companies.length} companies · {snapshot.marketplaceAccounts.length} marketplace accounts</p></div><Badge tone={snapshot.marketplaceAccounts.length ? 'positive' : 'warning'}>{snapshot.marketplaceAccounts.length ? 'Connected' : 'Needs setup'}</Badge></article><article><span><RefreshCw size={18} /></span><div><strong>Marketplace sync</strong><p>{syncProgress?.startedAt ? `Historical import ${syncProgress.progressPercent}% complete` : 'Historical import not started'}</p></div><SyncStatusBadge status={syncProgress?.status ?? 'pending'} /></article><article><span><CheckCircle2 size={18} /></span><div><strong>Products &amp; COGS</strong><p>{formatCount(coverage?.productsImported ?? 0)} products · {coverage?.coveragePercent ?? 0}% cost coverage</p></div><Badge tone={coverage?.reliableProfitability ? 'positive' : 'warning'}>{coverage?.reliableProfitability ? 'Profitability complete' : `${formatCount(coverage?.cogsMissing ?? 0)} costs missing`}</Badge></article><article><span><Users size={18} /></span><div><strong>Team</strong><p>{snapshot.account.firstName} is admin · {activeInvites.length} invitations</p></div><Badge tone="positive">Access configured</Badge></article></section>{!coverage?.reliableProfitability ? <Alert tone="warning" title="Profitability remains partial">The workspace will not present missing COGS as reliable Net Profit. Remaining products surface in Needs Attention.</Alert> : null}{syncProgress && syncProgress.status !== 'synced' ? <Alert tone="info" title="Historical import continues">The tenant freshness indicator and Sync Health retain this incomplete state.</Alert> : null}<section className="onboarding-section next-actions"><header className="onboarding-section-heading"><div><h2>Next actions</h2><p>Continue into the approved tenant shell; detailed dashboard work remains out of scope for Phase 2.</p></div></header><div><Link href={`/o/${slug}/dashboard`}><span><ArrowRight size={16} /></span><strong>Go to Dashboard</strong><small>Open the tenant foundation with all-company context.</small></Link><Link href={`/o/${slug}/cogs`}><span><CheckCircle2 size={16} /></span><strong>Review missing COGS</strong><small>Phase 5 workspace placeholder.</small></Link><Link href={`/o/${slug}/operations/sync-health`}><span><RefreshCw size={16} /></span><strong>Check Sync Health</strong><small>Review delayed and partial data.</small></Link></div></section><aside className="onboarding-context-help"><button type="button" onClick={() => setNextAnswer((value) => !value)} aria-expanded={nextAnswer}><Sparkles size={16} /><span>What should I do next?</span></button>{nextAnswer ? <p>Let historical import continue, prioritise high-value products missing COGS, and invite finance or marketplace colleagues with the narrowest useful assignment.</p> : null}</aside><footer className="onboarding-step-footer"><Button onClick={() => router.push('/onboarding/users')}><ArrowLeft size={15} /> Back</Button>{completed ? <Button variant="primary" size="large" onClick={() => router.push(`/o/${slug}/dashboard`)}>Go to Dashboard <ArrowRight size={15} /></Button> : <Button variant="primary" loading={pendingAction === 'finish'} onClick={() => { void finishSetup(); }}>Finish setup</Button>}</footer></section>;
}
