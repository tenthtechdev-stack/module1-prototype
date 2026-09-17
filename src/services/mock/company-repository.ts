import type { CompanySetupRepository, SaveCompanyInput } from '@/src/services/onboarding-contracts';
import { mockDelay } from '@/src/services/mock/mock-delay';
import {
  MockOnboardingStore,
  OnboardingServiceError,
  mockOnboardingStore,
  requireOrganisationId,
} from '@/src/services/mock/onboarding-store';

export class MockCompanySetupRepository implements CompanySetupRepository {
  constructor(private readonly store: MockOnboardingStore = mockOnboardingStore) {}

  async list(sessionId: string, signal?: AbortSignal) {
    await mockDelay(240, signal);
    const state = this.store.read();
    const organisationId = requireOrganisationId(state, sessionId);
    return Object.values(state.companies).filter((company) => company.organisationId === organisationId);
  }

  async save(input: SaveCompanyInput, signal?: AbortSignal) {
    await mockDelay(430, signal);
    if (input.legalName.trim().length < 2) throw new OnboardingServiceError('validation', 'Enter the company legal name.');
    if (!input.countryCode.trim() || !input.reportingCurrency.trim()) {
      throw new OnboardingServiceError('validation', 'Choose the company country and reporting currency.');
    }
    return this.store.transaction((draft) => {
      const organisationId = requireOrganisationId(draft, input.sessionId);
      if (input.companyId) {
        const company = draft.companies[input.companyId];
        if (!company || company.organisationId !== organisationId) throw new OnboardingServiceError('not_found', 'The company could not be found.');
        company.legalName = input.legalName.trim();
        company.name = input.tradingName?.trim() || input.legalName.trim();
        company.tradingName = input.tradingName?.trim() || null;
        company.countryCode = input.countryCode.trim().toUpperCase();
        company.reportingCurrency = input.reportingCurrency.trim().toUpperCase();
        return company;
      }
      const company = {
        id: this.store.createId('cmp'),
        organisationId,
        name: input.tradingName?.trim() || input.legalName.trim(),
        legalName: input.legalName.trim(),
        tradingName: input.tradingName?.trim() || null,
        countryCode: input.countryCode.trim().toUpperCase(),
        reportingCurrency: input.reportingCurrency.trim().toUpperCase(),
      };
      draft.companies[company.id] = company;
      return company;
    });
  }

  async remove(sessionId: string, companyId: string, signal?: AbortSignal) {
    await mockDelay(360, signal);
    this.store.transaction((draft) => {
      const organisationId = requireOrganisationId(draft, sessionId);
      const company = draft.companies[companyId];
      if (!company || company.organisationId !== organisationId) throw new OnboardingServiceError('not_found', 'The company could not be found.');
      if (Object.values(draft.marketplaceAccounts).some((account) => account.companyId === companyId)) {
        throw new OnboardingServiceError('dependency', 'Disconnect the company marketplace accounts before removing it.');
      }
      delete draft.companies[companyId];
    });
  }
}
