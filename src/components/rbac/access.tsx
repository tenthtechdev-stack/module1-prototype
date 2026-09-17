'use client';

import { AlertTriangle, CreditCard, LockKeyhole, PackageX } from 'lucide-react';
import { ROLE_PRESETS, evaluateAccess, type AccessDecision, type Capability } from '@/src/domain/permissions';
import type { ModuleEntitlementKey } from '@/src/domain/models';
import { usePrototype } from '@/src/components/providers/prototype-provider';
import { useOptionalAnalysisContext } from '@/src/components/providers/analysis-context-provider';

export function useAccessRuntime() {
  const { enabled: prototypeEnabled, role: prototypeRole, assignment: prototypeAssignment, runtime } = usePrototype();
  const workspace = useOptionalAnalysisContext()?.workspace;
  const activeUser = workspace?.activeUser ?? null;
  const role = !prototypeEnabled && activeUser
    ? ROLE_PRESETS.find((item) => item.surface === 'tenant' && item.id === activeUser.roleId) ?? prototypeRole
    : prototypeRole;
  const assignment = !prototypeEnabled && activeUser ? {
    companyIds: activeUser.companyIds,
    accountIds: activeUser.marketplaceAccountIds,
  } : prototypeAssignment;
  const entitlements = !prototypeEnabled && workspace
    ? new Set<ModuleEntitlementKey>(workspace.entitlements.filter((entitlement) => entitlement.enabled).map((entitlement) => entitlement.moduleKey))
    : new Set(runtime.entitlements);
  return {
    role,
    assignment,
    subscriptionStatus: prototypeEnabled ? runtime.subscriptionStatus : workspace?.subscription.status ?? runtime.subscriptionStatus,
    entitlements,
  };
}

export function useAccess(capability: Capability, target?: { companyId?: string; accountId?: string }) {
  const { role, assignment, subscriptionStatus, entitlements } = useAccessRuntime();
  return evaluateAccess({
    capability,
    role,
    assignment,
    subscriptionStatus,
    entitlements,
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

export function SubscriptionState() { return <AccessState decision={{ allowed: false, reason: 'subscription_restricted' }} />; }
export function ModuleEntitlementState() { return <AccessState decision={{ allowed: false, reason: 'module_not_entitled' }} />; }
export function PermissionState() { return <AccessState decision={{ allowed: false, reason: 'capability_missing' }} />; }
export function AssignmentState() { return <AccessState decision={{ allowed: false, reason: 'assignment_out_of_scope' }} />; }
