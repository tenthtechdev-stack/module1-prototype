'use client';

import Link from 'next/link';
import { useId, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  KeyRound,
  LockKeyhole,
  Mail,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { Button } from '@/src/components/ui/actions';
import { Checkbox, Field, Input, Radio } from '@/src/components/ui/forms';
import { Alert, Badge } from '@/src/components/ui/feedback';

export interface AuthActionSuccess {
  ok: true;
  message?: string;
}

export interface AuthActionFailure<FieldName extends string> {
  ok: false;
  message: string;
  fieldErrors?: Partial<Record<FieldName, string>>;
}

export type AuthActionResult<FieldName extends string> =
  | AuthActionSuccess
  | AuthActionFailure<FieldName>;

export interface RegistrationInput {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  acceptedTerms: true;
}

export type RegistrationField =
  | 'firstName'
  | 'lastName'
  | 'email'
  | 'password'
  | 'confirmPassword'
  | 'terms';

export interface RegistrationFormProps {
  onRegister: (
    input: RegistrationInput,
  ) => Promise<AuthActionResult<RegistrationField> | void>;
  initialEmail?: string;
  signInHref?: string;
}

export interface SignInInput {
  email: string;
  password: string;
}

export type SignInField = 'email' | 'password';

export interface SignInFormProps {
  onSignIn: (
    input: SignInInput,
  ) => Promise<AuthActionResult<SignInField> | void>;
  initialEmail?: string;
  forgotPasswordHref?: string;
  registerHref?: string;
}

export interface ForgotPasswordInput {
  email: string;
}

export type ForgotPasswordField = 'email';

export interface ForgotPasswordFormProps {
  onRequestReset: (
    input: ForgotPasswordInput,
  ) => Promise<AuthActionResult<ForgotPasswordField> | void>;
  initialEmail?: string;
  signInHref?: string;
}

export type InvitationStatus = 'pending' | 'invalid' | 'expired' | 'accepted';
export type InvitationAssignment = 'all' | readonly string[];
export type MfaPreference = 'authenticator' | 'later';

export interface InvitationSummary {
  id: string;
  inviteeName: string;
  email: string;
  organisationName: string;
  roleName: string;
  companyAssignments: InvitationAssignment;
  marketplaceAccountAssignments: InvitationAssignment;
  status: InvitationStatus;
  expiresAt?: string;
}

export interface InviteAcceptanceInput {
  invitationId: string;
  password: string;
  mfaPreference: MfaPreference;
}

export type InviteAcceptanceField =
  | 'password'
  | 'confirmPassword'
  | 'mfaPreference';

export interface InviteAcceptanceFormProps {
  invitation: InvitationSummary;
  onJoin: (
    input: InviteAcceptanceInput,
  ) => Promise<AuthActionResult<InviteAcceptanceField> | void>;
  signInHref?: string;
  workspaceHref?: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isFailure<FieldName extends string>(
  result: AuthActionResult<FieldName> | void,
): result is AuthActionFailure<FieldName> {
  return Boolean(result && !result.ok);
}

function actionError(error: unknown) {
  return error instanceof Error && error.message
    ? error.message
    : 'Something went wrong. Please try again.';
}

function successfulMessage<FieldName extends string>(
  result: AuthActionResult<FieldName> | void,
  fallback: string,
) {
  return result && result.ok ? result.message ?? fallback : fallback;
}

function validPassword(password: string) {
  return password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password);
}

function PasswordGuidance({ password, id }: { password: string; id: string }) {
  const checks = [
    { label: 'At least 8 characters', met: password.length >= 8 },
    { label: 'At least one letter', met: /[A-Za-z]/.test(password) },
    { label: 'At least one number', met: /\d/.test(password) },
  ];

  return (
    <div className="auth-password-guidance" id={id} aria-live="polite">
      <span>Password guidance</span>
      <ul>
        {checks.map((check) => (
          <li className={check.met ? 'met' : ''} key={check.label}>
            <Check size={12} aria-hidden="true" />
            <span className="sr-only">{check.met ? 'Requirement met: ' : 'Requirement not met: '}</span>
            {check.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

function FormFeedback({ error, success }: { error: string; success: string }) {
  return (
    <>
      {error ? <Alert tone="negative" title="We could not continue">{error}</Alert> : null}
      {success ? <Alert tone="positive" title="Success">{success}</Alert> : null}
    </>
  );
}

export function RegistrationForm({
  onRegister,
  initialEmail = '',
  signInHref = '/auth/sign-in',
}: RegistrationFormProps) {
  const passwordGuidanceId = useId();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [terms, setTerms] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<RegistrationField, string>>>({});
  const [submitError, setSubmitError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: Partial<Record<RegistrationField, string>> = {};
    const normalisedEmail = email.trim().toLowerCase();

    if (!firstName.trim()) nextErrors.firstName = 'Enter your first name.';
    if (!lastName.trim()) nextErrors.lastName = 'Enter your last name.';
    if (!EMAIL_PATTERN.test(normalisedEmail)) nextErrors.email = 'Enter a valid work email.';
    if (!password) nextErrors.password = 'Enter a password.';
    else if (!validPassword(password)) nextErrors.password = 'Meet all password requirements.';
    if (!confirmPassword) nextErrors.confirmPassword = 'Confirm your password.';
    else if (password !== confirmPassword) nextErrors.confirmPassword = 'Passwords do not match.';
    if (!terms) nextErrors.terms = 'Accept the terms to create your account.';

    setErrors(nextErrors);
    setSubmitError('');
    setSuccess('');
    if (Object.keys(nextErrors).length) return;

    setSubmitting(true);
    try {
      const result = await onRegister({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: normalisedEmail,
        password,
        acceptedTerms: true,
      });
      if (isFailure(result)) {
        setErrors(result.fieldErrors ?? {});
        setSubmitError(result.message);
        return;
      }
      setSuccess(successfulMessage(result, 'Account created. Continue to subscription setup.'));
    } catch (error) {
      setSubmitError(actionError(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="auth-card auth-experience-card registration-form" onSubmit={submit} noValidate aria-busy={submitting}>
      <span className="auth-icon"><UserRound size={20} /></span>
      <p className="eyebrow">Start your workspace</p>
      <h2>Create your account</h2>
      <p>The first account becomes the Organisation Admin. Business details come next.</p>

      <div className="auth-form-grid auth-form-grid-two">
        <Field label="First name" error={errors.firstName}>
          <Input
            autoComplete="given-name"
            value={firstName}
            disabled={submitting}
            aria-invalid={Boolean(errors.firstName)}
            onChange={(event) => {
              setFirstName(event.target.value);
              setErrors((current) => ({ ...current, firstName: undefined }));
            }}
          />
        </Field>
        <Field label="Last name" error={errors.lastName}>
          <Input
            autoComplete="family-name"
            value={lastName}
            disabled={submitting}
            aria-invalid={Boolean(errors.lastName)}
            onChange={(event) => {
              setLastName(event.target.value);
              setErrors((current) => ({ ...current, lastName: undefined }));
            }}
          />
        </Field>
      </div>

      <Field label="Work email" hint={errors.email ? undefined : 'Prototype failure: failure@registration.test'} error={errors.email}>
        <Input
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@company.com"
          value={email}
          disabled={submitting}
          aria-invalid={Boolean(errors.email)}
          onChange={(event) => {
            setEmail(event.target.value);
            setErrors((current) => ({ ...current, email: undefined }));
          }}
        />
      </Field>

      <Field label="Password" error={errors.password}>
        <Input
          type="password"
          autoComplete="new-password"
          value={password}
          disabled={submitting}
          aria-invalid={Boolean(errors.password)}
          aria-describedby={passwordGuidanceId}
          onChange={(event) => {
            setPassword(event.target.value);
            setErrors((current) => ({ ...current, password: undefined }));
          }}
        />
      </Field>
      <PasswordGuidance password={password} id={passwordGuidanceId} />

      <Field label="Confirm password" error={errors.confirmPassword}>
        <Input
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          disabled={submitting}
          aria-invalid={Boolean(errors.confirmPassword)}
          onChange={(event) => {
            setConfirmPassword(event.target.value);
            setErrors((current) => ({ ...current, confirmPassword: undefined }));
          }}
        />
      </Field>

      <div className={`auth-terms${errors.terms ? ' invalid' : ''}`}>
        <Checkbox
          label="I agree to the prototype terms and privacy notice"
          checked={terms}
          disabled={submitting}
          aria-invalid={Boolean(errors.terms)}
          onChange={(event) => {
            setTerms(event.target.checked);
            setErrors((current) => ({ ...current, terms: undefined }));
          }}
        />
        {errors.terms ? <small role="alert">{errors.terms}</small> : null}
      </div>

      <FormFeedback error={submitError} success={success} />
      <Button className="auth-submit" variant="primary" size="large" type="submit" loading={submitting}>
        {submitting ? 'Creating account' : 'Create account'} <ArrowRight size={15} />
      </Button>
      <footer>Already have an account? <Link href={signInHref}>Sign in</Link></footer>
    </form>
  );
}

export function SignInForm({
  onSignIn,
  initialEmail = '',
  forgotPasswordHref = '/auth/forgot-password',
  registerHref = '/auth/register',
}: SignInFormProps) {
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Partial<Record<SignInField, string>>>({});
  const [submitError, setSubmitError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalisedEmail = email.trim().toLowerCase();
    const nextErrors: Partial<Record<SignInField, string>> = {};
    if (!EMAIL_PATTERN.test(normalisedEmail)) nextErrors.email = 'Enter a valid work email.';
    if (!password) nextErrors.password = 'Enter your password.';
    setErrors(nextErrors);
    setSubmitError('');
    setSuccess('');
    if (Object.keys(nextErrors).length) return;

    setSubmitting(true);
    try {
      const result = await onSignIn({ email: normalisedEmail, password });
      if (isFailure(result)) {
        setErrors(result.fieldErrors ?? {});
        setSubmitError(result.message);
        return;
      }
      setSuccess(successfulMessage(result, 'Signed in. Opening your workspace.'));
    } catch (error) {
      setSubmitError(actionError(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="auth-card auth-experience-card sign-in-form" onSubmit={submit} noValidate aria-busy={submitting}>
      <span className="auth-icon"><LockKeyhole size={20} /></span>
      <p className="eyebrow">Welcome back</p>
      <h2>Sign in to Stock Supplies</h2>
      <p>Continue setup or open your authorised profitability workspace.</p>

      <Field label="Work email" error={errors.email}>
        <Input
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          disabled={submitting}
          aria-invalid={Boolean(errors.email)}
          onChange={(event) => {
            setEmail(event.target.value);
            setErrors((current) => ({ ...current, email: undefined }));
          }}
        />
      </Field>
      <Field label="Password" error={errors.password}>
        <Input
          type="password"
          autoComplete="current-password"
          value={password}
          disabled={submitting}
          aria-invalid={Boolean(errors.password)}
          onChange={(event) => {
            setPassword(event.target.value);
            setErrors((current) => ({ ...current, password: undefined }));
          }}
        />
      </Field>
      <div className="auth-inline-links"><Link href={forgotPasswordHref}>Forgot password?</Link></div>

      <FormFeedback error={submitError} success={success} />
      <Button className="auth-submit" variant="primary" size="large" type="submit" loading={submitting}>
        {submitting ? 'Signing in' : 'Sign in'} <ArrowRight size={15} />
      </Button>
      <footer>New to Stock Supplies? <Link href={registerHref}>Create an account</Link></footer>
    </form>
  );
}

export function ForgotPasswordForm({
  onRequestReset,
  initialEmail = '',
  signInHref = '/auth/sign-in',
}: ForgotPasswordFormProps) {
  const [email, setEmail] = useState(initialEmail);
  const [emailError, setEmailError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalisedEmail = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(normalisedEmail)) {
      setEmailError('Enter a valid work email.');
      return;
    }

    setEmailError('');
    setSubmitError('');
    setSubmitting(true);
    try {
      const result = await onRequestReset({ email: normalisedEmail });
      if (isFailure(result)) {
        setEmailError(result.fieldErrors?.email ?? '');
        setSubmitError(result.message);
        return;
      }
      setConfirmation(successfulMessage(result, `If an account exists for ${normalisedEmail}, a reset link has been sent.`));
    } catch (error) {
      setSubmitError(actionError(error));
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmation) {
    return (
      <section className="auth-card auth-experience-card auth-confirmation-state" aria-labelledby="password-reset-title">
        <span className="auth-icon"><Mail size={20} /></span>
        <p className="eyebrow">Check your email</p>
        <h2 id="password-reset-title">Reset link requested</h2>
        <p>For security, the same confirmation is shown whether or not the address is registered.</p>
        <Alert tone="positive" title="Request received">{confirmation}</Alert>
        <Link className="secondary-button auth-submit" href={signInHref}>Back to sign in</Link>
      </section>
    );
  }

  return (
    <form className="auth-card auth-experience-card forgot-password-form" onSubmit={submit} noValidate aria-busy={submitting}>
      <span className="auth-icon"><Mail size={20} /></span>
      <p className="eyebrow">Account recovery</p>
      <h2>Reset your password</h2>
      <p>Enter your work email and we will send a mocked secure reset link.</p>

      <Field label="Work email" error={emailError}>
        <Input
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          disabled={submitting}
          aria-invalid={Boolean(emailError)}
          onChange={(event) => {
            setEmail(event.target.value);
            setEmailError('');
          }}
        />
      </Field>
      {submitError ? <Alert tone="negative" title="Reset request failed">{submitError}</Alert> : null}
      <Button className="auth-submit" variant="primary" size="large" type="submit" loading={submitting}>
        {submitting ? 'Sending reset link' : 'Send reset link'}
      </Button>
      <footer><Link href={signInHref}>Back to sign in</Link></footer>
    </form>
  );
}

function assignmentText(
  assignment: InvitationAssignment,
  allLabel: string,
  emptyLabel: string,
) {
  if (assignment === 'all') return allLabel;
  return assignment.length ? assignment.join(', ') : emptyLabel;
}

function InvitationState({
  status,
  organisationName,
  signInHref,
  workspaceHref,
}: {
  status: Exclude<InvitationStatus, 'pending'>;
  organisationName: string;
  signInHref: string;
  workspaceHref?: string;
}) {
  const content = status === 'invalid'
    ? {
        eyebrow: 'Invitation unavailable',
        title: 'This invitation is not valid',
        body: 'Check that you opened the complete invitation link or ask an administrator for a new invitation.',
        tone: 'negative' as const,
      }
    : status === 'expired'
      ? {
          eyebrow: 'Invitation expired',
          title: 'Ask for a new invitation',
          body: `This invitation to ${organisationName} has expired. An Organisation Admin can resend it.`,
          tone: 'warning' as const,
        }
      : {
          eyebrow: 'Invitation accepted',
          title: `You have joined ${organisationName}`,
          body: 'Your role and company or marketplace assignments are ready. You do not need to set up a subscription.',
          tone: 'positive' as const,
        };

  return (
    <section className="auth-card auth-experience-card invite-state" aria-labelledby="invite-state-title">
      <span className="auth-icon">{status === 'accepted' ? <CheckCircle2 size={20} /> : <KeyRound size={20} />}</span>
      <p className="eyebrow">{content.eyebrow}</p>
      <h2 id="invite-state-title">{content.title}</h2>
      <Alert tone={content.tone} title={status === 'accepted' ? 'Access granted' : 'Unable to join'}>{content.body}</Alert>
      {status === 'accepted' && workspaceHref
        ? <Link className="primary-button auth-submit" href={workspaceHref}>Open workspace <ArrowRight size={15} /></Link>
        : <Link className="secondary-button auth-submit" href={signInHref}>Go to sign in</Link>}
    </section>
  );
}

export function InviteAcceptanceForm({
  invitation,
  onJoin,
  signInHref = '/auth/sign-in',
  workspaceHref,
}: InviteAcceptanceFormProps) {
  const passwordGuidanceId = useId();
  const summaryTitleId = useId();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [mfaPreference, setMfaPreference] = useState<MfaPreference>('authenticator');
  const [errors, setErrors] = useState<Partial<Record<InviteAcceptanceField, string>>>({});
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  const status: InvitationStatus = accepted ? 'accepted' : invitation.status;
  if (status !== 'pending') {
    return (
      <InvitationState
        status={status}
        organisationName={invitation.organisationName}
        signInHref={signInHref}
        workspaceHref={workspaceHref}
      />
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: Partial<Record<InviteAcceptanceField, string>> = {};
    if (!password) nextErrors.password = 'Create a password.';
    else if (!validPassword(password)) nextErrors.password = 'Meet all password requirements.';
    if (!confirmPassword) nextErrors.confirmPassword = 'Confirm your password.';
    else if (password !== confirmPassword) nextErrors.confirmPassword = 'Passwords do not match.';
    setErrors(nextErrors);
    setSubmitError('');
    if (Object.keys(nextErrors).length) return;

    setSubmitting(true);
    try {
      const result = await onJoin({ invitationId: invitation.id, password, mfaPreference });
      if (isFailure(result)) {
        setErrors(result.fieldErrors ?? {});
        setSubmitError(result.message);
        return;
      }
      setAccepted(true);
    } catch (error) {
      setSubmitError(actionError(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="auth-card auth-experience-card invite-acceptance-form" onSubmit={submit} noValidate aria-busy={submitting}>
      <span className="auth-icon"><ShieldCheck size={20} /></span>
      <p className="eyebrow">You have been invited</p>
      <h2>Join {invitation.organisationName}</h2>
      <p>Verify your assigned access, create a password, and join the existing organisation.</p>

      <section className="auth-invitation-summary" aria-labelledby={summaryTitleId}>
        <header>
          <span><Building2 size={17} /></span>
          <div><h3 id={summaryTitleId}>Invitation details</h3><p>{invitation.inviteeName}</p></div>
          <Badge tone="info">{invitation.roleName}</Badge>
        </header>
        <dl>
          <div><dt>Email</dt><dd>{invitation.email}</dd></div>
          <div><dt>Organisation</dt><dd>{invitation.organisationName}</dd></div>
          <div><dt>Company access</dt><dd>{assignmentText(invitation.companyAssignments, 'All companies', 'No company assignment')}</dd></div>
          <div><dt>Marketplace access</dt><dd>{assignmentText(invitation.marketplaceAccountAssignments, 'All marketplace accounts', 'No marketplace account assignment')}</dd></div>
          {invitation.expiresAt ? <div><dt>Invitation expires</dt><dd>{invitation.expiresAt}</dd></div> : null}
        </dl>
      </section>

      <Field label="Create password" error={errors.password}>
        <Input
          type="password"
          autoComplete="new-password"
          value={password}
          disabled={submitting}
          aria-invalid={Boolean(errors.password)}
          aria-describedby={passwordGuidanceId}
          onChange={(event) => {
            setPassword(event.target.value);
            setErrors((current) => ({ ...current, password: undefined }));
          }}
        />
      </Field>
      <PasswordGuidance password={password} id={passwordGuidanceId} />
      <Field label="Confirm password" error={errors.confirmPassword}>
        <Input
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          disabled={submitting}
          aria-invalid={Boolean(errors.confirmPassword)}
          onChange={(event) => {
            setConfirmPassword(event.target.value);
            setErrors((current) => ({ ...current, confirmPassword: undefined }));
          }}
        />
      </Field>

      <fieldset className="auth-mfa-choice" disabled={submitting}>
        <legend>Multi-factor authentication</legend>
        <p>Choose how to handle the mocked security setup.</p>
        <Radio
          name="mfa-preference"
          value="authenticator"
          label="Set up an authenticator app"
          checked={mfaPreference === 'authenticator'}
          onChange={() => {
            setMfaPreference('authenticator');
            setErrors((current) => ({ ...current, mfaPreference: undefined }));
          }}
        />
        <Radio
          name="mfa-preference"
          value="later"
          label="Set up later"
          checked={mfaPreference === 'later'}
          onChange={() => {
            setMfaPreference('later');
            setErrors((current) => ({ ...current, mfaPreference: undefined }));
          }}
        />
        {errors.mfaPreference ? <small role="alert">{errors.mfaPreference}</small> : null}
      </fieldset>

      {submitError ? <Alert tone="negative" title="Invitation could not be accepted">{submitError}</Alert> : null}
      <Button className="auth-submit" variant="primary" size="large" type="submit" loading={submitting}>
        {submitting ? 'Joining organisation' : 'Join organisation'} <ArrowRight size={15} />
      </Button>
      <footer>Already use Stock Supplies? <Link href={signInHref}>Sign in instead</Link></footer>
    </form>
  );
}
