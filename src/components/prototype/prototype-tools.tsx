'use client';

import { RotateCcw, TestTube2 } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { ROLE_PRESETS } from '@/src/domain/permissions';
import { SCENARIOS, type ScenarioId } from '@/src/fixtures/scenarios';
import { usePrototype } from '@/src/components/providers/prototype-provider';

export function PrototypeTools() {
  const { enabled, roleId, scenarioId, setRoleId, setScenarioId, reset } = usePrototype();
  const pathname = usePathname();
  const router = useRouter();
  if (!enabled) return null;

  function changeRole(nextRoleId: string) {
    const nextRole = ROLE_PRESETS.find((role) => role.id === nextRoleId);
    if (!nextRole) return;
    setRoleId(nextRoleId);
    if (nextRole.surface === 'platform' && !pathname.startsWith('/platform')) router.push('/platform/dashboard');
    if (nextRole.surface === 'tenant' && pathname.startsWith('/platform')) router.push('/o/stock-supplies/dashboard');
  }

  function resetPrototype() {
    reset();
    if (pathname.startsWith('/platform')) router.push('/o/stock-supplies/dashboard');
  }

  return (
    <aside className="prototype-tools" aria-label="Prototype tools">
      <span className="prototype-label"><TestTube2 size={14} /> Prototype</span>
      <label><span>Role</span><select value={roleId} onChange={(event) => changeRole(event.target.value)}>{ROLE_PRESETS.map((role) => <option key={role.id} value={role.id}>{role.label}</option>)}</select></label>
      <label><span>Scenario</span><select value={scenarioId} title={SCENARIOS.find((scenario) => scenario.id === scenarioId)?.description} onChange={(event) => setScenarioId(event.target.value as ScenarioId)}>{SCENARIOS.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.label}</option>)}</select></label>
      <button onClick={resetPrototype} aria-label="Reset prototype data"><RotateCcw size={14} /> Reset</button>
    </aside>
  );
}
