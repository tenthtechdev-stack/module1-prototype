'use client';

import { useMemo } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as Tooltip from '@radix-ui/react-tooltip';
import { PrototypeProvider, usePrototype } from '@/src/components/providers/prototype-provider';
import { OnboardingProvider } from '@/src/components/providers/onboarding-provider';
import { ToastProvider } from '@/src/components/ui/feedback';
import { PlatformProvider } from '@/src/features/platform/platform-context';

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
      <OnboardingProvider>
        <QueryRuntime>
          <Tooltip.Provider delayDuration={300}><ToastProvider><PlatformProvider>{children}</PlatformProvider></ToastProvider></Tooltip.Provider>
        </QueryRuntime>
      </OnboardingProvider>
    </PrototypeProvider>
  );
}
