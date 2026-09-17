'use client';

import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  BadgePoundSterling,
  Building2,
  Check,
  LockKeyhole,
  Pencil,
  Plus,
  ShieldCheck,
  Store,
  Trash2,
} from 'lucide-react';
import { useOnboarding } from '@/src/components/providers/onboarding-provider';
import { Button } from '@/src/components/ui/actions';
import { Alert, Badge, Skeleton, useToast } from '@/src/components/ui/feedback';
import { Field, Input, Select, Textarea } from '@/src/components/ui/forms';
import { ConfirmationDialog } from '@/src/components/ui/overlays';
import type { OnboardingCompany, OnboardingSnapshot, OnboardingStep, TestPaymentMethodToken } from '@/src/domain/onboarding';

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

const STEP_PATHS: Record<OnboardingStep, string> = {
  account: '/auth/register',
  subscription: '/onboarding/subscription',
  payment: '/onboarding/payment',
  organisation: '/onboarding/organisation',
  companies: '/onboarding/companies',
  marketplaces: '/onboarding/marketplaces',
  sync: '/onboarding/sync',
  cogs: '/onboarding/cogs',
  users: '/onboarding/users',
  complete: '/onboarding/complete',
};

const STEP_NAMES: Record<OnboardingStep, string> = {
  account: 'account creation',
  subscription: 'subscription selection',
  payment: 'test payment',
  organisation: 'organisation setup',
  companies: 'company setup',
  marketplaces: 'marketplace setup',
  sync: 'initial sync',
  cogs: 'COGS readiness',
  users: 'user invitations',
  complete: 'setup completion',
};

