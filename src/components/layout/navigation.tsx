'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as Dialog from '@radix-ui/react-dialog';
import * as Tooltip from '@radix-ui/react-tooltip';
import { ChevronDown, LockKeyhole, Menu, X } from 'lucide-react';
import type { NavigationSection } from '@/src/config/navigation';
import { evaluateAccess } from '@/src/domain/permissions';
import { usePrototype } from '@/src/components/providers/prototype-provider';

function buildHref(href: string, orgSlug?: string) {
  return orgSlug ? `/o/${orgSlug}${href}` : href;
}

export function NavigationList({ sections, orgSlug, compact = false, onNavigate }: { sections: NavigationSection[]; orgSlug?: string; compact?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { role, runtime } = usePrototype();

  return (
    <nav className={compact ? 'navigation-list compact' : 'navigation-list'} aria-label={orgSlug ? 'Tenant navigation' : 'Platform navigation'}>
      {sections.map((section) => {
        const items = section.items.map((item) => ({
          ...item,
          decision: evaluateAccess({ capability: item.capability, role, subscriptionStatus: runtime.subscriptionStatus, entitlements: runtime.entitlements }),
        })).filter((item) => item.decision.allowed || item.decision.reason === 'subscription_restricted' || item.decision.reason === 'module_not_entitled');
        if (!items.length) return null;
        return (
          <section key={section.label}>
            <p className="nav-label">{section.label}</p>
            {items.map((item) => {
              const href = buildHref(item.href, orgSlug);
              const active = pathname === href || (href !== '/platform/dashboard' && pathname.startsWith(`${href}/`));
              const locked = !item.decision.allowed;
              const content = (
                <Link className={`nav-item${active ? ' active' : ''}${locked ? ' locked' : ''}`} href={href} onClick={onNavigate} aria-current={active ? 'page' : undefined}>
                  <item.icon size={17} aria-hidden="true" />
                  <span>{item.label}</span>
                  {locked ? <LockKeyhole className="nav-lock" size={13} aria-label="Restricted" /> : null}
                  {item.label === 'Needs Attention' ? <b>7</b> : null}
                </Link>
              );
              return compact ? (
                <Tooltip.Root key={item.label}>
                  <Tooltip.Trigger asChild>{content}</Tooltip.Trigger>
                  <Tooltip.Portal><Tooltip.Content side="right" className="tooltip-content">{item.label}<Tooltip.Arrow className="tooltip-arrow" /></Tooltip.Content></Tooltip.Portal>
                </Tooltip.Root>
              ) : <div key={item.label}>{content}</div>;
            })}
          </section>
        );
      })}
    </nav>
  );
}

export function MobileNavigation({ sections, orgSlug, platform = false }: { sections: NavigationSection[]; orgSlug?: string; platform?: boolean }) {
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
          <Dialog.Close asChild><div><NavigationList sections={sections} orgSlug={orgSlug} /></div></Dialog.Close>
          {!platform ? <div className="org-card"><span className="org-monogram">S</span><div><strong>Stock Supplies</strong><small>Growth plan</small></div><ChevronDown size={14} /></div> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
