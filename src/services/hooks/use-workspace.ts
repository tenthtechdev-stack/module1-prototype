'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/src/services/query-keys';
import { services } from '@/src/services/runtime';
import { usePrototype } from '@/src/components/providers/prototype-provider';

export function useWorkspace(orgSlug: string) {
  const { scenarioId } = usePrototype();
  return useQuery({
    queryKey: queryKeys.workspace(orgSlug, scenarioId),
    queryFn: ({ signal }) => services.workspace.getByOrganisationSlug(orgSlug, scenarioId, signal),
    staleTime: Number.POSITIVE_INFINITY,
  });
}
