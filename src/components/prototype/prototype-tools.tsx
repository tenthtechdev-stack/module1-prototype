'use client';

import { startTransition, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { RotateCcw, SlidersHorizontal, TestTube2, X } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { ROLE_PRESETS } from '@/src/domain/permissions';
import { SCENARIOS, type ScenarioId } from '@/src/fixtures/scenarios';
import { usePrototype } from '@/src/components/providers/prototype-provider';
import { useOnboarding } from '@/src/components/providers/onboarding-provider';
import { usePlatform } from '@/src/features/platform/platform-context';
import { equivalentWorkspacePath, journeyHref, PROTOTYPE_JOURNEYS } from './prototype-journeys';
import './prototype-tools.css';

export function PrototypeTools() {
  const { enabled, roleId, scenarioId, organisationSlug, setRoleId, setScenarioId, setOrganisationSlug, resetScenario, reset } = usePrototype();
  const { previewStep } = useOnboarding();
  const { organisations, supportOrganisationId, openWorkspace, clearSupportContext } = usePlatform();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  if (!enabled) return null;

  const currentOrganisation = organisations.find((org) => pathname.startsWith(`/o/${org.slug}/`))
    ?? organisations.find((org) => org.slug === organisationSlug)
    ?? organisations[0];
  const currentSlug = currentOrganisation.slug;
  const journeys = PROTOTYPE_JOURNEYS.flatMap((group) => group.items);
  const currentJourney = journeys.find((journey) => journeyHref(journey, currentSlug) === pathname);
  const scenario = SCENARIOS.find((item) => item.id === scenarioId);

  async function changeJourney(href: string) {
    const journey = journeys.find((item) => journeyHref(item, currentSlug) === href);
    if (!journey || navigating) return;
    setError(null);
    setNotice('');
    setNavigating(true);
    try {
      if (journey.onboardingStep) await previewStep(journey.onboardingStep);
      setOpen(false);
      // Commit access and route together so the departing page cannot rewrite its URL.
      startTransition(() => {
        if (journey.surface === 'platform') {
          clearSupportContext();
          setRoleId('platform-admin');
        }
        if (journey.surface === 'tenant' && roleId === 'platform-admin') {
          openWorkspace(currentOrganisation.id, journey.href);
        } else {
          router.push(href);
        }
      });
    } catch (navigationError) {
      setError(navigationError instanceof Error ? navigationError.message : 'This prototype page could not be prepared. Please try again.');
    } finally {
      setNavigating(false);
    }
  }

  function changeRole(nextRoleId: string) {
    const nextRole = ROLE_PRESETS.find((role) => role.id === nextRoleId);
    if (!nextRole) return;
    setOpen(false);
    startTransition(() => {
      clearSupportContext();
      setRoleId(nextRoleId);
      if (nextRole.surface === 'platform') router.push('/platform/dashboard');
      else if (pathname.startsWith('/platform')) router.push(`/o/${currentSlug}/dashboard`);
    });
  }

  function changeOrganisation(slug: string) {
    const organisation = organisations.find((org) => org.slug === slug);
    if (!organisation) return;
    setOrganisationSlug(slug);
    setOpen(false);
    if (pathname.startsWith('/platform/organisations/')) {
      router.push(`/platform/organisations/${organisation.id}`);
    } else if (roleId === 'platform-admin' || supportOrganisationId) {
      openWorkspace(organisation.id, equivalentWorkspacePath(pathname));
    } else {
      router.push(`/o/${slug}${equivalentWorkspacePath(pathname)}`);
    }
  }

  function journeyControl() {
    return <label className="prototype-control prototype-journey-control"><span>Journey / Page</span><select aria-label="Prototype journey or page" value={currentJourney ? journeyHref(currentJourney, currentSlug) : ''} disabled={navigating} onChange={(event) => { void changeJourney(event.target.value); }}><option value="" disabled>{navigating ? 'Preparing page…' : 'Jump to a page…'}</option>{PROTOTYPE_JOURNEYS.map((group) => <optgroup key={group.label} label={group.label}>{group.items.map((journey) => <option key={journey.href} value={journeyHref(journey, currentSlug)}>{journey.label}</option>)}</optgroup>)}</select></label>;
  }

  function roleControl() {
    return <label className="prototype-control prototype-role-control"><span>Role</span><select aria-label="Prototype role" value={roleId} disabled={navigating} title={ROLE_PRESETS.find((role) => role.id === roleId)?.description} onChange={(event) => changeRole(event.target.value)}>{ROLE_PRESETS.map((role) => <option key={role.id} value={role.id}>{role.label}</option>)}</select></label>;
  }

  function scenarioControl() {
    return <label className="prototype-control prototype-scenario-control"><span>Scenario</span><select aria-label="Prototype scenario" value={scenarioId} disabled={navigating} title={scenario?.description} onChange={(event) => { setScenarioId(event.target.value as ScenarioId); setNotice(''); }}>{SCENARIOS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>;
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <aside className="prototype-tools" aria-label="Prototype controller">
        <span className="prototype-label"><TestTube2 size={15} /> PROTOTYPE</span>
        <div className="prototype-desktop-controls" aria-busy={navigating}>{journeyControl()}{roleControl()}{scenarioControl()}</div>
        <Dialog.Trigger asChild><button type="button" className="prototype-tools-trigger" aria-label="Open prototype controller"><SlidersHorizontal size={15} /><span className="prototype-trigger-desktop">More</span><span className="prototype-trigger-mobile">PROTOTYPE</span></button></Dialog.Trigger>
        {navigating || (error && !open) ? <div className="prototype-toolbar-status" role={error ? 'alert' : 'status'}>{error ?? 'Preparing onboarding preview…'}</div> : null}
      </aside>
      <Dialog.Portal>
        <Dialog.Overlay className="prototype-drawer-overlay" />
        <Dialog.Content className="prototype-drawer">
          <header className="prototype-drawer-heading"><div><span className="prototype-drawer-eyebrow"><TestTube2 size={15} /> PROTOTYPE</span><Dialog.Title>Review controller</Dialog.Title><Dialog.Description>Explore journeys, roles and demo states.</Dialog.Description></div><Dialog.Close asChild><button type="button" className="prototype-close" aria-label="Close prototype controller"><X size={19} /></button></Dialog.Close></header>
          <div className="prototype-drawer-content" aria-busy={navigating}>
            {journeyControl()}
            <p className="prototype-control-hint">Jump directly to any onboarding stage. Platform pages select Platform Super Admin.</p>
            <div className="prototype-controls-divider" />
            {roleControl()}
            {scenarioControl()}
            <p className="prototype-control-hint" aria-live="polite">{scenario?.description}</p>
            <label className="prototype-control"><span>Organisation</span><select aria-label="Prototype organisation" value={currentSlug} disabled={navigating} onChange={(event) => changeOrganisation(event.target.value)}>{organisations.map((organisation) => <option key={organisation.id} value={organisation.slug}>{organisation.name}</option>)}</select></label>
            <p className="prototype-control-hint">Open the equivalent workspace page. Detail pages return to their list.</p>
            {navigating ? <p className="prototype-notice" role="status">Preparing onboarding preview…</p> : null}
            {error ? <p className="prototype-error" role="alert">{error}</p> : null}
            {notice ? <p className="prototype-notice" role="status">{notice}</p> : null}
          </div>
          <footer className="prototype-drawer-footer"><div className="prototype-reset-actions"><button type="button" disabled={navigating} onClick={() => { resetScenario(); setNotice('Scenario reset to Healthy Business.'); }}><RotateCcw size={15} />Reset scenario</button><button type="button" disabled={navigating} onClick={reset}><RotateCcw size={15} />Reset prototype</button></div><p>Reset prototype clears temporary mock changes and returns to the canonical demo.</p></footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}