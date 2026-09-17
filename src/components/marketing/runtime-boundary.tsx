'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';

const PrivateRuntime = dynamic(() => import('@/src/components/providers/app-providers').then((module) => module.AppProviders));

/** Keeps the same provider instance across auth, onboarding and workspace navigation. */
export function RuntimeBoundary({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return /^\/(auth|onboarding|o|platform)(\/|$)/.test(pathname)
    ? <PrivateRuntime>{children}</PrivateRuntime>
    : children;
}