function messageFor(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function StepHeading({ eyebrow, title, description, status }: { eyebrow: string; title: string; description: string; status?: ReactNode }) {
  return (
    <header className="onboarding-step-heading">
      <div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>
      {status ? <div className="onboarding-step-heading-status">{status}</div> : null}
    </header>
  );
}

export function StepSection({ title, description, actions, className = '', children }: { title?: string; description?: string; actions?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={`onboarding-step-section ${className}`.trim()}>
      {title || description || actions ? <header><div>{title ? <h2>{title}</h2> : null}{description ? <p>{description}</p> : null}</div>{actions}</header> : null}
      <div className="onboarding-step-section-body">{children}</div>
    </section>
  );
}

interface StepFooterProps {
  backHref?: string;
  backLabel?: string;
  nextHref?: string;
  nextLabel?: string;
  submit?: boolean;
  onNext?: () => void;
  loading?: boolean;
  disabled?: boolean;
  note?: ReactNode;
  secondaryAction?: ReactNode;
}

export function StepFooter({ backHref, backLabel = 'Back', nextHref, nextLabel = 'Continue', submit = false, onNext, loading = false, disabled = false, note, secondaryAction }: StepFooterProps) {
  const next = nextHref && !disabled
    ? <Link className="primary-button onboarding-step-link-button" href={nextHref}>{nextLabel}<ArrowRight size={15} aria-hidden="true" /></Link>
    : <Button type={submit ? 'submit' : 'button'} variant="primary" loading={loading} disabled={disabled} onClick={onNext}>{nextLabel}<ArrowRight size={15} aria-hidden="true" /></Button>;
  return (
    <footer className="onboarding-step-footer">
      <div className="onboarding-step-footer-note">{note}</div>
      <div className="onboarding-step-footer-actions">
        {backHref ? <Link className="secondary-button onboarding-step-link-button" href={backHref}>{backLabel}</Link> : null}
        {secondaryAction}
        {next}
      </div>
    </footer>
  );
}

export function SetupGuard({ requires = [], children }: { requires?: OnboardingStep[]; children: ReactNode }) {
  const { snapshot, loading, error, resume } = useOnboarding();
  if (loading && !snapshot) {
    return <div className="onboarding-step-loading" role="status" aria-label="Loading saved setup"><Skeleton className="onboarding-step-skeleton-heading" /><Skeleton className="onboarding-step-skeleton-copy" /><Skeleton className="onboarding-step-skeleton-panel" /></div>;
  }
  if (!snapshot) {
    return (
      <div className="onboarding-step-page">
        <StepHeading eyebrow="Setup required" title="Create or resume your owner account" description="Onboarding progress is linked to the registered organisation owner." />
        <Alert tone={error ? 'negative' : 'warning'} title={error ? 'Saved setup could not be loaded' : 'No onboarding session found'}>{error ?? 'Create an owner account before selecting the Test Plan.'}</Alert>
        <div className="onboarding-guard-actions"><Link className="primary-button onboarding-step-link-button" href="/auth/register">Create account</Link>{error ? <Button onClick={() => { void resume(); }}>Try again</Button> : null}</div>
      </div>
    );
  }
  const missing = requires.find((step) => !snapshot.session.completedSteps.includes(step) && !snapshot.session.skippedSteps.includes(step));
  if (missing) {
    return (
      <div className="onboarding-step-page">
        <StepHeading eyebrow="Previous step required" title={`Complete ${STEP_NAMES[missing]} first`} description="Setup dependencies stay explicit so billing, tenant, and company data cannot become inconsistent." />
        <Alert tone="warning" title="This step is not ready">Return to the required step, complete it, then continue.</Alert>
        <div className="onboarding-guard-actions"><Link className="primary-button onboarding-step-link-button" href={STEP_PATHS[missing]}>Open {STEP_NAMES[missing]}</Link></div>
      </div>
    );
  }
  return <>{children}</>;
}

const PLAN_CAPABILITIES = [
  'Amazon seller accounts',
  'eBay seller accounts',
  'Temu seller accounts',
  'Profitability analytics',
  'Products and transactions',
  'COGS management',
  'Expenses and reports',
  'Sync Health',
  'Copilot prototype',
];

function SubscriptionContent({ snapshot }: { snapshot: OnboardingSnapshot }) {
  const router = useRouter();
  const { selectPlan, pendingAction } = useOnboarding();
  const { showToast } = useToast();
  const [actionError, setActionError] = useState<string | null>(null);
  const billing = snapshot.session.pendingBilling;
  const accepted = billing?.paymentStatus === 'accepted';
  const selected = Boolean(billing);
  const selecting = pendingAction === 'subscription';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError(null);
    try {
      await selectPlan();
      showToast('Test Plan selected');
      router.push('/onboarding/payment');
    } catch (selectionError) {
      setActionError(messageFor(selectionError, 'The Test Plan could not be selected. Try again.'));
    }
  }

  return (
    <form className="onboarding-step-page" onSubmit={submit} noValidate>
      <StepHeading eyebrow="Subscription" title="Choose the prototype Test Plan" description="This step validates the subscription and Module 01 entitlement architecture. It does not define final commercial pricing." status={<Badge tone={accepted ? 'positive' : selected ? 'info' : 'neutral'}>{accepted ? 'Active' : selected ? 'Selected' : 'Not selected'}</Badge>} />
      {actionError ? <Alert tone="negative" title="Subscription could not be updated">{actionError}</Alert> : null}
      {accepted ? <Alert tone="positive" title="Test subscription active">Payment has been accepted. Reviewing this plan will not invalidate the active subscription.</Alert> : null}
      <StepSection className={`onboarding-plan${selected ? ' selected' : ''}`}>
        <div className="onboarding-plan-header">
          <div className="onboarding-plan-icon"><BadgePoundSterling size={20} aria-hidden="true" /></div>
          <div><span className="onboarding-plan-kicker">Prototype access</span><h2>Test Plan</h2><p>Marketplace Profitability &amp; Analytics</p></div>
          <Badge tone="info">Test only</Badge>
        </div>
        <div className="onboarding-plan-summary"><span><strong>Module 01 Access</strong><small>Marketplace Profitability &amp; Analytics</small></span><span><strong>Stripe test mode</strong><small>No production charge</small></span></div>
        <ul className="onboarding-capability-list">{PLAN_CAPABILITIES.map((capability) => <li key={capability}><Check size={14} aria-hidden="true" />{capability}</li>)}</ul>
        <p className="onboarding-plan-disclaimer">Prototype pricing only. Final commercial tiers and production billing are outside this phase.</p>
      </StepSection>
      <StepFooter backHref="/auth/register" backLabel="Back to account" nextHref={selected ? accepted ? '/onboarding/organisation' : '/onboarding/payment' : undefined} nextLabel={accepted ? 'Continue setup' : selected ? 'Continue to payment' : 'Select Test Plan'} submit={!selected} loading={selecting} note={selected ? 'Your plan selection is saved.' : 'Payment details are added separately in Stripe test mode.'} />
    </form>
  );
}

