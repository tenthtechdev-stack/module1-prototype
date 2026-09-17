'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CircleHelp, RotateCcw, TestTube2 } from 'lucide-react';
import { useOnboarding } from '@/src/components/providers/onboarding-provider';
import { usePrototype } from '@/src/components/providers/prototype-provider';
import { Button } from '@/src/components/ui/actions';
import { Popover } from '@/src/components/ui/overlays';
import { ONBOARDING_STEPS, type InitialSyncProgress, type OnboardingSnapshot, type OnboardingStep } from '@/src/domain/onboarding';
import { SCENARIOS, type ScenarioId } from '@/src/fixtures/scenarios';

interface OnboardingStageDefinition {
  id: string;
  label: string;
  detail: string;
  steps: readonly OnboardingStep[];
  href: string;
  optional?: boolean;
  revisitable?: boolean;
}

export const ONBOARDING_INTERNAL_STEPS: readonly OnboardingStep[] = ONBOARDING_STEPS;

export const ONBOARDING_STAGES: readonly OnboardingStageDefinition[] = [
  { id: 'account', label: 'Account', detail: 'Owner account', steps: ['account'], href: '/auth/register', revisitable: false },
  { id: 'subscription', label: 'Subscription', detail: 'Plan and test payment', steps: ['subscription', 'payment'], href: '/onboarding/subscription' },
  { id: 'organisation', label: 'Organisation', detail: 'Tenant details', steps: ['organisation'], href: '/onboarding/organisation' },
  { id: 'companies', label: 'Companies', detail: 'Legal and trading entities', steps: ['companies'], href: '/onboarding/companies' },
  { id: 'marketplaces', label: 'Marketplaces', detail: 'Amazon, eBay and Temu', steps: ['marketplaces'], href: '/onboarding/marketplaces' },
  { id: 'sync', label: 'Initial sync', detail: 'Marketplace import', steps: ['sync'], href: '/onboarding/sync' },
  { id: 'cogs', label: 'COGS readiness', detail: 'Profitability coverage', steps: ['cogs'], href: '/onboarding/cogs' },
  { id: 'users', label: 'Invite users', detail: 'Team access', steps: ['users'], href: '/onboarding/users', optional: true },
  { id: 'complete', label: 'Complete', detail: 'Operational readiness', steps: ['complete'], href: '/onboarding/complete' },
];

const STEP_HREFS = {
  account: '/auth/register',
  subscription: '/onboarding/subscription',
  payment: '/onboarding/payment',
  organisation: '/onboarding/organisation',
  companies: '/onboarding/companies',
  marketplaces: '/onboarding/marketplaces',
  sync: '/onboarding/sync',
  cogs: '/onboarding/cogs',
  users: '/onboarding/users',
  complete: '/onboarding/complete',
} as const satisfies Record<OnboardingStep, string>;

const STEP_LABELS = {
  account: 'Account',
  subscription: 'Plan selection',
  payment: 'Test payment',
  organisation: 'Organisation',
  companies: 'Companies',
  marketplaces: 'Marketplaces',
  sync: 'Initial sync',
  cogs: 'COGS readiness',
  users: 'Invite users',
  complete: 'Complete',
} as const satisfies Record<OnboardingStep, string>;

interface StageState {
  current: boolean;
  completed: boolean;
  skipped: boolean;
  healthIssue: boolean;
  statusLabel: string;
  href: string;
}

function syncHealthFailureLabel(progress: InitialSyncProgress | null) {
  if (!progress) return null;
  const statuses = progress.accounts.flatMap((account) => [account.status, ...account.datasets.map((dataset) => dataset.status)]);
  if (statuses.includes('authentication_required')) return 'Reconnect required';
  if (statuses.includes('failed')) return 'Sync failed';
  return null;
}

