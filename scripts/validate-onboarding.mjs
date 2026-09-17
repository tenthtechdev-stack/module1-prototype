import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

function pathFor(file) {
  return resolve(root, file);
}

function read(file) {
  const absolutePath = pathFor(file);
  if (!existsSync(absolutePath)) {
    failures.push(`missing file: ${file}`);
    return '';
  }
  return readFileSync(absolutePath, 'utf8');
}

function expect(condition, message) {
  if (!condition) failures.push(message);
}

function expectContains(file, needles) {
  const contents = read(file);
  for (const needle of needles) expect(contents.includes(needle), `${file} missing contract: ${needle}`);
}

const routeContracts = [
  ['app/auth/register/page.tsx', 'RegistrationRouteExperience', '@/src/features/auth/auth-routes'],
  ['app/auth/sign-in/page.tsx', 'SignInRouteExperience', '@/src/features/auth/auth-routes'],
  ['app/auth/invite/[token]/page.tsx', 'InviteAcceptanceRouteExperience', '@/src/features/auth/auth-routes'],
  ['app/onboarding/subscription/page.tsx', 'SubscriptionStep', '@/src/features/onboarding/basic-steps'],
  ['app/onboarding/payment/page.tsx', 'PaymentStep', '@/src/features/onboarding/basic-steps'],
  ['app/onboarding/organisation/page.tsx', 'OrganisationStep', '@/src/features/onboarding/basic-steps'],
  ['app/onboarding/companies/page.tsx', 'CompaniesStep', '@/src/features/onboarding/basic-steps'],
  ['app/onboarding/marketplaces/page.tsx', 'MarketplacesStep', '@/src/features/onboarding/marketplace-sync-steps'],
  ['app/onboarding/sync/page.tsx', 'SyncStep', '@/src/features/onboarding/marketplace-sync-steps'],
  ['app/onboarding/cogs/page.tsx', 'CogsStep', '@/src/features/onboarding/cogs-step'],
  ['app/onboarding/users/page.tsx', 'UsersStep', '@/src/features/onboarding/users-complete-steps'],
  ['app/onboarding/complete/page.tsx', 'CompleteStep', '@/src/features/onboarding/users-complete-steps'],
];

for (const [route, component, source] of routeContracts) {
  expectContains(route, [component, `from '${source}'`, `<${component}`]);
  const featureFile = `${source.slice(2)}.tsx`;
  expect(existsSync(pathFor(featureFile)), `${route} must point to an existing feature component file: ${featureFile}`);
  expect(!read(route).includes('OnboardingPage'), `${route} must not render the Phase 1 onboarding placeholder`);
}

expectContains('app/onboarding/layout.tsx', ['OnboardingShell']);
expectContains('src/components/providers/app-providers.tsx', ['OnboardingProvider']);
expectContains('src/domain/onboarding.ts', [
  'export const ONBOARDING_STEPS',
  "'account'",
  "'subscription'",
  "'payment'",
  "'organisation'",
  "'companies'",
  "'marketplaces'",
  "'sync'",
  "'cogs'",
  "'users'",
  "'complete'",
  'PendingBillingResult',
  'OnboardingSession',
]);
expectContains('src/services/mock/onboarding-store.ts', [
  'ONBOARDING_STORAGE_VERSION = 2',
  'stock-supplies:mock:v${ONBOARDING_STORAGE_VERSION}',
  'localStorage',
  'isPersistedState',
  'findWorkspaceBySlug',
]);
expectContains('src/components/providers/prototype-provider.tsx', [
  'ONBOARDING_STORAGE_KEY',
  'COGS_MANAGEMENT_STORAGE_KEY',
  'localStorage.removeItem(ONBOARDING_STORAGE_KEY)',
  'localStorage.removeItem(COGS_MANAGEMENT_STORAGE_KEY)',
]);

const repositoryFiles = [
  'src/services/mock/auth-repository.ts',
  'src/services/mock/billing-repository.ts',
  'src/services/mock/organisation-repository.ts',
  'src/services/mock/company-repository.ts',
  'src/services/mock/marketplace-repository.ts',
  'src/services/mock/sync-repository.ts',
  'src/services/mock/cogs-repository.ts',
  'src/services/mock/invitation-repository.ts',
  'src/services/mock/onboarding-repository.ts',
  'src/services/mock/onboarding-coordinator.ts',
];
for (const file of repositoryFiles) expect(existsSync(pathFor(file)), `missing focused onboarding repository: ${file}`);

