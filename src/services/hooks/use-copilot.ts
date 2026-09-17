'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import type { CopilotContext } from '@/src/domain/models';
import type { ScenarioId } from '@/src/fixtures/scenarios';
import { queryKeys } from '@/src/services/query-keys';
import { services } from '@/src/services/runtime';

export function useCopilot(context: CopilotContext, scenarioId: ScenarioId, enabled = true) {
  const contextKey = JSON.stringify({ context, scenarioId });
  const overview = useQuery({
    queryKey: queryKeys.copilot(context, scenarioId),
    queryFn: ({ signal }) => services.copilot.overview(context, scenarioId, signal),
    enabled,
  });
  const ask = useMutation({
    mutationFn: async (question: string) => ({ answer: await services.copilot.ask(question, context), contextKey }),
  });
  // An answer from a previous role, tenant or transaction must disappear immediately.
  return { overview, ask: { ...ask, data: enabled && ask.data?.contextKey === contextKey ? ask.data.answer : undefined } };
}