function stageState(stage: OnboardingStageDefinition, snapshot: OnboardingSnapshot | null, healthFailure: string | null = null): StageState {
  if (!snapshot) {
    return {
      current: false,
      completed: false,
      skipped: false,
      healthIssue: false,
      statusLabel: stage.optional ? 'Optional' : 'Not started',
      href: stage.href,
    };
  }

  const completedSteps = new Set(snapshot.session.completedSteps);
  const skippedSteps = new Set(snapshot.session.skippedSteps);
  const current = snapshot.session.status !== 'complete' && stage.steps.includes(snapshot.session.currentStep);
  const skipped = stage.steps.every((step) => skippedSteps.has(step));
  const completed = snapshot.session.status === 'complete'
    || stage.steps.every((step) => completedSteps.has(step) || skippedSteps.has(step));
  const healthIssue = completed && Boolean(healthFailure);
  const statusLabel = current
    ? stage.optional ? 'Current · Optional' : 'Current'
    : skipped
      ? 'Skipped'
      : healthIssue
        ? `Setup done · ${healthFailure}`
        : completed
        ? 'Completed'
        : stage.optional
          ? 'Optional'
          : 'Not started';

  return {
    current,
    completed,
    skipped,
    healthIssue,
    statusLabel,
    href: current ? STEP_HREFS[snapshot.session.currentStep] : stage.href,
  };
}

function SetupHelp() {
  return (
    <Popover label="Setup help" contentLabel="Onboarding setup help">
      <div className="onboarding-help-content">
        <strong>Setup help</strong>
        <p><b>Organisation</b> is your top-level tenant. It can contain several legal or trading companies.</p>
        <p><b>Marketplace accounts</b> belong to a company, so ownership remains clear across Amazon, eBay and Temu.</p>
        <p><b>COGS</b> is usually not supplied by marketplaces. Profitability remains incomplete until product costs are added.</p>
        <p className="onboarding-help-contact"><CircleHelp size={14} aria-hidden="true" /> Contact support is a prototype placeholder.</p>
      </div>
    </Popover>
  );
}