expectContains('src/services/onboarding-contracts.ts', [
  'AuthRepository',
  'BillingRepository',
  'OrganisationSetupRepository',
  'CompanySetupRepository',
  'MarketplaceSetupRepository',
  'InitialSyncRepository',
  'InitialCogsRepository',
  'InvitationRepository',
  'OnboardingRepository',
  'OnboardingCoordinator',
  'approveAllExactMatches?: boolean',
]);
expectContains('src/services/runtime.ts', [
  'onboarding: OnboardingServices',
  'auth:',
  'billing:',
  'organisation:',
  'companies:',
  'marketplaces:',
  'sync:',
  'cogs:',
  'invitations:',
  'session:',
  'coordinator:',
]);
expectContains('src/services/mock/workspace-repository.ts', ['findWorkspaceBySlug(orgSlug)', 'MockOnboardingStore']);

const sensitiveServiceSource = [
  'src/domain/onboarding.ts',
  'src/services/onboarding-contracts.ts',
  ...repositoryFiles,
  'src/services/mock/onboarding-store.ts',
].map(read).join('\n');
for (const forbidden of ['cardNumber', 'card_number', 'fullCardNumber', 'rawCard', 'cvc', 'cvv']) {
  expect(!new RegExp(`\\b${forbidden}\\b`, 'i').test(sensitiveServiceSource), `onboarding services must not define or persist raw payment field: ${forbidden}`);
}

const moduleUrlCache = new Map();

function resolveInternalModule(specifier) {
  const relativePath = specifier.slice(2);
  for (const suffix of ['', '.ts', '.tsx', '.js', '.mjs', '/index.ts', '/index.tsx']) {
    const candidate = pathFor(`${relativePath}${suffix}`);
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`could not resolve internal module ${specifier}`);
}

