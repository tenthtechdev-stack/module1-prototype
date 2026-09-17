import { workspaceFixtures } from '@/src/fixtures/data';
import type { OrganisationMaterialisation, OrganisationSetupRepository, SaveOrganisationInput } from '@/src/services/onboarding-contracts';
import { mockDelay } from '@/src/services/mock/mock-delay';
import {
  MockOnboardingStore,
  OnboardingServiceError,
  mockOnboardingStore,
  requireSession,
  touchSession,
} from '@/src/services/mock/onboarding-store';

function slugify(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 54) || 'organisation';
}

export class MockOrganisationSetupRepository implements OrganisationSetupRepository {
  constructor(private readonly store: MockOnboardingStore = mockOnboardingStore) {}

  async save(input: SaveOrganisationInput, signal?: AbortSignal): Promise<OrganisationMaterialisation> {
    await mockDelay(520, signal);
    if (input.name.trim().length < 2) throw new OnboardingServiceError('validation', 'Enter an organisation name.');
    if (!input.countryCode.trim() || !input.timeZone.trim()) throw new OnboardingServiceError('validation', 'Choose a country and time zone.');
    if (input.reportingCurrency.toUpperCase() !== 'GBP') {
      throw new OnboardingServiceError('validation', 'The Phase 2 prototype currently supports GBP reporting currency.');
    }
    if (input.financeEmail && !/^\S+@\S+\.\S+$/.test(input.financeEmail.trim())) {
      throw new OnboardingServiceError('validation', 'Enter a valid finance contact email.');
    }
    if (input.financeEmail?.trim().toLowerCase() === 'failure@organisation.test') {
      throw new OnboardingServiceError('processing_failed', 'The organisation service could not save these details. Please retry.');
    }

    return this.store.transaction((draft) => {
      const session = requireSession(draft, input.sessionId);
      if (session.pendingBilling?.paymentStatus !== 'accepted') {
        throw new OnboardingServiceError('prerequisite', 'Payment must be accepted before the organisation is created.');
      }
      const ownerAccount = draft.accounts[session.ownerAccountId];
      if (!ownerAccount) throw new OnboardingServiceError('not_found', 'The registered owner account could not be found.');
      const now = this.store.nowIso();

      let organisation = session.organisationId ? draft.organisations[session.organisationId] : undefined;
      if (!organisation) {
        const organisationId = this.store.createId('org');
        const baseSlug = slugify(input.name);
        const occupied = new Set([
          ...workspaceFixtures.map((workspace) => workspace.organisation.slug),
          ...Object.values(draft.organisations).map((item) => item.slug),
        ]);
        let slug = baseSlug;
        let suffix = 2;
        while (occupied.has(slug)) {
          slug = `${baseSlug}-${suffix}`;
          suffix += 1;
        }
        organisation = {
          id: organisationId,
          slug,
          name: input.name.trim(),
          reportingCurrency: 'GBP',
          timeZone: input.timeZone.trim(),
          countryCode: input.countryCode.trim().toUpperCase(),
          businessAddress: input.businessAddress?.trim() || null,
          financeEmail: input.financeEmail?.trim().toLowerCase() || null,
          onboardingStatus: 'provisioning',
        };
        const owner = {
          id: this.store.createId('usr'),
          organisationId,
          name: `${ownerAccount.firstName} ${ownerAccount.lastName}`,
          email: ownerAccount.email,
          jobTitle: 'Organisation Admin',
          roleId: 'admin',
          companyIds: 'all' as const,
          marketplaceAccountIds: 'all' as const,
        };
        const subscription = {
          id: this.store.createId('sub'),
          organisationId,
          status: 'active' as const,
          planName: session.pendingBilling.planName,
          renewsAt: new Date(Date.parse(now) + 30 * 86_400_000).toISOString().slice(0, 10),
        };
        const entitlement = {
          organisationId,
          moduleKey: 'marketplace-profitability' as const,
          enabled: true,
        };
        draft.organisations[organisationId] = organisation;
        draft.users[owner.id] = owner;
        draft.activeUserId = owner.id;
        draft.subscriptions[organisationId] = subscription;
        draft.entitlements[organisationId] = [entitlement];
        draft.cogs[organisationId] = {
          organisationId,
          importedProductCount: 0,
          coveredProductCount: 0,
          costedProductIds: [],
          sampleProducts: [],
          records: [],
        };
        session.organisationId = organisationId;
        session.ownerUserId = owner.id;
      } else {
        organisation.name = input.name.trim();
        organisation.timeZone = input.timeZone.trim();
        organisation.countryCode = input.countryCode.trim().toUpperCase();
        organisation.businessAddress = input.businessAddress?.trim() || null;
        organisation.financeEmail = input.financeEmail?.trim().toLowerCase() || null;
        if (session.ownerUserId) draft.activeUserId = session.ownerUserId;
      }

      if (!session.completedSteps.includes('organisation')) session.completedSteps.push('organisation');
      session.currentStep = 'companies';
      touchSession(this.store, session);
      const organisationId = organisation.id;
      return {
        organisation,
        owner: Object.values(draft.users).find((user) => user.id === session.ownerUserId)!,
        subscription: draft.subscriptions[organisationId],
        entitlement: draft.entitlements[organisationId][0],
        session,
      };
    });
  }
}
