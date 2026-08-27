'use client';

import { RotateCcw, TestTube2 } from 'lucide-react';
import { ROLE_PRESETS } from '@/src/domain/permissions';
import { SCENARIOS, type ScenarioId } from '@/src/fixtures/scenarios';
import { usePrototype } from '@/src/components/providers/prototype-provider';

export function PrototypeTools() {
  const { enabled, roleId, scenarioId, setRoleId, setScenarioId, reset } = usePrototype();
  if (!enabled) return null;

  return (
    <aside className="prototype-tools" aria-label="Prototype tools">
      <span className="prototype-label"><TestTube2 size={14} /> Prototype</span>
      <label><span>Role</span><select value={roleId} onChange={(event) => setRoleId(event.target.value)}>{ROLE_PRESETS.map((role) => <option key={role.id} value={role.id}>{role.label}</option>)}</select></label>
      <label><span>Scenario</span><select value={scenarioId} onChange={(event) => setScenarioId(event.target.value as ScenarioId)}>{SCENARIOS.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.label}</option>)}</select></label>
      <button onClick={reset} aria-label="Reset prototype data"><RotateCcw size={14} /> Reset</button>
    </aside>
  );
}
