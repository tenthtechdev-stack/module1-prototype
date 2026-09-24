'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';

const PrivateRuntime = dynamic(() => import('@/src/components/providers/app-providers').then((module) => module.AppProviders));

/** Prototype review shares one runtime across public and private journeys. */
export function RuntimeBoundary({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return process.env.NEXT_PUBLIC_PROTOTYPE_MODE === 'true' || /^\/(auth|onboarding|o|platform)(\/|$)/.test(pathname)
    ? <PrivateRuntime>{children}</PrivateRuntime>
    : children;
}
