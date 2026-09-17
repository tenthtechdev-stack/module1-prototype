import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export function MarketingCTA({ href = '/auth/register', children = 'Start Test Plan', variant = 'primary', id }: {
  href?: string; children?: React.ReactNode; variant?: 'primary' | 'secondary' | 'text'; id: string;
}) {
  return <Link href={href} prefetch={false} className={`m-cta m-cta-${variant}`} data-cta={id}>{children}<ArrowRight size={17} aria-hidden="true" /></Link>;
}
