'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Database, ShieldCheck } from 'lucide-react';
import { useOnboarding } from '@/src/components/providers/onboarding-provider';
import { usePrototype } from '@/src/components/providers/prototype-provider';
import { Alert, Spinner } from '@/src/components/ui/feedback';
import { ROLE_PRESETS } from '@/src/domain/permissions';
import type { OnboardingInvitation, OnboardingSnapshot } from '@/src/domain/onboarding';
import { services } from '@/src/services/runtime';
import { usePlatform } from '@/src/features/platform/platform-context';
import {
  ForgotPasswordForm,
  InviteAcceptanceForm,
  RegistrationForm,
  SignInForm,
  type AuthActionFailure,
  type InvitationStatus as AuthInvitationStatus,
  type InvitationSummary,
  type InviteAcceptanceField,
  type RegistrationField,
} from '@/src/features/auth/auth-experience';

function messageFor(error: unknown) {
  return error instanceof Error && error.message
    ? error.message
    : 'The request could not be completed. Please try again.';
}

function fieldFailure<FieldName extends string>(
  error: unknown,
  fieldErrors?: Partial<Record<FieldName, string>>,
): AuthActionFailure<FieldName> {
  return { ok: false, message: messageFor(error), fieldErrors };
}

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="auth-page auth-route-shell">
      <a className="skip-link" href="#auth-content">Skip to account form</a>
      <section className="auth-aside" aria-label="Stock Supplies product introduction">
        <div className="auth-brand"><span className="brand-mark">SS</span><strong>Stock Supplies</strong></div>
        <div>
          <p className="eyebrow light">Marketplace profitability</p>
          <h1>Set up once. See what every sale really earned.</h1>
          <p>Connect Amazon, eBay and Temu while keeping sync health, cost coverage and team access clear.</p>
          <ul>
            <li><Check size={15} aria-hidden="true" /> Transparent marketplace sync</li>
            <li><Database size={15} aria-hidden="true" /> Honest COGS readiness</li>
            <li><ShieldCheck size={15} aria-hidden="true" /> Role and assignment controls</li>
          </ul>
        </div>
        <small>Module 01 prototype · Built by Tenth Tech</small>
      </section>
      <section className="auth-form-wrap" id="auth-content">{children}</section>
    </main>
  );
}

export function RegistrationRouteExperience() {
  const router = useRouter();
  const { register } = useOnboarding();
  const { setRoleId } = usePrototype();

  return (
    <AuthShell>
      <RegistrationForm onRegister={async (input) => {
        try {
          await register({
            firstName: input.firstName,
            lastName: input.lastName,
            email: input.email,
            password: input.password,
            confirmPassword: input.password,
            termsAccepted: input.acceptedTerms,
          });
          setRoleId('admin');
          router.push('/onboarding/subscription');
          return { ok: true };
        } catch (error) {
          const message = messageFor(error);
          const emailError = /email|account already exists/i.test(message) ? message : undefined;
          return fieldFailure<RegistrationField>(error, emailError ? { email: emailError } : undefined);
        }
      }} />
    </AuthShell>
  );
}

export function SignInRouteExperience() {
  const router = useRouter();
  const { role, organisationSlug } = usePrototype();

  return (
    <AuthShell>
      <SignInForm
        onSignIn={async () => {
          // The form validates email format and a non-empty password. Mock access
          // comes entirely from the selected prototype role, with no account lookup.
          await new Promise<void>((resolve) => window.setTimeout(resolve, 350));
          const tenantPage = role.capabilities.includes('profitability.view') ? 'dashboard' : 'products';
          router.push(role.surface === 'platform' ? '/platform' : `/o/${organisationSlug}/${tenantPage}`);
          return { ok: true };
        }}
      />
    </AuthShell>
  );
}

export function ForgotPasswordRouteExperience() {
  return (
    <AuthShell>
      <ForgotPasswordForm onRequestReset={async ({ email }) => {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 650));
        return {
          ok: true,
          message: `If an account exists for ${email}, a reset link has been sent.`,
        };
      }} />
    </AuthShell>
  );
}

function invitationStatus(invitation: OnboardingInvitation | null): AuthInvitationStatus {
  if (!invitation || invitation.status === 'cancelled' || invitation.status === 'failed') return 'invalid';
  if (invitation.status === 'expired') return 'expired';
  if (invitation.status === 'accepted') return 'accepted';
  return 'pending';
}

