import { ROLE_PRESETS } from '@/src/domain/permissions';
import type { InvitationAcceptance } from '@/src/domain/onboarding';
import type { AcceptInvitationInput, InvitationRepository, InviteUserInput } from '@/src/services/onboarding-contracts';
import { mockDelay } from '@/src/services/mock/mock-delay';
import {
  MockOnboardingStore,
  OnboardingServiceError,
  mockOnboardingStore,
  requireOrganisationId,
} from '@/src/services/mock/onboarding-store';

function emailFor(value: string) {
  return value.trim().toLowerCase();
}

export class MockInvitationRepository implements InvitationRepository {
  constructor(private readonly store: MockOnboardingStore = mockOnboardingStore) {}

  async list(sessionId: string, signal?: AbortSignal) {
    await mockDelay(220, signal);
    const state = this.store.read();
    const organisationId = requireOrganisationId(state, sessionId);
    return Object.values(state.invitations).filter((invitation) => invitation.organisationId === organisationId);
  }

  async invite(input: InviteUserInput, signal?: AbortSignal) {
    await mockDelay(470, signal);
    const email = emailFor(input.email);
    if (input.name.trim().length < 2) throw new OnboardingServiceError('validation', 'Enter the invitee name.');
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new OnboardingServiceError('validation', 'Enter a valid invitation email.');
    const role = ROLE_PRESETS.find((item) => item.id === input.roleId && item.surface === 'tenant');
    if (!role) throw new OnboardingServiceError('validation', 'Choose a tenant role for this invitation.');
    const invitation = this.store.transaction((draft) => {
      const organisationId = requireOrganisationId(draft, input.sessionId);
      if (Object.values(draft.users).some((user) => user.organisationId === organisationId && user.email.toLowerCase() === email)
        || Object.values(draft.invitations).some((item) => item.organisationId === organisationId && item.email === email && item.status === 'pending')) {
        throw new OnboardingServiceError('conflict', 'This person is already a user or has a pending invitation.');
      }
      const companies = Object.values(draft.companies).filter((company) => company.organisationId === organisationId);
      const companyIds = new Set(companies.map((company) => company.id));
      if (input.companyIds !== 'all' && input.companyIds.some((id) => !companyIds.has(id))) {
        throw new OnboardingServiceError('validation', 'A company assignment is outside this organisation.');
      }
      const accounts = Object.values(draft.marketplaceAccounts).filter((account) => account.organisationId === organisationId);
      const accountIds = new Set(accounts.filter((account) => input.companyIds === 'all' || input.companyIds.includes(account.companyId)).map((account) => account.id));
      if (input.marketplaceAccountIds !== 'all' && input.marketplaceAccountIds.some((id) => !accountIds.has(id))) {
        throw new OnboardingServiceError('validation', 'A marketplace assignment is outside the selected company scope.');
      }
      const now = this.store.nowIso();
      const item = {
        id: this.store.createId('invite'),
        token: this.store.createId('invite-token'),
        organisationId,
        name: input.name.trim(),
        email,
        roleId: role.id,
        companyIds: input.companyIds === 'all' ? 'all' as const : [...input.companyIds],
        marketplaceAccountIds: input.marketplaceAccountIds === 'all' ? 'all' as const : [...input.marketplaceAccountIds],
        status: input.outcome === 'failure' ? 'failed' as const : 'pending' as const,
        invitedAt: now,
        acceptedAt: null,
        expiresAt: new Date(Date.parse(now) + 7 * 86_400_000).toISOString(),
        errorCode: input.outcome === 'failure' ? 'send_failed' : null,
      };
      draft.invitations[item.id] = item;
      return item;
    });
    if (invitation.status === 'failed') throw new OnboardingServiceError('processing_failed', 'The invitation could not be sent.');
    return invitation;
  }

