import type { Metadata } from 'next';
import { AccountShell } from '@/src/features/account/account-shell';

export const metadata: Metadata = {
  title: 'My Account | Stock Supplies',
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <AccountShell>{children}</AccountShell>;
}

