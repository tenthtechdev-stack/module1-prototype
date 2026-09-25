'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import * as Dialog from '@radix-ui/react-dialog';
import * as Tooltip from '@radix-ui/react-tooltip';
import { ChevronDown, LockKeyhole, Menu, X } from 'lucide-react';
import type { NavigationSection } from '@/src/config/navigation';
import { evaluateAccess } from '@/src/domain/permissions';
import { useAccessRuntime } from '@/src/components/rbac/access';
import type { WorkspaceSnapshot } from '@/src/services/contracts';

function buildHref(href: string, orgSlug?: string, query?: string) {
  const path = orgSlug ? `/o/${orgSlug}${href}` : href;
  return orgSlug && query ? `${path}?${query}` : path;
}

export function OrganisationCard({ workspace }: { workspace: WorkspaceSnapshot }) {
  const monogram = workspace.organisation.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();

  return <div className="org-card"><span className="org-monogram">{monogram}</span><div><strong>{workspace.organisation.name}</strong><small>{workspace.subscription.planName}</small></div><ChevronDown size={14} /></div>;
}

export function NavigationList({ sections, orgSlug, compact = false, onNavigate, attentionCount }: { sections: NavigationSection[]; orgSlug?: string; compact?: boolean; onNavigate?: () => void; attentionCount?: number }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { role, assignment, subscriptionStatus, entitlements } = useAccessRuntime();
  const analysisQuery = useMemo(() => {
    const next = new URLSearchParams();
    for (const key of ['company', 'marketplace', 'range', 'from', 'to']) {
      const value = searchParams.get(key);
      if (value) next.set(key, value);
    }
    const accountScope = searchParams.get('accounts') ?? searchParams.get('account');
    if (accountScope) next.set('accounts', accountScope);
    return next.toString();
  }, [searchParams]);

  return (
    <nav className={compact ? 'navigation-list compact' : 'navigation-list'} aria-label={orgSlug ? 'Tenant navigation' : 'Platform navigation'}>
      {sections.map((section) => {
        const items = section.items.map((item) => ({
          ...item,
          decision: evaluateAccess({ capability: item.capability, role, assignment, subscriptionStatus, entitlements }),
        })).filter((item) => item.decision.allowed || item.decision.reason === 'subscription_restricted' || item.decision.reason === 'module_not_entitled');
        if (!items.length) return null;
        return (
          <section key={section.label}>
            <p className="nav-label">{section.label}</p>
            {items.map((item) => {
              const href = buildHref(item.href, orgSlug, analysisQuery);
              const activePath = buildHref(item.href, orgSlug);
              const reportRoot = orgSlug && item.href.startsWith('/reports/') ? `/o/${orgSlug}/reports` : null;
              const active = pathname === activePath || (activePath !== '/platform/dashboard' && pathname.startsWith(`${activePath}/`)) || Boolean(reportRoot && pathname.startsWith(`${reportRoot}/`));
              const locked = !item.decision.allowed;
              const itemAttentionCount = item.label === 'Needs Attention' && item.decision.allowed ? attentionCount : undefined;
              const content = (
                <Link className={`nav-item${active ? ' active' : ''}${locked ? ' locked' : ''}`} href={href} onClick={onNavigate} aria-current={active ? 'page' : undefined} aria-label={itemAttentionCount ? `${item.label}, ${itemAttentionCount} open issues` : item.label}>
                  <item.icon size={17} aria-hidden="true" />
                  <span>{item.label}</span>
                  {locked ? <LockKeyhole className="nav-lock" size={13} aria-label="Restricted" /> : null}
                  {itemAttentionCount ? <b aria-hidden="true">{itemAttentionCount}</b> : null}
                </Link>
              );
              return (
                <Tooltip.Root key={item.label} delayDuration={compact ? 150 : 500}>
                  <Tooltip.Trigger asChild>{content}</Tooltip.Trigger>
                  <Tooltip.Portal><Tooltip.Content side="right" className={`tooltip-content${compact ? ' force-tooltip' : ''}`}>{item.label}<Tooltip.Arrow className="tooltip-arrow" /></Tooltip.Content></Tooltip.Portal>
                </Tooltip.Root>
              );
            })}
          </section>
        );
      })}
    </nav>
  );
}

export function MobileNavigation({ sections, orgSlug, platform = false, workspace, attentionCount }: { sections: NavigationSection[]; orgSlug?: string; platform?: boolean; workspace?: WorkspaceSnapshot; attentionCount?: number }) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild><button className="icon-button mobile-menu-trigger" aria-label="Open navigation"><Menu size={19} /></button></Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="drawer-overlay" />
        <Dialog.Content className="mobile-nav-drawer" aria-describedby={undefined}>
          <div className="drawer-heading">
            <div className="brand-lockup drawer-brand"><span className="brand-mark">{platform ? 'TT' : 'SS'}</span><div><Dialog.Title>{platform ? 'Tenth Tech' : 'Stock Supplies'}</Dialog.Title><span>{platform ? 'Platform Admin' : 'Profitability'}</span></div></div>
            <Dialog.Close asChild><button className="icon-button" aria-label="Close navigation"><X size={18} /></button></Dialog.Close>
          </div>
          <Dialog.Close asChild><div><NavigationList sections={sections} orgSlug={orgSlug} attentionCount={attentionCount} /></div></Dialog.Close>
          {!platform && workspace ? <OrganisationCard workspace={workspace} /> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