export function SubscriptionStep() {
  const { snapshot } = useOnboarding();
  return <SetupGuard requires={['account']}>{snapshot ? <SubscriptionContent snapshot={snapshot} /> : null}</SetupGuard>;
}

const PAYMENT_OPTIONS: Array<{ token: TestPaymentMethodToken; title: string; detail: string }> = [
  { token: 'pm_test_success', title: 'Simulate successful payment', detail: 'Payment method accepted and Module 01 access approved.' },
  { token: 'pm_test_declined', title: 'Simulate card declined', detail: 'Shows a realistic inline decline and retry state.' },
  { token: 'pm_test_failure', title: 'Simulate processing failure', detail: 'Shows a provider processing error without storing card data.' },
];

function PaymentContent({ snapshot }: { snapshot: OnboardingSnapshot }) {
  const router = useRouter();
  const { confirmPayment, pendingAction } = useOnboarding();
  const { showToast } = useToast();
  const billing = snapshot.session.pendingBilling;
  const [billingEmail, setBillingEmail] = useState(billing?.billingEmail ?? snapshot.account.email);
  const [billingCountryCode, setBillingCountryCode] = useState(billing?.billingCountryCode ?? 'GB');
  const [paymentMethodToken, setPaymentMethodToken] = useState<TestPaymentMethodToken>('pm_test_success');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const processing = pendingAction === 'payment';
  const accepted = billing?.paymentStatus === 'accepted';
  const retrying = billing?.paymentStatus === 'declined' || billing?.paymentStatus === 'failed';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldError(null);
    setActionError(null);
    if (!EMAIL_PATTERN.test(billingEmail.trim())) {
      setFieldError('Enter a valid billing email address.');
      return;
    }
    try {
      await confirmPayment({ paymentMethodToken, billingEmail: billingEmail.trim(), billingCountryCode });
      showToast('Payment method accepted');
      router.push('/onboarding/organisation');
    } catch (paymentError) {
      setActionError(messageFor(paymentError, 'The test payment could not be processed. Try again.'));
    }
  }

  if (!billing) {
    return <div className="onboarding-step-page"><StepHeading eyebrow="Payment" title="Select the Test Plan first" description="A test billing session is created from your plan selection." /><Alert tone="warning" title="Plan selection required">Return to Subscription and select the Test Plan.</Alert><StepFooter backHref="/onboarding/subscription" backLabel="Back to subscription" nextHref="/onboarding/subscription" nextLabel="Select Test Plan" /></div>;
  }

  return (
    <form className="onboarding-step-page" onSubmit={submit} noValidate>
      <StepHeading eyebrow="Stripe sandbox" title="Confirm your test subscription" description="A production-style payment review using labelled provider simulations. Raw card numbers are never collected or persisted." status={<Badge tone={accepted ? 'positive' : processing ? 'info' : retrying ? 'negative' : 'warning'}>{accepted ? 'Accepted' : processing ? 'Processing' : retrying ? 'Retry required' : 'Test mode'}</Badge>} />
      {processing ? <Alert tone="info" title="Processing test payment">The simulated provider is checking the payment method. Keep this page open for a moment.</Alert> : null}
      {actionError ? <Alert tone="negative" title={billing.paymentStatus === 'declined' ? 'Test card declined' : 'Payment processing failed'}>{actionError}</Alert> : null}
      {accepted ? <Alert tone="positive" title="Payment method accepted">Test subscription active. Marketplace Profitability &amp; Analytics entitlement is enabled for organisation setup.</Alert> : null}
      <div className="onboarding-payment-layout">
        <StepSection title="Subscription summary" description="Prototype billing details" className="onboarding-payment-summary">
          <dl><div><dt>Plan</dt><dd>Test Plan</dd></div><div><dt>Module</dt><dd>Marketplace Profitability &amp; Analytics</dd></div><div><dt>Provider</dt><dd><LockKeyhole size={13} aria-hidden="true" />Stripe test mode</dd></div><div><dt>Charge</dt><dd>No production charge</dd></div></dl>
        </StepSection>
        <StepSection title="Billing contact" description="Used only by the simulated test provider">
          <div className="onboarding-field-grid two-column">
            <Field label="Billing email" error={fieldError ?? undefined}><Input type="email" autoComplete="email" value={billingEmail} disabled={accepted || processing} onChange={(event) => { setBillingEmail(event.target.value); setFieldError(null); }} /></Field>
            <Field label="Billing country"><Select value={billingCountryCode} disabled={accepted || processing} onChange={(event) => setBillingCountryCode(event.target.value)}><option value="GB">United Kingdom</option><option value="IE">Ireland</option><option value="US">United States</option></Select></Field>
          </div>
        </StepSection>
      </div>
      {!accepted ? <StepSection title="Simulated payment outcome" description="Choose an explicit sandbox outcome. Only the provider token is sent to the mock repository.">
        <fieldset className="onboarding-payment-options" disabled={processing}><legend className="sr-only">Test payment outcome</legend>{PAYMENT_OPTIONS.map((option) => <label className={paymentMethodToken === option.token ? 'selected' : ''} key={option.token}><input type="radio" name="payment-outcome" value={option.token} checked={paymentMethodToken === option.token} onChange={() => setPaymentMethodToken(option.token)} /><span><strong>{option.title}</strong><small>{option.detail}</small></span></label>)}</fieldset>
        <div className="onboarding-secure-note"><ShieldCheck size={16} aria-hidden="true" /><span><strong>Secure test-provider simulation</strong><small>No raw card number, expiry date, or security code is stored in application fixtures.</small></span></div>
      </StepSection> : null}
      <StepFooter backHref="/onboarding/subscription" backLabel="Back to subscription" nextHref={accepted ? '/onboarding/organisation' : undefined} nextLabel={accepted ? 'Continue to organisation' : retrying ? 'Retry test payment' : 'Confirm test subscription'} submit={!accepted} loading={processing} note="Stripe sandbox · Test subscription · Module 01 Access" />
    </form>
  );
}

