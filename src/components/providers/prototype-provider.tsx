'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { ROLE_PRESETS, type Capability, type RolePreset } from '@/src/domain/permissions';
import { SCENARIOS, getScenarioRuntime, type ScenarioId } from '@/src/fixtures/scenarios';

interface PrototypeContextValue {
  enabled: boolean;
  role: RolePreset;
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
const DEFAULT_ROLE = 'owner';
const DEFAULT_SCENARIO: ScenarioId = 'healthy';

export function PrototypeProvider({ children }: { children: React.ReactNode }) {
  const enabled = process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_PROTOTYPE_TOOLS === 'true';
  const [roleId, setRoleState] = useState(DEFAULT_ROLE);
  const [scenarioId, setScenarioState] = useState<ScenarioId>(DEFAULT_SCENARIO);

  const setRoleId = useCallback((id: string) => {
    if (!ROLE_PRESETS.some((role) => role.id === id)) return;
    setRoleState(id);
    if (enabled) sessionStorage.setItem('stock-supplies:prototype-role', id);
  }, [enabled]);

  const setScenarioId = useCallback((id: ScenarioId) => {
    setScenarioState(id);
    if (id === 'marketplace-restricted') setRoleState('marketplace');
    if (id === 'auditor-read-only') setRoleState('auditor');
    if (enabled) {
      sessionStorage.setItem('stock-supplies:prototype-scenario', id);
      if (id === 'marketplace-restricted') sessionStorage.setItem('stock-supplies:prototype-role', 'marketplace');
      if (id === 'auditor-read-only') sessionStorage.setItem('stock-supplies:prototype-role', 'auditor');
    }
  }, [enabled]);

  const reset = useCallback(() => {
    setRoleState(DEFAULT_ROLE);
    setScenarioState(DEFAULT_SCENARIO);
    if (enabled) {
      sessionStorage.removeItem('stock-supplies:prototype-role');
      sessionStorage.removeItem('stock-supplies:prototype-scenario');
      localStorage.removeItem('stock-supplies:mock:v1');
    }
  }, [enabled]);

  const role = ROLE_PRESETS.find((item) => item.id === roleId) ?? ROLE_PRESETS[0];
  const scenario = SCENARIOS.find((item) => item.id === scenarioId) ?? SCENARIOS[0];
  const runtime = useMemo(() => getScenarioRuntime(scenarioId), [scenarioId]);
  const hasCapability = useCallback((capability: Capability) => role.capabilities.includes(capability), [role]);

  const value = useMemo<PrototypeContextValue>(() => ({
    enabled,
    role,
    roleId,
    scenarioId,
    scenario,
    runtime,
    realmKey: `${roleId}:${scenarioId}`,
    setRoleId,
    setScenarioId,
    reset,
    hasCapability,
  }), [enabled, hasCapability, reset, role, roleId, runtime, scenario, scenarioId, setRoleId, setScenarioId]);

  return <PrototypeContext.Provider value={value}>{children}</PrototypeContext.Provider>;
}

export function usePrototype() {
  const value = useContext(PrototypeContext);
  if (!value) throw new Error('usePrototype must be used inside PrototypeProvider.');
  return value;
}
