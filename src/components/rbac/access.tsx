'use client';

import { AlertTriangle, CreditCard, LockKeyhole, PackageX } from 'lucide-react';
import { evaluateAccess, type AccessDecision, type Capability } from '@/src/domain/permissions';
import { usePrototype } from '@/src/components/providers/prototype-provider';

export function useAccess(capability: Capability, target?: { companyId?: string; accountId?: string }) {
  const { role, runtime } = usePrototype();
  return evaluateAccess({
    capability,
    role,
    subscriptionStatus: runtime.subscriptionStatus,
    entitlements: runtime.entitlements,
    companyId: target?.companyId,
    accountId: target?.accountId,
  });
}

const accessCopy: Record<Exclude<AccessDecision, { allowed: true }>['reason'], { title: string; body: string; action: string }> = {
  subscription_restricted: {
    title: 'Subscription access is restricted',
    body: 'This organisation has a past-due subscription. A billing manager can restore product access.',
    action: 'Open billing',
  },
  module_not_entitled: {
    title: 'This module is not included',
    body: 'Your current plan does not include this module. Existing financial data remains unchanged.',
    action: 'Review plan',
  },
  capability_missing: {
    title: 'You do not have permission for this page',
    body: 'Ask an organisation administrator to add the required capability to your role.',
    action: 'View my access',
  },
  assignment_out_of_scope: {
    title: 'This record is outside your assignment',
    body: 'Your role does not include the company or marketplace account requested by this link.',
    action: 'Return to assigned data',
  },
};

export function AccessState({ decision }: { decision: Exclude<AccessDecision, { allowed: true }> }) {
  const copy = accessCopy[decision.reason];
  const Icon = decision.reason === 'subscription_restricted'
    ? CreditCard
    : decision.reason === 'module_not_entitled'
      ? PackageX
      : decision.reason === 'assignment_out_of_scope'
        ? AlertTriangle
        : LockKeyhole;
  return (
    <section className="state-card access-state" role="status">
      <span className={`state-icon ${decision.reason}`}><Icon size={21} /></span>
      <div>
        <p className="eyebrow">Access state</p>
        <h2>{copy.title}</h2>
        <p>{copy.body}</p>
        <button className="secondary-button">{copy.action}</button>
      </div>
    </section>
  );
}

export function PermissionBoundary({ capability, children, fallback = null }: { capability: Capability; children: React.ReactNode; fallback?: React.ReactNode }) {
  const decision = useAccess(capability);
  return decision.allowed ? children : fallback;
}
