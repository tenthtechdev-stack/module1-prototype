'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { PREVIEW_ASSIGNMENTS, ROLE_PRESETS, type AssignmentScope, type Capability, type RolePreset } from '@/src/domain/permissions';
import { SCENARIOS, getScenarioRuntime, type ScenarioId } from '@/src/fixtures/scenarios';
import { COGS_MANAGEMENT_STORAGE_KEY } from '@/src/services/mock/cogs-management-store';
import { ONBOARDING_STORAGE_KEY } from '@/src/services/mock/onboarding-store';

interface PrototypeContextValue {
  enabled: boolean;
  role: RolePreset;
  assignment: AssignmentScope;
  roleId: string;
  scenarioId: ScenarioId;
  scenario: (typeof SCENARIOS)[number];
  runtime: ReturnType<typeof getScenarioRuntime>;
  realmKey: string;
  organisationSlug: string;
  setOrganisationSlug: (slug: string) => void;
  setRoleId: (id: string) => void;
  setScenarioId: (id: ScenarioId) => void;
  resetScenario: () => void;
  reset: () => void;
  hasCapability: (capability: Capability) => boolean;
}

const PrototypeContext = createContext<PrototypeContextValue | null>(null);
const DEFAULT_ROLE = 'admin';
const DEFAULT_SCENARIO: ScenarioId = 'healthy';
const DEFAULT_ORGANISATION = 'stock-supplies';

function saveSelection(key: string, value: string) {
  try { sessionStorage.setItem(`stock-supplies:prototype-${key}`, value); } catch { /* In-memory controls remain usable. */ }
}

export function PrototypeProvider({ children }: { children: React.ReactNode }) {
  const enabled = process.env.NEXT_PUBLIC_PROTOTYPE_MODE === 'true';
  const pathname = usePathname();
  const [roleId, setRoleState] = useState(DEFAULT_ROLE);
  const [scenarioId, setScenarioState] = useState<ScenarioId>(DEFAULT_SCENARIO);
  const [selectedOrganisationSlug, setOrganisationState] = useState(DEFAULT_ORGANISATION);
  const [scenarioRevision, setScenarioRevision] = useState(0);
  const routeSlug = pathname.match(/^\/o\/([^/]+)/)?.[1];
  const organisationSlug = routeSlug ?? selectedOrganisationSlug;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const storedRole = sessionStorage.getItem('stock-supplies:prototype-role');
        const storedScenario = sessionStorage.getItem('stock-supplies:prototype-scenario');
        const storedOrganisation = sessionStorage.getItem('stock-supplies:prototype-organisation');
        if (storedRole && ROLE_PRESETS.some((role) => role.id === storedRole)) setRoleState(storedRole);
        if (storedScenario && SCENARIOS.some((scenario) => scenario.id === storedScenario)) setScenarioState(storedScenario as ScenarioId);
        if (storedOrganisation && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(storedOrganisation)) setOrganisationState(storedOrganisation);
      } catch { /* Browser persistence is optional for this frontend prototype. */ }
    });
    return () => { cancelled = true; };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !routeSlug) return;
    saveSelection('organisation', routeSlug);
    // Retain the last tenant when moving to public, onboarding or platform pages.
    queueMicrotask(() => setOrganisationState(routeSlug));
  }, [enabled, routeSlug]);

  const setRoleId = useCallback((id: string) => {
    if (!ROLE_PRESETS.some((role) => role.id === id)) return;
    setRoleState(id);
    if (enabled) saveSelection('role', id);
  }, [enabled]);

  const setScenarioId = useCallback((id: ScenarioId) => {
    if (!SCENARIOS.some((scenario) => scenario.id === id)) return;
    setScenarioState(id);
    if (enabled) saveSelection('scenario', id);
  }, [enabled]);

  const setOrganisationSlug = useCallback((slug: string) => {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return;
    setOrganisationState(slug);
    if (enabled) saveSelection('organisation', slug);
  }, [enabled]);

  const resetScenario = useCallback(() => {
    setScenarioId(DEFAULT_SCENARIO);
    setScenarioRevision((revision) => revision + 1);
  }, [setScenarioId]);

  const reset = useCallback(() => {
    if (!enabled) return;
    try {
      localStorage.removeItem(ONBOARDING_STORAGE_KEY);
      localStorage.removeItem(COGS_MANAGEMENT_STORAGE_KEY);
    } catch { /* Continue resetting other available state. */ }
    for (const storageName of ['localStorage', 'sessionStorage'] as const) {
      try {
        const storage = window[storageName];
        for (const key of Object.keys(storage)) {
          const savedView = /^org[-_][^:]+:.*(?:product-saved-views|transaction-saved-views|report-saved-views|saved-view):/.test(key);
          if (key.startsWith('stock-supplies:') || savedView) storage.removeItem(key);
        }
      } catch { /* Reload also resets stores when browser persistence is disabled. */ }
    }
    // A document reload clears repository singletons, query caches, drafts and provider state together.
    window.location.assign(`/o/${DEFAULT_ORGANISATION}/dashboard`);
  }, [enabled]);

  const role = ROLE_PRESETS.find((item) => item.id === roleId) ?? ROLE_PRESETS[0];
  const assignment = PREVIEW_ASSIGNMENTS[role.id];
  const scenario = SCENARIOS.find((item) => item.id === scenarioId) ?? SCENARIOS[0];
  const runtime = useMemo(() => getScenarioRuntime(scenarioId), [scenarioId]);
  const hasCapability = useCallback((capability: Capability) => role.capabilities.includes(capability), [role]);

  const value = useMemo<PrototypeContextValue>(() => ({
    enabled, role, assignment, roleId, scenarioId, scenario, runtime,
    realmKey: `${roleId}:${scenarioId}:${scenarioRevision}`,
    organisationSlug, setOrganisationSlug, setRoleId, setScenarioId, resetScenario, reset, hasCapability,
  }), [assignment, enabled, hasCapability, organisationSlug, reset, resetScenario, role, roleId, runtime, scenario, scenarioId, scenarioRevision, setOrganisationSlug, setRoleId, setScenarioId]);

  return <PrototypeContext.Provider value={value}>{children}</PrototypeContext.Provider>;
}

export function usePrototype() {
  const value = useContext(PrototypeContext);
  if (!value) throw new Error('usePrototype must be used inside PrototypeProvider.');
  return value;
}