async function moduleUrlFor(absoluteFile) {
  if (moduleUrlCache.has(absoluteFile)) return moduleUrlCache.get(absoluteFile);
  const source = readFileSync(absoluteFile, 'utf8');
  let output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName: absoluteFile,
  }).outputText;
  const internalSpecifiers = [...output.matchAll(/(?:from\s+|import\s*\()(['"])(@\/[^'"]+)\1/g)].map((match) => match[2]);
  for (const specifier of new Set(internalSpecifiers)) {
    const dependencyUrl = await moduleUrlFor(resolveInternalModule(specifier));
    output = output.replaceAll(`'${specifier}'`, `'${dependencyUrl}'`).replaceAll(`"${specifier}"`, `"${dependencyUrl}"`);
  }
  const url = `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`;
  moduleUrlCache.set(absoluteFile, url);
  return url;
}

async function loadTypeScriptModule(file) {
  return import(await moduleUrlFor(pathFor(file)));
}

async function expectReject(promise, code, message) {
  try {
    await promise;
    failures.push(message);
  } catch (error) {
    if (code) expect(error && typeof error === 'object' && error.code === code, `${message}: expected ${code}, received ${error?.code ?? error}`);
  }
}

async function validateServiceJourney() {
  const modules = {};
  for (const [name, file] of Object.entries({
    domain: 'src/domain/onboarding.ts',
    store: 'src/services/mock/onboarding-store.ts',
    auth: 'src/services/mock/auth-repository.ts',
    billing: 'src/services/mock/billing-repository.ts',
    organisation: 'src/services/mock/organisation-repository.ts',
    companies: 'src/services/mock/company-repository.ts',
    marketplaces: 'src/services/mock/marketplace-repository.ts',
    sync: 'src/services/mock/sync-repository.ts',
    cogs: 'src/services/mock/cogs-repository.ts',
    cogsManagement: 'src/services/mock/cogs-management-repository.ts',
    cogsManagementStore: 'src/services/mock/cogs-management-store.ts',
    invitations: 'src/services/mock/invitation-repository.ts',
    sessions: 'src/services/mock/onboarding-repository.ts',
    coordinator: 'src/services/mock/onboarding-coordinator.ts',
    workspace: 'src/services/mock/workspace-repository.ts',
  })) modules[name] = await loadTypeScriptModule(file);

  expect(
    JSON.stringify(modules.domain.ONBOARDING_STEPS) === JSON.stringify(['account', 'subscription', 'payment', 'organisation', 'companies', 'marketplaces', 'sync', 'cogs', 'users', 'complete']),
    'the canonical onboarding step order must remain stable',
  );
  expect(modules.store.ONBOARDING_STORAGE_KEY === 'stock-supplies:mock:v2', 'the onboarding persistence key must be explicitly versioned');

  let nowMs = Date.UTC(2026, 7, 29, 9, 0, 0);
  const memory = new Map();
  const storage = {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => { memory.set(key, String(value)); },
    removeItem: (key) => { memory.delete(key); },
  };
  const store = new modules.store.MockOnboardingStore(() => new Date(nowMs), () => storage);
  const auth = new modules.auth.MockAuthRepository(store);
  const billing = new modules.billing.MockBillingRepository(store);
  const organisations = new modules.organisation.MockOrganisationSetupRepository(store);
  const companies = new modules.companies.MockCompanySetupRepository(store);
  const marketplaces = new modules.marketplaces.MockMarketplaceSetupRepository(store);
  const sync = new modules.sync.MockInitialSyncRepository(store);
  const canonicalCogsStore = modules.cogsManagementStore.mockCogsManagementStore;
  canonicalCogsStore.reset();
  const cogs = new modules.cogs.MockInitialCogsRepository(store, canonicalCogsStore);
  const phaseFiveCogs = new modules.cogsManagement.MockCogsManagementRepository();
  const invitations = new modules.invitations.MockInvitationRepository(store);
  const sessions = new modules.sessions.MockOnboardingRepository(store, canonicalCogsStore);
  const coordinator = new modules.coordinator.MockOnboardingCoordinator(sessions);
  const workspace = new modules.workspace.MockWorkspaceRepository(store);

  const registrationInput = {
    firstName: 'Maya',
    lastName: 'Lewis',
    email: 'maya@phase2-validation.example',
    password: 'Prototype123',
    confirmPassword: 'Prototype123',
    termsAccepted: true,
  };
  await expectReject(auth.register({ ...registrationInput, firstName: '' }), 'validation', 'registration must reject incomplete owner details');
  await expectReject(auth.register({ ...registrationInput, email: 'failure@registration.test' }), 'processing_failed', 'registration must expose a deterministic generic request failure');
  const registration = await auth.register(registrationInput);
  const sessionId = registration.session.id;
  expect(registration.session.currentStep === 'subscription', 'registration must create an account-complete onboarding session');
  expect(!memory.get(modules.store.ONBOARDING_STORAGE_KEY)?.includes('Prototype123'), 'registration must never persist the password');
  await expectReject(auth.register(registrationInput), 'conflict', 'registration must reject an existing owner email');

  await billing.selectTestPlan({ sessionId, billingEmail: registration.account.email, billingCountryCode: 'GB' });
  await expectReject(billing.confirmTestPayment({ sessionId, paymentMethodToken: 'pm_test_declined', billingEmail: registration.account.email, billingCountryCode: 'GB' }), 'payment_declined', 'payment must expose a declined test-card state');
  await expectReject(billing.confirmTestPayment({ sessionId, paymentMethodToken: 'pm_test_failure', billingEmail: registration.account.email, billingCountryCode: 'GB' }), 'processing_failed', 'payment must expose a recoverable processing failure');
  await billing.confirmTestPayment({ sessionId, paymentMethodToken: 'pm_test_success', billingEmail: registration.account.email, billingCountryCode: 'GB' });
  const afterPayment = store.read();
  expect(afterPayment.sessions[sessionId].pendingBilling?.paymentStatus === 'accepted', 'payment must persist only a safe accepted pending billing result');
  expect(Object.keys(afterPayment.subscriptions).length === 0, 'payment-before-organisation must not materialise a tenant subscription early');
  expect(Object.keys(afterPayment.entitlements).length === 0, 'payment-before-organisation must not materialise tenant entitlements early');
  const serializedPayment = memory.get(modules.store.ONBOARDING_STORAGE_KEY) ?? '';
  expect(!serializedPayment.includes('pm_test_success') && !serializedPayment.includes('Prototype123'), 'persisted onboarding state must contain neither payment tokens nor passwords');

  const organisationInput = {
    sessionId,
    name: 'Phase Two Validation Group',
    countryCode: 'GB',
    reportingCurrency: 'GBP',
    timeZone: 'Europe/London',
    financeEmail: 'finance@phase2-validation.example',
  };
  await expectReject(organisations.save({ ...organisationInput, financeEmail: 'failure@organisation.test' }), 'processing_failed', 'organisation setup must expose a deterministic save failure');
  expect(Object.keys(store.read().organisations).length === 0, 'a failed organisation save must not materialise tenant records');
  const materialised = await organisations.save(organisationInput);
  expect(materialised.subscription.status === 'active' && materialised.subscription.planName === 'Test Plan', 'organisation creation must materialise the active Test Plan subscription');
  expect(materialised.entitlement.moduleKey === 'marketplace-profitability' && materialised.entitlement.enabled, 'organisation creation must enable Module 01');
  expect(store.read().entitlements[materialised.organisation.id].length === 1, 'owner onboarding must materialise exactly one module entitlement');
  expect(materialised.owner.roleId === 'admin' && materialised.owner.companyIds === 'all', 'the first registrant must become the Organisation Admin');

  await expectReject(sessions.completeStep(sessionId, 'companies'), 'prerequisite', 'company setup must require at least one company');
  const firstCompany = await companies.save({ sessionId, legalName: 'Phase Two Supplies Ltd', countryCode: 'GB', reportingCurrency: 'GBP' });
  const secondCompany = await companies.save({ sessionId, legalName: 'Phase Two Trading Ltd', countryCode: 'GB', reportingCurrency: 'GBP' });
  const editedSecondCompany = await companies.save({ sessionId, companyId: secondCompany.id, legalName: secondCompany.legalName, tradingName: 'Phase Two Trade', countryCode: 'GB', reportingCurrency: 'GBP' });
  expect(editedSecondCompany.name === 'Phase Two Trade', 'company setup must support editing an existing company');
  await sessions.completeStep(sessionId, 'companies');

  const amazon = await marketplaces.connect({
    sessionId,
    companyId: firstCompany.id,
    marketplace: 'amazon',
    displayName: 'Phase Two Amazon UK',
    regionCode: 'GB',
  });
  expect(amazon.companyId === firstCompany.id && amazon.authenticationStatus === 'authorised', 'marketplace accounts must retain company ownership and authorisation status');
  const ebay = await marketplaces.connect({ sessionId, companyId: secondCompany.id, marketplace: 'ebay', displayName: 'Phase Two eBay UK', regionCode: 'GB' });
  const temu = await marketplaces.connect({ sessionId, companyId: firstCompany.id, marketplace: 'temu', displayName: 'Phase Two Temu UK', regionCode: 'GB' });
  expect(ebay.companyId === secondCompany.id && temu.companyId === firstCompany.id, 'Amazon, eBay, and Temu connections must each retain their owning company');
  const expiredEbay = (await marketplaces.list(sessionId, 'ebay-auth-failed')).find((account) => account.id === ebay.id);
  expect(expiredEbay?.status === 'authentication_required' && expiredEbay.authenticationStatus === 'required', 'the eBay authentication scenario must expose a reconnectable expired-authorisation state');
  await expectReject(marketplaces.connect({
    sessionId,
    companyId: firstCompany.id,
    marketplace: 'ebay',
    displayName: 'Rejected eBay Sandbox',
    regionCode: 'GB',
    outcome: 'failed',
  }), 'processing_failed', 'a generic provider rejection must surface a focused processing failure');
  const rejectedAccount = (await marketplaces.list(sessionId)).find((account) => account.displayName === 'Rejected eBay Sandbox');
  expect(rejectedAccount?.connectionStatus === 'failed' && rejectedAccount.authenticationStatus === 'rejected', 'a rejected provider connection must remain visible with rejected authentication state');
  const restoredAccount = rejectedAccount ? await marketplaces.retry(sessionId, rejectedAccount.id) : null;
  expect(restoredAccount?.connectionStatus === 'connected' && restoredAccount.authenticationStatus === 'authorised', 'a rejected provider connection must be retryable');
  if (restoredAccount) await marketplaces.disconnect(sessionId, restoredAccount.id);
  await expectReject(companies.remove(sessionId, firstCompany.id), 'dependency', 'a company with a marketplace dependency must not be deleted');
  await sessions.completeStep(sessionId, 'marketplaces');

  const initialSync = await sync.start(sessionId);
  expect(Boolean(initialSync.startedAt), 'initial sync must persist its start timestamp');
  nowMs += 5_500;
  const progressed = await sync.getProgress(sessionId, 'healthy');
  expect(progressed.imported.products > 0 && progressed.canContinue, 'timestamp-derived sync must make products available before full completion');
  const failedFees = progressed.accounts[0].datasets.find((dataset) => dataset.dataset === 'fees');
  expect(progressed.accounts[0].status === 'failed' && failedFees?.status === 'failed' && failedFees.error?.retryable === true, 'healthy sync transport must expose a structured, retryable dataset failure without becoming a repository error');
  expect(Boolean(failedFees?.lastSuccessfulSyncAt) && (failedFees?.recordsImported ?? 0) > 0, 'a failed dataset must preserve partial records and its last successful activity');
  const delayed = await sync.getProgress(sessionId, 'amazon-delayed');
  expect(delayed.accounts[0].datasets.some((dataset) => dataset.dataset === 'fees' && dataset.status === 'delayed'), 'sync scenarios must expose dataset-level delayed state');
  const retrying = await sync.retryDataset(sessionId, amazon.id, 'fees');
  expect(retrying.accounts[0].datasets.some((dataset) => dataset.dataset === 'fees' && dataset.status === 'retrying'), 'dataset retry must expose a persisted retrying state');
  nowMs += 1_300;
  const retried = await sync.getProgress(sessionId, 'healthy');
  expect(retried.accounts[0].datasets.some((dataset) => dataset.dataset === 'fees' && dataset.status === 'synced'), 'dataset retry must complete from its persisted retry timestamp');
  await sessions.completeStep(sessionId, 'sync');

  const preview = await cogs.previewImport({ sessionId, file: { name: 'initial-costs.xlsx', size: 8_192, mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }, scenarioId: 'healthy' });
  expect(preview.exactMatches === 2_124 && preview.suggestedMatches === 211 && preview.unmatchedRows === 145 && preview.suspiciousValues === 7, 'COGS preview must expose the representative aggregate match and anomaly counts');
  const sampleProducts = await cogs.listProducts(sessionId);
  await expectReject(cogs.saveCost({ sessionId, productId: sampleProducts[0].id, unitCostMinor: 425, currency: 'AUD', effectiveFrom: '2026-08-29', changedByUserId: materialised.owner.id }), 'validation', 'the onboarding repository must reject currencies unsupported by canonical profitability conversion');
  await expectReject(cogs.applyImport({ sessionId, previewId: preview.id, approvedRowIds: [], changedByUserId: materialised.owner.id }), 'validation', 'COGS must never apply without explicit row or aggregate approval');
  const failingCanonicalStore = new modules.cogsManagementStore.MockCogsManagementStore();
  failingCanonicalStore.transaction = () => { throw new Error('Simulated canonical persistence failure'); };
  const failingCogs = new modules.cogs.MockInitialCogsRepository(store, failingCanonicalStore);
  const coverageBeforeFailedBridge = store.read().cogs[materialised.organisation.id].coveredProductCount;
  await expectReject(failingCogs.applyImport({ sessionId, previewId: preview.id, approvedRowIds: [], approveAllExactMatches: true, changedByUserId: materialised.owner.id }), 'processing_failed', 'a canonical publication failure must surface a coordinated processing failure');
  expect(store.read().costImports[preview.id].appliedAt === null && store.read().cogs[materialised.organisation.id].coveredProductCount === coverageBeforeFailedBridge, 'a failed onboarding-to-canonical bridge must roll back onboarding coverage and keep the import retryable');
  const applied = await cogs.applyImport({ sessionId, previewId: preview.id, approvedRowIds: [], approveAllExactMatches: true, changedByUserId: materialised.owner.id });
  expect(applied.coverage.coveragePercent >= 85 && applied.coverage.coveragePercent <= 87, 'explicit exact-match approval must update aggregate coverage to approximately 86%');
  expect(applied.records.length > 0 && applied.records.every((record) => record.effectiveFrom === '2026-08-29'), 'approved sample COGS records must retain their effective date');
  const canonicalFirstProductId = `${materialised.organisation.id}:product-1-001`;
  const canonicalAfterOnboarding = modules.cogsManagementStore.organisationCogsState(canonicalCogsStore.read(), materialised.organisation.id);
  expect(canonicalAfterOnboarding.recordsByProduct[canonicalFirstProductId]?.some((record) => record.unitCostMinor === applied.records[0]?.unitCostMinor && record.sourceReferenceId === preview.id), 'onboarding approval must publish the approved effective-dated cost into the shared Phase 5 canonical store');
  await sessions.completeStep(sessionId, 'cogs');

  await expectReject(invitations.invite({
    sessionId,
    name: 'Scoped Invalid',
    email: 'scoped-invalid@phase2-validation.example',
    roleId: 'marketplace-manager',
    companyIds: [secondCompany.id],
    marketplaceAccountIds: [amazon.id],
  }), 'validation', 'invitation account assignments must remain within selected company scope');
  const adminInvitation = await invitations.invite({ sessionId, name: 'Admin User', email: 'admin-user@phase2-validation.example', roleId: 'admin', companyIds: 'all', marketplaceAccountIds: 'all' });
  await expectReject(invitations.invite({ sessionId, name: 'Duplicate Admin', email: adminInvitation.email, roleId: 'admin', companyIds: 'all', marketplaceAccountIds: 'all' }), 'conflict', 'invitations must reject an existing pending user email');
  const managerInvitation = await invitations.invite({ sessionId, name: 'Marketplace Manager', email: 'marketplace-manager@phase2-validation.example', roleId: 'marketplace-manager', companyIds: [secondCompany.id], marketplaceAccountIds: [ebay.id] });
  expect(managerInvitation.roleId === 'marketplace-manager' && managerInvitation.marketplaceAccountIds.includes(ebay.id), 'marketplace-manager invitations must retain company and account scope');
  await expectReject(invitations.invite({ sessionId, name: 'Failed Invite', email: 'fail@phase2-validation.example', roleId: 'finance', companyIds: [firstCompany.id], marketplaceAccountIds: [amazon.id], outcome: 'failure' }), 'processing_failed', 'invitation sending must expose a retryable failure');
  const invitation = await invitations.invite({
    sessionId,
    name: 'Finance User',
    email: 'finance-user@phase2-validation.example',
    roleId: 'finance',
    companyIds: [firstCompany.id],
    marketplaceAccountIds: [amazon.id],
  });
  const inviteeStore = new modules.store.MockOnboardingStore(() => new Date(nowMs), () => storage);
  const inviteeInvitations = new modules.invitations.MockInvitationRepository(inviteeStore);
  const accepted = await inviteeInvitations.accept({ token: invitation.token, firstName: 'Ari', lastName: 'Morgan', password: 'Accepted123' });
  expect(accepted.user.roleId === 'finance' && accepted.user.companyIds.includes(firstCompany.id) && accepted.user.marketplaceAccountIds.includes(amazon.id), 'invite acceptance must preserve role, company, and account assignments');
  expect(accepted.organisationSlug === materialised.organisation.slug, 'invite acceptance must target the inviting tenant rather than owner onboarding');
  expect(store.read().invitations[invitation.id].status === 'accepted', 'a second browser tab must refresh the canonical invitation status without allowing a stale tab to overwrite it');
  expect(store.read().activeUserId === accepted.user.id, 'invite acceptance must activate the invited principal for tenant RBAC');
  expect(!(memory.get(modules.store.ONBOARDING_STORAGE_KEY) ?? '').includes('Accepted123'), 'invite acceptance must never persist the password');
  await sessions.completeStep(sessionId, 'users');

  const finished = await coordinator.finish(sessionId);
  expect(finished.session.status === 'complete' && finished.organisation?.onboardingStatus === 'active', 'completion must activate the tenant and finish the central session');
  const dynamicWorkspace = await workspace.getByOrganisationSlug(materialised.organisation.slug, 'healthy');
  expect(dynamicWorkspace?.organisation.id === materialised.organisation.id, 'the workspace repository must resolve a newly onboarded tenant by slug');
  expect(dynamicWorkspace?.subscription.status === 'active' && dynamicWorkspace.entitlements.length === 1, 'the dynamic workspace must retain active subscription and sole Module 01 entitlement');
  expect(dynamicWorkspace?.cogsReadiness?.coveragePercent >= 85 && dynamicWorkspace?.cogsReadiness?.cogsMissing > 0, 'the dynamic workspace must retain incomplete onboarding COGS coverage rather than imply reliable profitability');
  expect(dynamicWorkspace?.users.some((user) => user.id === accepted.user.id), 'accepted invitees must appear in the dynamic tenant workspace');
  expect(dynamicWorkspace?.activeUser.id === materialised.owner.id && dynamicWorkspace.activeUser.roleId === 'admin', 'owner completion must restore the Organisation Admin as the active tenant principal');
  if (dynamicWorkspace) {
    const phaseFiveInput = {
      context: { organisationId: dynamicWorkspace.organisation.id, companyId: 'all', marketplace: 'all', marketplaceAccountIds: [], dateRange: { from: '2026-08-01', to: '2026-09-02' } },
      organisation: dynamicWorkspace.organisation,
      scenarioId: 'healthy',
      companies: dynamicWorkspace.companies,
      marketplaceAccounts: dynamicWorkspace.marketplaceAccounts,
      authorisedCompanyIds: dynamicWorkspace.companies.map((company) => company.id),
      authorisedAccountIds: dynamicWorkspace.marketplaceAccounts.map((account) => account.id),
      reportingCurrency: dynamicWorkspace.organisation.reportingCurrency,
      canViewSensitiveExpenses: true,
      cogsReadiness: dynamicWorkspace.cogsReadiness,
      search: '', status: 'all', source: 'all', effectiveDate: 'all', changedBy: 'all', needsReview: false, page: 0, pageSize: 100,
    };
    const phaseFiveWorkspace = await phaseFiveCogs.getWorkspace(phaseFiveInput);
    expect(phaseFiveWorkspace.allRows.find((row) => row.id === canonicalFirstProductId)?.current?.unitCostMinor === applied.records[0]?.unitCostMinor, 'Phase 5 Product/COGS projections must read the onboarding-approved canonical cost without re-entry');
  }
  const pastDueWorkspace = await workspace.getByOrganisationSlug(materialised.organisation.slug, 'past-due');
  expect(pastDueWorkspace?.subscription.status === 'past_due', 'the completed tenant workspace must preserve the past-due subscription scenario');
  const moduleUnavailableWorkspace = await workspace.getByOrganisationSlug(materialised.organisation.slug, 'module-unavailable');
  expect(moduleUnavailableWorkspace?.entitlements.every((entitlement) => !entitlement.enabled), 'the completed tenant workspace must preserve the module-unavailable entitlement scenario');

  await coordinator.reset();
  const canonicalAfterReset = modules.cogsManagementStore.organisationCogsState(canonicalCogsStore.read(), materialised.organisation.id);
  expect(Object.values(canonicalAfterReset.recordsByProduct).flat().every((record) => record.sourceReferenceId !== preview.id && !record.sourceReferenceId?.startsWith('onboarding:')), 'development reset must remove only canonical records published by onboarding');
  expect(canonicalAfterReset.auditEvents.every((event) => event.newValue?.sourceReferenceId !== preview.id), 'development reset must remove orphaned onboarding COGS audit events');
  expect(await sessions.getActiveSession() === null, 'development reset must clear the active onboarding session');
  expect(await workspace.getByOrganisationSlug(materialised.organisation.slug, 'healthy') === null, 'development reset must remove the dynamic onboarding tenant');
  expect(Boolean(await workspace.getByOrganisationSlug('stock-supplies', 'healthy')), 'development reset must preserve immutable Phase 1 fixtures');
  expect(!memory.has(modules.store.ONBOARDING_STORAGE_KEY), 'development reset must remove the versioned persisted state');
}

const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;
globalThis.setTimeout = (handler, _timeout, ...args) => {
  queueMicrotask(() => handler(...args));
  return 0;
};
globalThis.clearTimeout = () => undefined;
try {
  await validateServiceJourney();
} catch (error) {
  failures.push(`could not execute onboarding service journey: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
} finally {
  globalThis.setTimeout = realSetTimeout;
  globalThis.clearTimeout = realClearTimeout;
}

if (failures.length) {
  console.error(`Onboarding validation failed:\n${failures.map((item) => `- ${item}`).join('\n')}`);
  process.exit(1);
}

console.log('Onboarding validation passed: real auth/onboarding routes · canonical persisted session · focused repositories · safe payment materialisation · company and marketplace ownership · provider rejection recovery · structured dataset failure and persisted retry · explicit effective-dated COGS approval · scoped invite acceptance · completion, reset, and dynamic tenant resolution.');