export function OnboardingShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { snapshot: providerSnapshot, syncProgress, loading, error, resume, reset: resetOnboarding } = useOnboarding();
  const snapshot: OnboardingSnapshot | null = providerSnapshot;
  const { enabled, scenarioId, setScenarioId, reset: resetPrototype } = usePrototype();
  const resumeRequested = useRef(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  useEffect(() => {
    if (resumeRequested.current) return;
    resumeRequested.current = true;
    void resume();
  }, [resume]);

  const unresolvedSyncFailure = syncHealthFailureLabel(syncProgress);
  const stages = ONBOARDING_STAGES.map((stage) => ({
    stage,
    state: stageState(stage, snapshot, stage.id === 'sync' ? unresolvedSyncFailure : null),
  }));
  const currentIndex = snapshot
    ? ONBOARDING_STAGES.findIndex((stage) => stage.steps.includes(snapshot.session.currentStep))
    : -1;
  const currentStage = currentIndex >= 0 ? ONBOARDING_STAGES[currentIndex] : null;
  const completedStageCount = stages.filter(({ state }) => state.completed).length;
  const completedSyncFailure = stages.find(({ stage }) => stage.id === 'sync')?.state.healthIssue
    ? unresolvedSyncFailure
    : null;
  const progressLabel = currentStage && snapshot
    ? snapshot.session.currentStep === 'complete'
      ? `Stage ${currentIndex + 1} of ${ONBOARDING_STAGES.length}: ${currentStage.label}`
      : `Stage ${currentIndex + 1} of ${ONBOARDING_STAGES.length}: ${currentStage.label} — ${STEP_LABELS[snapshot.session.currentStep]}`
    : loading
      ? 'Loading saved setup progress'
      : 'Setup progress is not available';
  const savedStatus = loading
    ? 'Loading saved progress…'
    : error
      ? 'Saved progress unavailable'
      : snapshot
        ? 'Progress saved'
        : 'No saved setup';

  async function handleReset() {
    setResetting(true);
    setResetError(null);
    try {
      await resetOnboarding();
      resetPrototype();
      router.replace('/auth/register');
    } catch (resetFailure) {
      setResetError(resetFailure instanceof Error ? resetFailure.message : 'Onboarding could not be reset.');
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="onboarding-shell onboarding-page">
      <a className="skip-link" href="#onboarding-main">Skip to setup content</a>
      <header className="onboarding-shell-header">
        <div className="auth-brand onboarding-brand"><span className="brand-mark" aria-hidden="true">SS</span><strong>Stock Supplies</strong></div>
        <div className="onboarding-header-actions">
          <span className={`onboarding-save-status${error ? ' error' : ''}`} role={error ? 'alert' : 'status'} aria-live="polite">{savedStatus}</span>
          <SetupHelp />
          <span className="onboarding-user" aria-label="Signed in as organisation owner">Owner</span>
        </div>
      </header>

      <div className="onboarding-shell-layout">
        <nav className="onboarding-progress-rail" aria-label="Setup progress" aria-busy={loading}>
          <p className="eyebrow">Setup progress</p>
          <ol>
            {stages.map(({ stage, state }) => {
              const content = <><span className="onboarding-stage-marker" aria-hidden="true">{state.healthIssue ? '!' : state.completed ? '✓' : ONBOARDING_STAGES.indexOf(stage) + 1}</span><span className="onboarding-stage-copy"><strong>{stage.label}</strong><small>{stage.detail}</small></span><span className="onboarding-stage-status">{state.statusLabel}</span></>;
              const canVisit = stage.revisitable !== false && (state.completed || state.current);
              const accessibleLabel = `${stage.label}: ${state.statusLabel}. ${stage.detail}`;
              return (
                <li className={`onboarding-stage${state.current ? ' current' : ''}${state.completed ? ' complete' : ''}${state.healthIssue ? ' health-issue' : ''}${stage.optional ? ' optional' : ''}${state.skipped ? ' skipped' : ''}`} key={stage.id}>
                  {canVisit ? <Link href={state.href} aria-label={accessibleLabel} aria-current={state.current ? 'step' : undefined}>{content}</Link> : <span aria-label={accessibleLabel} aria-current={state.current ? 'step' : undefined}>{content}</span>}
                </li>
              );
            })}
          </ol>
        </nav>

        <section className="onboarding-mobile-progress" aria-label="Current setup progress" aria-busy={loading}>
          <span>{progressLabel}</span>
          {completedSyncFailure ? <span className="onboarding-mobile-health" role="status">Initial sync setup done · {completedSyncFailure}</span> : null}
          <progress value={completedStageCount} max={ONBOARDING_STAGES.length} aria-label={`${completedStageCount} of ${ONBOARDING_STAGES.length} setup stages completed${completedSyncFailure ? `; initial sync setup is done but ${completedSyncFailure.toLowerCase()}` : ''}`} />
        </section>

        <main id="onboarding-main" className="onboarding-shell-main" tabIndex={-1}>
          {error ? <div className="onboarding-resume-error" role="alert"><strong>Saved setup progress could not be loaded</strong><p>{error}</p><Button size="compact" onClick={() => { void resume(); }}>Try again</Button></div> : null}
          {children}
        </main>
      </div>

      {enabled ? (
        <aside className="onboarding-development-tools" aria-label="Onboarding prototype tools">
          <span className="onboarding-development-label"><TestTube2 size={14} aria-hidden="true" /> Prototype</span>
          <label><span>Scenario</span><select value={scenarioId} onChange={(event) => setScenarioId(event.target.value as ScenarioId)}>{SCENARIOS.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.label}</option>)}</select></label>
          <Button size="compact" loading={resetting} onClick={() => { void handleReset(); }}><RotateCcw size={14} aria-hidden="true" /> Reset onboarding</Button>
          {resetError ? <span className="onboarding-reset-error" role="alert">{resetError}</span> : null}
        </aside>
      ) : null}
    </div>
  );
}