function readableInviteeName(email: string) {
  const localPart = email.split('@')[0] ?? '';
  const words = localPart
    .split(/[._+-]+/)
    .map((word) => word.replace(/\d+$/g, ''))
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`);
  return words.join(' ') || 'Invited team member';
}

function inviteeParts(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? 'Invited',
    lastName: parts.slice(1).join(' ') || 'User',
  };
}

function readableDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function unknownInvitation(token: string): InvitationSummary {
  return {
    id: token || 'unknown-invitation',
    inviteeName: 'Invited team member',
    email: '',
    organisationName: 'Stock Supplies organisation',
    roleName: 'Assigned team role',
    companyAssignments: [],
    marketplaceAccountAssignments: [],
    status: 'invalid',
  };
}

function invitationSummary(
  invitation: OnboardingInvitation,
  snapshot: OnboardingSnapshot | null,
): InvitationSummary {
  const relatedSnapshot = snapshot?.organisation?.id === invitation.organisationId ? snapshot : null;
  const companyNames = invitation.companyIds === 'all'
    ? 'all' as const
    : invitation.companyIds.map((companyId) => (
        relatedSnapshot?.companies.find((company) => company.id === companyId)?.name
        ?? `Assigned company · ${companyId}`
      ));
  const accountNames = invitation.marketplaceAccountIds === 'all'
    ? 'all' as const
    : invitation.marketplaceAccountIds.map((accountId) => (
        relatedSnapshot?.marketplaceAccounts.find((account) => account.id === accountId)?.displayName
        ?? `Assigned account · ${accountId}`
      ));

  return {
    id: invitation.id,
    inviteeName: invitation.name || readableInviteeName(invitation.email),
    email: invitation.email,
    organisationName: relatedSnapshot?.organisation?.name ?? 'Your Stock Supplies organisation',
    roleName: ROLE_PRESETS.find((role) => role.id === invitation.roleId)?.label ?? 'Assigned team role',
    companyAssignments: companyNames,
    marketplaceAccountAssignments: accountNames,
    status: invitationStatus(invitation),
    expiresAt: readableDate(invitation.expiresAt),
  };
}

function InvitationLoadingCard() {
  return (
    <section className="auth-card auth-experience-card" aria-busy="true" aria-live="polite">
      <span className="auth-icon"><ShieldCheck size={20} /></span>
      <p className="eyebrow">Invitation</p>
      <h2>Checking your invitation</h2>
      <p>We are loading the organisation and access assigned to this link.</p>
      <div className="auth-loading-state"><Spinner label="Loading invitation" /> <span>Loading invitation details…</span></div>
    </section>
  );
}

export function InviteAcceptanceRouteExperience({ token }: { token: string }) {
  const router = useRouter();
  const { snapshot, acceptInvitation, resume } = useOnboarding();
  const { enabled, organisationSlug, setOrganisationSlug, setRoleId } = usePrototype();
  const isDemoInvitation = enabled && token === 'demo';
  const { organisations } = usePlatform();
  const demoOrganisation = organisations.find((organisation) => organisation.slug === organisationSlug) ?? organisations[0];
  const [invitation, setInvitation] = useState<OnboardingInvitation | null>(null);
  const [invitationSnapshot, setInvitationSnapshot] = useState<OnboardingSnapshot | null>(null);
  const [resolved, setResolved] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (isDemoInvitation) return;
    let cancelled = false;
    void Promise.all([
      services.onboarding.invitations.getByToken(token),
      resume(),
    ])
      .then(([result, ownerSnapshot]) => {
        if (cancelled) return;
        setInvitation(result);
        setInvitationSnapshot(ownerSnapshot);
        setLoadError('');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setInvitation(null);
        setLoadError(messageFor(error));
      })
      .finally(() => {
        if (!cancelled) setResolved(true);
    });
    return () => { cancelled = true; };
  }, [isDemoInvitation, resume, token]);

  const tenantSnapshot = invitationSnapshot ?? snapshot;

  const summary = useMemo(
    (): InvitationSummary => isDemoInvitation ? {
      id: 'demo',
      inviteeName: 'Alex Morgan',
      email: 'alex.morgan@example.com',
      organisationName: demoOrganisation.name,
      roleName: ROLE_PRESETS.find((role) => role.id === 'finance')?.label ?? 'Finance / Accounts',
      companyAssignments: 'all',
      marketplaceAccountAssignments: 'all',
      status: 'pending',
    } : invitation ? invitationSummary(invitation, tenantSnapshot) : unknownInvitation(token),
    [demoOrganisation, invitation, isDemoInvitation, tenantSnapshot, token],
  );
  const snapshotOrganisation = tenantSnapshot?.organisation ?? null;
  const workspaceHref = isDemoInvitation
    ? `/o/${demoOrganisation.slug}/dashboard`
    : snapshotOrganisation && snapshotOrganisation.id === invitation?.organisationId
      ? `/o/${snapshotOrganisation.slug}/dashboard`
      : undefined;

  return (
    <AuthShell>
      {!resolved && !isDemoInvitation
        ? <InvitationLoadingCard />
        : <>
            {loadError ? <Alert tone="negative" title="Invitation lookup failed">{loadError}</Alert> : null}
            <InviteAcceptanceForm
              key={token}
              invitation={summary}
              workspaceHref={workspaceHref}
              onJoin={async (input) => {
                if (isDemoInvitation) {
                  await new Promise<void>((resolve) => window.setTimeout(resolve, 350));
                  setRoleId('finance');
                  setOrganisationSlug(demoOrganisation.slug);
                  router.replace(`/o/${demoOrganisation.slug}/dashboard`);
                  return { ok: true };
                }
                if (!invitation || input.invitationId !== invitation.id) {
                  return fieldFailure<InviteAcceptanceField>(new Error('This invitation link is not valid.'));
                }
                const name = inviteeParts(summary.inviteeName);
                try {
                  const result = await acceptInvitation({
                    token,
                    firstName: name.firstName,
                    lastName: name.lastName,
                    password: input.password,
                  });
                  setRoleId(result.user.roleId);
                  setOrganisationSlug(result.organisationSlug);
                  const invitedRole = ROLE_PRESETS.find((role) => role.id === result.user.roleId);
                  const tenantPage = invitedRole?.capabilities.includes('profitability.view') ? 'dashboard' : 'products';
                  router.replace(`/o/${result.organisationSlug}/${tenantPage}`);
                  return { ok: true };
                } catch (error) {
                  const message = messageFor(error);
                  if (/expired/i.test(message)) {
                    setInvitation((current) => current ? { ...current, status: 'expired' } : current);
                  } else if (/already been accepted/i.test(message)) {
                    setInvitation((current) => current ? { ...current, status: 'accepted' } : current);
                  }
                  return fieldFailure<InviteAcceptanceField>(error);
                }
              }}
            />
          </>}
    </AuthShell>
  );
}