export function PaymentStep() {
  const { snapshot } = useOnboarding();
  return <SetupGuard requires={['account', 'subscription']}>{snapshot ? <PaymentContent snapshot={snapshot} /> : null}</SetupGuard>;
}

interface OrganisationFormState {
  name: string;
  countryCode: string;
  reportingCurrency: string;
  timeZone: string;
  businessAddress: string;
  financeEmail: string;
}

function OrganisationContent({ snapshot }: { snapshot: OnboardingSnapshot }) {
  const router = useRouter();
  const { saveOrganisation, pendingAction } = useOnboarding();
  const { showToast } = useToast();
  const existing = snapshot.organisation;
  const [form, setForm] = useState<OrganisationFormState>({
    name: existing?.name ?? '',
    countryCode: existing?.countryCode ?? 'GB',
    reportingCurrency: existing?.reportingCurrency ?? 'GBP',
    timeZone: existing?.timeZone ?? 'Europe/London',
    businessAddress: existing?.businessAddress ?? '',
    financeEmail: existing?.financeEmail ?? snapshot.account.email,
  });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof OrganisationFormState, string>>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const saving = pendingAction === 'organisation';

  function update<K extends keyof OrganisationFormState>(key: K, value: OrganisationFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors: Partial<Record<keyof OrganisationFormState, string>> = {};
    if (form.name.trim().length < 2) errors.name = 'Enter an organisation name.';
    if (!form.countryCode) errors.countryCode = 'Choose a country.';
    if (!form.timeZone) errors.timeZone = 'Choose a financial time zone.';
    if (form.financeEmail.trim() && !EMAIL_PATTERN.test(form.financeEmail.trim())) errors.financeEmail = 'Enter a valid finance contact email.';
    setFieldErrors(errors);
    setActionError(null);
    if (Object.keys(errors).length) return;
    try {
      await saveOrganisation({ ...form, name: form.name.trim(), businessAddress: form.businessAddress.trim(), financeEmail: form.financeEmail.trim() });
      showToast(existing ? 'Organisation updated' : 'Organisation created');
      router.push('/onboarding/companies');
    } catch (saveError) {
      setActionError(messageFor(saveError, 'The organisation could not be saved. Try again.'));
    }
  }

  return (
    <form className="onboarding-step-page" onSubmit={submit} noValidate>
      <StepHeading eyebrow="Organisation" title={existing ? 'Review your organisation' : 'Create your organisation'} description="The organisation is the top-level tenant. It owns the subscription and can contain multiple legal or trading companies." status={<Badge tone={existing ? 'positive' : 'info'}>{existing ? 'Saved' : 'Owner setup'}</Badge>} />
      {actionError ? <Alert tone="negative" title="Organisation could not be saved">{actionError}</Alert> : null}
      <div className="onboarding-hierarchy" aria-label="Organisation hierarchy"><span className="current"><Building2 size={16} aria-hidden="true" />Organisation</span><i aria-hidden="true">→</i><span>Companies</span><i aria-hidden="true">→</i><span><Store size={16} aria-hidden="true" />Marketplace accounts</span></div>
      <StepSection title="Organisation details" description="Reporting defaults apply across the tenant unless a later company setting is more specific.">
        <div className="onboarding-field-grid two-column">
          <Field label="Organisation name" error={fieldErrors.name}><Input value={form.name} autoComplete="organization" placeholder="Stock Supplies Group" onChange={(event) => update('name', event.target.value)} /></Field>
          <Field label="Country" error={fieldErrors.countryCode}><Select value={form.countryCode} onChange={(event) => update('countryCode', event.target.value)}><option value="GB">United Kingdom</option><option value="IE">Ireland</option></Select></Field>
          <Field label="Base / reporting currency" hint="Phase 2 currently supports GBP."><Select value={form.reportingCurrency} disabled aria-label="Base reporting currency"><option value="GBP">GBP — Pound sterling</option></Select></Field>
          <Field label="Financial time zone" error={fieldErrors.timeZone}><Select value={form.timeZone} onChange={(event) => update('timeZone', event.target.value)}><option value="Europe/London">Europe/London</option><option value="Europe/Dublin">Europe/Dublin</option><option value="UTC">UTC</option></Select></Field>
        </div>
      </StepSection>
      <StepSection title="Optional contact details" description="These details support billing and finance communication in the prototype.">
        <div className="onboarding-field-grid two-column">
          <Field label="Business address" hint="Optional"><Textarea rows={4} value={form.businessAddress} placeholder="Trading address" onChange={(event) => update('businessAddress', event.target.value)} /></Field>
          <Field label="Finance / contact email" hint={fieldErrors.financeEmail ? undefined : 'Optional · use failure@organisation.test to simulate a save failure'} error={fieldErrors.financeEmail}><Input type="email" autoComplete="email" value={form.financeEmail} placeholder="finance@company.com" onChange={(event) => update('financeEmail', event.target.value)} /></Field>
        </div>
      </StepSection>
      <div className="onboarding-owner-summary"><span className="onboarding-owner-icon"><ShieldCheck size={17} aria-hidden="true" /></span><span><small>Primary Organisation Admin</small><strong>{snapshot.account.firstName} {snapshot.account.lastName}</strong><em>{snapshot.account.email}</em></span><Badge tone="positive">Full tenant access</Badge></div>
      <StepFooter backHref="/onboarding/payment" backLabel="Back to payment" nextLabel={existing ? 'Save changes and continue' : 'Create organisation'} submit loading={saving} note={existing ? 'Saved organisation details can be safely reviewed and updated.' : 'Your registered owner becomes the first Organisation Admin.'} />
    </form>
  );
}

