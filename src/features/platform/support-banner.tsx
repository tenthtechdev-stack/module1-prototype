'use client';

import { Eye, ArrowLeft } from 'lucide-react';
import { usePlatform } from './platform-context';
import { usePrototype } from '@/src/components/providers/prototype-provider';
import './support-banner.css';

export function PlatformSupportBanner({ orgSlug }: { orgSlug: string }) {
  const { supportOrganisationId, organisations, returnToPlatform } = usePlatform();
  const { roleId } = usePrototype();
  const organisation = organisations.find(org => org.id === supportOrganisationId && org.slug === orgSlug);
  if (!organisation || roleId !== 'admin') return null;
  return <aside className="platform-support-banner" aria-label="Platform Admin support context"><Eye size={19} /><div><strong>Platform Admin preview · {organisation.name}</strong><span>Viewing the existing tenant demo as Zara Rahman, Tenth Tech. {organisation.status === 'Suspended' ? 'Organisation suspended · support preview only. ' : ''}Tenant demo data is illustrative; platform settings are managed separately.</span></div><button onClick={returnToPlatform}><ArrowLeft size={15} />Return to Platform</button></aside>;
}
