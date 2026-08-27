'use client';

import { useMemo } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as Tooltip from '@radix-ui/react-tooltip';
import { PrototypeProvider, usePrototype } from '@/src/components/providers/prototype-provider';

function QueryRuntime({ children }: { children: React.ReactNode }) {
  const { realmKey } = usePrototype();
  const queryClient = useMemo(() => {
    void realmKey;
    return new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 30_000,
          retry: (failureCount) => failureCount < 1,
          refetchOnWindowFocus: false,
        },
      },
    });
  }, [realmKey]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <PrototypeProvider>
      <QueryRuntime>
        <Tooltip.Provider delayDuration={300}>{children}</Tooltip.Provider>
      </QueryRuntime>
    </PrototypeProvider>
  );
}