export function OrganisationStep() {
  const { snapshot } = useOnboarding();
  return <SetupGuard requires={['account', 'subscription', 'payment']}>{snapshot ? <OrganisationContent snapshot={snapshot} /> : null}</SetupGuard>;
}

interface CompanyFormState {
  legalName: string;
  tradingName: string;
  countryCode: string;
  reportingCurrency: string;
}

function CompaniesContent({ snapshot }: { snapshot: OnboardingSnapshot }) {
  const router = useRouter();
  const { saveCompany, removeCompany, completeStep, pendingAction } = useOnboarding();
  const { showToast } = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const defaultForm = (): CompanyFormState => ({ legalName: '', tradingName: '', countryCode: snapshot.organisation?.countryCode ?? 'GB', reportingCurrency: snapshot.organisation?.reportingCurrency ?? 'GBP' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CompanyFormState>(defaultForm);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof CompanyFormState, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [continueError, setContinueError] = useState<string | null>(null);
  const saving = pendingAction === 'company';
  const removing = pendingAction === 'company-remove';
  const continuing = pendingAction === 'step-companies';
  const companyCount = snapshot.companies.length;

  function update<K extends keyof CompanyFormState>(key: K, value: CompanyFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
  }

  function resetEditor() {
    setEditingId(null);
    setForm(defaultForm());
    setFieldErrors({});
    setFormError(null);
  }

  function editCompany(company: OnboardingCompany) {
    setEditingId(company.id);
    setForm({ legalName: company.legalName, tradingName: company.tradingName ?? '', countryCode: company.countryCode, reportingCurrency: company.reportingCurrency });
    setFieldErrors({});
    setFormError(null);
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLInputElement>('input')?.focus());
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors: Partial<Record<keyof CompanyFormState, string>> = {};
    if (form.legalName.trim().length < 2) errors.legalName = 'Enter the company legal name.';
    if (!form.countryCode) errors.countryCode = 'Choose a company country.';
    if (!form.reportingCurrency) errors.reportingCurrency = 'Choose a reporting currency.';
    setFieldErrors(errors);
    setFormError(null);
    if (Object.keys(errors).length) return;
    try {
      await saveCompany({ companyId: editingId ?? undefined, legalName: form.legalName.trim(), tradingName: form.tradingName.trim(), countryCode: form.countryCode, reportingCurrency: form.reportingCurrency });
      showToast(editingId ? 'Company updated' : 'Company created');
      resetEditor();
      setContinueError(null);
    } catch (companyError) {
      setFormError(messageFor(companyError, 'The company could not be saved. Try again.'));
    }
  }

  async function remove(company: OnboardingCompany) {
    setFormError(null);
    try {
      await removeCompany(company.id);
      if (editingId === company.id) resetEditor();
      showToast('Company removed', 'warning');
    } catch (removeError) {
      setFormError(messageFor(removeError, 'The company could not be removed.'));
    }
  }

  async function continueSetup() {
    setContinueError(null);
    if (!snapshot.companies.length) {
      setContinueError('Create at least one company before continuing to marketplace setup.');
      formRef.current?.querySelector<HTMLInputElement>('input')?.focus();
      return;
    }
    try {
      await completeStep('companies');
      router.push('/onboarding/marketplaces');
    } catch (stepError) {
      setContinueError(messageFor(stepError, 'Company setup could not be completed.'));
    }
  }

  return (
    <div className="onboarding-step-page">
      <StepHeading eyebrow="Companies" title="Add the companies in your organisation" description="Companies are the legal or trading entities that own marketplace accounts. Add one now; additional companies can be created before continuing." status={<Badge tone={companyCount ? 'positive' : 'warning'}>{companyCount} {companyCount === 1 ? 'company' : 'companies'}</Badge>} />
      {formError ? <Alert tone="negative" title="Company action failed">{formError}</Alert> : null}
      <div className="onboarding-hierarchy" aria-label="Company hierarchy"><span><Building2 size={16} aria-hidden="true" />{snapshot.organisation?.name}</span><i aria-hidden="true">→</i><span className="current">Companies</span><i aria-hidden="true">→</i><span><Store size={16} aria-hidden="true" />Marketplace accounts</span></div>
      <StepSection title="Companies created" description={`${snapshot.organisation?.name ?? 'This organisation'} owns ${companyCount} ${companyCount === 1 ? 'company' : 'companies'} in the current setup.`} actions={<Badge tone={companyCount ? 'positive' : 'neutral'}>{companyCount ? `${companyCount} created` : 'None yet'}</Badge>}>
        {companyCount ? <ul className="onboarding-company-list" aria-live="polite">{snapshot.companies.map((company) => {
          const dependentAccounts = snapshot.marketplaceAccounts.filter((account) => account.companyId === company.id);
          return <li key={company.id}><span className="onboarding-company-monogram" aria-hidden="true">{company.name.split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase()}</span><span className="onboarding-company-copy"><strong>{company.name}</strong><small>{company.legalName}{company.tradingName ? ` · Trading as ${company.tradingName}` : ''}</small><em>{company.countryCode} · {company.reportingCurrency} · Owned by {snapshot.organisation?.name}</em>{dependentAccounts.length ? <b>{dependentAccounts.length} connected marketplace {dependentAccounts.length === 1 ? 'account' : 'accounts'} must be disconnected before removal.</b> : null}</span><span className="onboarding-company-actions"><Button size="compact" variant="ghost" disabled={saving || removing} aria-label={`Edit ${company.name}`} onClick={() => editCompany(company)}><Pencil size={14} aria-hidden="true" /> Edit</Button>{dependentAccounts.length ? <Button size="compact" variant="danger" disabled title="Disconnect marketplace accounts before removing this company"><Trash2 size={14} aria-hidden="true" /> Remove</Button> : <ConfirmationDialog trigger={<Button size="compact" variant="danger" disabled={saving || removing} aria-label={`Remove ${company.name}`}><Trash2 size={14} aria-hidden="true" /> Remove</Button>} title={`Remove ${company.name}?`} description="This company has no dependent marketplace accounts. Removing it will exclude it from the current onboarding setup." confirmLabel="Remove company" confirmLoading={removing} onConfirm={() => { void remove(company); }} />}</span></li>;
        })}</ul> : <div className="onboarding-company-empty"><Building2 size={21} aria-hidden="true" /><strong>No companies created yet</strong><p>Create the first company below. Sample company names are suggestions only and are not added automatically.</p></div>}
      </StepSection>
      <form className="onboarding-company-editor" ref={formRef} onSubmit={save} noValidate>
        <StepSection title={editingId ? 'Edit company' : 'Create a company'} description={editingId ? 'Update this company before continuing.' : 'Start with the legal entity that owns your first marketplace account.'} actions={editingId ? <Badge tone="info">Editing</Badge> : <Badge>Add another anytime</Badge>}>
          <div className="onboarding-field-grid two-column">
            <Field label="Legal name" error={fieldErrors.legalName}><Input value={form.legalName} autoComplete="organization" placeholder="Stock Supplies Ltd" onChange={(event) => update('legalName', event.target.value)} /></Field>
            <Field label="Trading name" hint="Optional"><Input value={form.tradingName} placeholder="Stock Supplies" onChange={(event) => update('tradingName', event.target.value)} /></Field>
            <Field label="Company country" error={fieldErrors.countryCode}><Select value={form.countryCode} onChange={(event) => update('countryCode', event.target.value)}><option value="GB">United Kingdom</option><option value="IE">Ireland</option></Select></Field>
            <Field label="Reporting currency" error={fieldErrors.reportingCurrency}><Select value={form.reportingCurrency} onChange={(event) => update('reportingCurrency', event.target.value)}><option value="GBP">GBP — Pound sterling</option></Select></Field>
          </div>
          <div className="onboarding-company-editor-actions">{editingId ? <Button type="button" onClick={resetEditor}>Cancel edit</Button> : null}<Button type="submit" variant="primary" loading={saving}><Plus size={14} aria-hidden="true" />{editingId ? 'Save company changes' : 'Add company'}</Button></div>
        </StepSection>
      </form>
      {continueError ? <Alert tone="negative" title="Company setup is incomplete">{continueError}</Alert> : null}
      <StepFooter backHref="/onboarding/organisation" backLabel="Back to organisation" nextLabel="Continue to marketplaces" onNext={() => { void continueSetup(); }} loading={continuing} disabled={saving || removing} note={companyCount ? `${companyCount} ${companyCount === 1 ? 'company is' : 'companies are'} ready for marketplace ownership.` : 'At least one company is required before marketplace setup.'} />
    </div>
  );
}

export function CompaniesStep() {
  const { snapshot } = useOnboarding();
  return <SetupGuard requires={['account', 'subscription', 'payment', 'organisation']}>{snapshot ? <CompaniesContent snapshot={snapshot} /> : null}</SetupGuard>;
}
