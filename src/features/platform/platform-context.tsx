'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePrototype } from '@/src/components/providers/prototype-provider';
import { useToast } from '@/src/components/ui/feedback';
import type { ModuleEntitlementKey } from '@/src/domain/models';
import { initialOrganisations, initialJobs, initialAudit, initialUsage, type PlatformOrganisation, type PlatformJob, type PlatformAuditEvent } from '@/src/services/mock/platform-data';

const STORAGE_KEY = 'stock-supplies:platform-phase9:v1';
interface PlatformState {
  organisations: PlatformOrganisation[];
  jobs: PlatformJob[];
  audit: PlatformAuditEvent[];
  supportOrganisationId: string | null;
}
const initialState: PlatformState = { organisations: initialOrganisations, jobs: initialJobs, audit: initialAudit, supportOrganisationId: null };
interface PlatformContextValue extends PlatformState {
  usage: typeof initialUsage;
  setOrganisationStatus: (id: string, status: PlatformOrganisation['status']) => void;
  setSubscriptionStatus: (id: string, status: PlatformOrganisation['subscription']['status']) => void;
  setModule: (id: string, key: ModuleEntitlementKey, enabled: boolean) => void;
  retryJob: (id: string) => void;
  openWorkspace: (id: string) => void;
  returnToPlatform: () => void;
}
const PlatformContext = createContext<PlatformContextValue | null>(null);

function event(organisationId: string, action: string, area: string, details: string): PlatformAuditEvent {
  return { id: crypto.randomUUID(), at: new Date().toISOString(), actor: 'Zara Rahman', organisationId, action, area, details };
}

/** Deliberately local prototype state. Does not provision tenants or change customer RBAC. */
export function PlatformProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PlatformState>(initialState);
  const [ready, setReady] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const { roleId, setRoleId, setScenarioId } = usePrototype();
  const { showToast } = useToast();
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    const scheduledTimers = timers.current;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (raw) {
          const saved = JSON.parse(raw) as PlatformState;
          if (Array.isArray(saved.organisations) && Array.isArray(saved.jobs) && Array.isArray(saved.audit)) setState(saved);
        }
      } catch { /* Storage is optional for this frontend demo. */ }
      setReady(true);
    });
    return () => { cancelled = true; scheduledTimers.forEach(clearTimeout); };
  }, []);
  useEffect(() => {
    if (ready) { try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* Remains usable in memory. */ } }
  }, [ready, state]);

  function setOrganisationStatus(id: string, status: PlatformOrganisation['status']) {
    if (roleId !== 'platform-admin') return;
    const action = status === 'Suspended' ? 'Organisation suspended' : 'Organisation reactivated';
    const entry = event(id, action, 'Organisations', `Organisation status changed to ${status}. Subscription and entitlements retained.`);
    setState(current => ({ ...current, organisations: current.organisations.map(org => org.id === id ? { ...org, status, lastActivity: entry.at } : org), audit: [entry, ...current.audit] }));
    showToast(`${action} · prototype change`);
  }
  function setSubscriptionStatus(id: string, status: PlatformOrganisation['subscription']['status']) {
    if (roleId !== 'platform-admin') return;
    const entry = event(id, status === 'active' ? 'Subscription activated' : 'Subscription status changed', 'Subscriptions', `Test Plan set to ${status}. Module entitlements and customer permissions unchanged.`);
    setState(current => ({ ...current, organisations: current.organisations.map(org => org.id === id ? { ...org, subscription: { ...org.subscription, status }, lastActivity: entry.at } : org), audit: [entry, ...current.audit] }));
    showToast(`Test Plan ${status} · prototype change`);
  }
  function setModule(id: string, key: ModuleEntitlementKey, enabled: boolean) {
    if (roleId !== 'platform-admin') return;
    const entry = event(id, enabled ? 'Module enabled' : 'Entitlement changed', 'Modules', `${key}: ${enabled ? 'enabled' : 'disabled'}. Subscription and customer roles unchanged.`);
    setState(current => ({ ...current, organisations: current.organisations.map(org => org.id === id ? { ...org, modules: enabled ? [...new Set([...org.modules, key])] : org.modules.filter(module => module !== key), lastActivity: entry.at } : org), audit: [entry, ...current.audit] }));
    showToast(`Module entitlement ${enabled ? 'enabled' : 'disabled'} · prototype change`);
  }
  function retryJob(id: string) {
    if (roleId !== 'platform-admin') return;
    const job = state.jobs.find(item => item.id === id);
    if (!job || !['Failed', 'Delayed'].includes(job.status)) return;
    const owner = state.organisations.find(org => org.id === job.organisationId);
    if (!owner || owner.status === 'Suspended' || owner.status === 'Setup Incomplete' || !['active', 'trialing'].includes(owner.subscription.status) || !owner.modules.includes('marketplace-profitability')) {
      showToast('Resolve organisation setup, subscription and Module 01 access before retrying.', 'warning');
      return;
    }
    const at = new Date().toISOString();
    const entry = event(job.organisationId, 'Sync retry triggered', 'Sync Health', `Manual prototype retry for ${job.accountName}.`);
    setState(current => ({ ...current, jobs: current.jobs.map(item => item.id === id ? { ...item, status: 'Syncing', lastAttempt: at, issue: 'Prototype retry in progress.', attempts: [{ at, status: 'Syncing', detail: 'Manual retry requested by Zara Rahman.' }, ...item.attempts] } : item), audit: [entry, ...current.audit] }));
    showToast('Retry started · simulated sync');
    timers.current.push(setTimeout(() => {
      const completedAt = new Date().toISOString();
      setState(current => ({ ...current, jobs: current.jobs.map(item => item.id === id ? { ...item, status: 'Healthy', lastSuccess: completedAt, issue: '', attempts: [{ at: completedAt, status: 'Healthy', detail: 'Prototype retry completed successfully.' }, ...item.attempts] } : item) }));
      showToast('Prototype sync completed');
    }, 1400));
  }
  function openWorkspace(id: string) {
    if (roleId !== 'platform-admin') return;
    const org = state.organisations.find(item => item.id === id);
    if (!org) return;
    const entry = event(id, 'Platform Admin opened Organisation', 'Workspace access', 'Opened the existing tenant demo in clearly labelled Platform Admin support context.');
    setState(current => ({ ...current, supportOrganisationId: id, audit: [entry, ...current.audit] }));
    setScenarioId('healthy');
    setRoleId('admin');
    router.push(`/o/${org.slug}/dashboard`);
  }
  function returnToPlatform() {
    const id = state.supportOrganisationId;
    setState(current => ({ ...current, supportOrganisationId: null }));
    setRoleId('platform-admin');
    router.push(id ? `/platform/organisations/${id}` : '/platform/dashboard');
  }
  return <PlatformContext.Provider value={{ ...state, usage: initialUsage, setOrganisationStatus, setSubscriptionStatus, setModule, retryJob, openWorkspace, returnToPlatform }}>{children}</PlatformContext.Provider>;
}
export function usePlatform() {
  const value = useContext(PlatformContext);
  if (!value) throw new Error('usePlatform requires PlatformProvider.');
  return value;
}
