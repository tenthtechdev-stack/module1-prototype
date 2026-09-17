import { PlatformShell } from '@/src/components/layout/platform-shell';
import type { Metadata } from 'next';
export const metadata: Metadata = { robots: { index: false, follow: false } };
export default function Layout({ children }: { children: React.ReactNode }) { return <PlatformShell>{children}</PlatformShell>; }
