'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { PREVIEW_ASSIGNMENTS, ROLE_PRESETS, type AssignmentScope, type Capability, type RolePreset } from '@/src/domain/permissions';
import { SCENARIOS, getScenarioRuntime, type ScenarioId } from '@/src/fixtures/scenarios';
import { COGS_MANAGEMENT_STORAGE_KEY } from '@/src/services/mock/cogs-management-store';
import { ONBOARDING_STORAGE_KEY } from '@/src/services/mock/onboarding-store';
import { mockExpensesStore } from '@/src/services/mock/expenses-store';
import { PRODUCT_GROUPS_STORAGE_KEY } from '@/src/services/mock/product-groups-store';

interface PrototypeContextValue {
  enabled: boolean;
  role: RolePreset;
  assignment: AssignmentScope;
  roleId: string;
  scenarioId: ScenarioId;
  scenario: (typeof SCENARIOS)[number];
  runtime: ReturnType<typeof getScenarioRuntime>;
  realmKey: string;
  setRoleId: (id: string) => void;
  setScenarioId: (id: ScenarioId) => void;
  reset: () => void;
  hasCapability: (capability: Capability) => boolean;
}

const PrototypeContext = createContext<PrototypeContextValue | null>(null);
const DEFAULT_ROLE = 'admin';
const DEFAULT_SCENARIO: ScenarioId = 'healthy';

export function PrototypeProvider({ children }: { children: React.ReactNode }) {
  const enabled = process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_PROTOTYPE_TOOLS === 'true';
  const [roleId, setRoleState] = useState(DEFAULT_ROLE);
  const [scenarioId, setScenarioState] = useState<ScenarioId>(DEFAULT_SCENARIO);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const storedRole = sessionStorage.getItem('stock-supplies:prototype-role');
      const storedScenario = sessionStorage.getItem('stock-supplies:prototype-scenario');
      if (storedRole && ROLE_PRESETS.some((role) => role.id === storedRole)) setRoleState(storedRole);
      if (storedScenario && SCENARIOS.some((scenario) => scenario.id === storedScenario)) setScenarioState(storedScenario as ScenarioId);
    });
    return () => { cancelled = true; };
  }, [enabled]);

  const setRoleId = useCallback((id: string) => {
    if (!ROLE_PRESETS.some((role) => role.id === id)) return;
    setRoleState(id);
    if (enabled) sessionStorage.setItem('stock-supplies:prototype-role', id);
  }, [enabled]);

  const setScenarioId = useCallback((id: ScenarioId) => {
    setScenarioState(id);
    if (enabled) sessionStorage.setItem('stock-supplies:prototype-scenario', id);
  }, [enabled]);

  const reset = useCallback(() => {
    setRoleState(DEFAULT_ROLE);
    setScenarioState(DEFAULT_SCENARIO);
    if (enabled) {
      sessionStorage.removeItem('stock-supplies:prototype-role');
      sessionStorage.removeItem('stock-supplies:prototype-scenario');
      localStorage.removeItem(ONBOARDING_STORAGE_KEY);
      localStorage.removeItem('stock-supplies:mock:v1'); // Retired Phase 1 persistence.
      localStorage.removeItem(COGS_MANAGEMENT_STORAGE_KEY);
      localStorage.removeItem(PRODUCT_GROUPS_STORAGE_KEY);
      mockExpensesStore.reset();
    }
  }, [enabled]);

  const role = ROLE_PRESETS.find((item) => item.id === roleId) ?? ROLE_PRESETS[0];
  const assignment = PREVIEW_ASSIGNMENTS[role.id];
  const scenario = SCENARIOS.find((item) => item.id === scenarioId) ?? SCENARIOS[0];
  const runtime = useMemo(() => getScenarioRuntime(scenarioId), [scenarioId]);
  const hasCapability = useCallback((capability: Capability) => role.capabilities.includes(capability), [role]);

  const value = useMemo<PrototypeContextValue>(() => ({
    enabled,
    role,
    assignment,
    roleId,
    scenarioId,
    scenario,
    runtime,
    realmKey: `${roleId}:${scenarioId}`,
    setRoleId,
    setScenarioId,
    reset,
    hasCapability,
  }), [assignment, enabled, hasCapability, reset, role, roleId, runtime, scenario, scenarioId, setRoleId, setScenarioId]);

  return <PrototypeContext.Provider value={value}>{children}</PrototypeContext.Provider>;
}

export function usePrototype() {
  const value = useContext(PrototypeContext);
  if (!value) throw new Error('usePrototype must be used inside PrototypeProvider.');
  return value;
}