  async remove(sessionId: string, invitationId: string, signal?: AbortSignal) {
    await mockDelay(280, signal);
    this.store.transaction((draft) => {
      const organisationId = requireOrganisationId(draft, sessionId);
      const invitation = draft.invitations[invitationId];
      if (!invitation || invitation.organisationId !== organisationId) throw new OnboardingServiceError('not_found', 'The invitation could not be found.');
      if (invitation.status === 'accepted') throw new OnboardingServiceError('dependency', 'An accepted invitation cannot be removed.');
      invitation.status = 'cancelled';
    });
  }

  async resend(sessionId: string, invitationId: string, outcome: 'success' | 'failure' = 'success', signal?: AbortSignal) {
    await mockDelay(420, signal);
    const invitation = this.store.transaction((draft) => {
      const organisationId = requireOrganisationId(draft, sessionId);
      const item = draft.invitations[invitationId];
      if (!item || item.organisationId !== organisationId) throw new OnboardingServiceError('not_found', 'The invitation could not be found.');
      if (item.status === 'accepted' || item.status === 'cancelled') throw new OnboardingServiceError('dependency', 'This invitation cannot be resent.');
      const now = this.store.nowIso();
      item.token = this.store.createId('invite-token');
      item.invitedAt = now;
      item.expiresAt = new Date(Date.parse(now) + 7 * 86_400_000).toISOString();
      item.status = outcome === 'failure' ? 'failed' : 'pending';
      item.errorCode = outcome === 'failure' ? 'send_failed' : null;
      return item;
    });
    if (invitation.status === 'failed') throw new OnboardingServiceError('processing_failed', 'The invitation could not be resent.');
    return invitation;
  }

  async getByToken(token: string, signal?: AbortSignal) {
    await mockDelay(260, signal);
    const invitation = Object.values(this.store.read().invitations).find((item) => item.token === token) ?? null;
    if (!invitation) return null;
    if (invitation.status === 'pending' && Date.parse(invitation.expiresAt) <= Date.parse(this.store.nowIso())) return { ...invitation, status: 'expired' as const };
    return invitation;
  }

  async accept(input: AcceptInvitationInput, signal?: AbortSignal): Promise<InvitationAcceptance> {
    await mockDelay(520, signal);
    if (!input.firstName.trim() || !input.lastName.trim()) throw new OnboardingServiceError('validation', 'Enter your first and last name.');
    if (input.password.length < 8 || !/[A-Za-z]/.test(input.password) || !/\d/.test(input.password)) {
      throw new OnboardingServiceError('validation', 'Use at least 8 characters including a letter and a number.');
    }
    return this.store.transaction((draft) => {
      const invitation = Object.values(draft.invitations).find((item) => item.token === input.token);
      if (!invitation) throw new OnboardingServiceError('not_found', 'This invitation link is not valid.');
      if (invitation.status === 'accepted') throw new OnboardingServiceError('conflict', 'This invitation has already been accepted.');
      if (invitation.status !== 'pending' || Date.parse(invitation.expiresAt) <= Date.parse(this.store.nowIso())) {
        invitation.status = 'expired';
        throw new OnboardingServiceError('expired', 'This invitation has expired.');
      }
      const organisation = draft.organisations[invitation.organisationId];
      if (!organisation) throw new OnboardingServiceError('not_found', 'The inviting organisation could not be found.');
      const user = {
        id: this.store.createId('usr'),
        organisationId: invitation.organisationId,
        name: `${input.firstName.trim()} ${input.lastName.trim()}`,
        email: invitation.email,
        jobTitle: ROLE_PRESETS.find((role) => role.id === invitation.roleId)?.label ?? 'Team member',
        roleId: invitation.roleId,
        companyIds: invitation.companyIds === 'all' ? 'all' as const : [...invitation.companyIds],
        marketplaceAccountIds: invitation.marketplaceAccountIds === 'all' ? 'all' as const : [...invitation.marketplaceAccountIds],
      };
      draft.users[user.id] = user;
      draft.activeUserId = user.id;
      invitation.status = 'accepted';
      invitation.acceptedAt = this.store.nowIso();
      return { invitation, user, organisationSlug: organisation.slug };
    });
  }
}
