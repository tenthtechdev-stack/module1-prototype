'use client';

import { useState, type FormEvent } from 'react';
import { CheckCircle2, Copy, KeyRound, Laptop, LockKeyhole, LogOut, MonitorSmartphone, ShieldCheck, Smartphone } from 'lucide-react';
import { Button } from '@/src/components/ui/actions';
import { Field, Input } from '@/src/components/ui/forms';
import { Alert, Badge, useToast } from '@/src/components/ui/feedback';
import { ConfirmationDialog, Modal } from '@/src/components/ui/overlays';
import { AccountPageHeading, AccountPanel } from '@/src/features/account/account-ui';
import { useAccountSecurity } from '@/src/features/account/account-store';

const RECOVERY_CODES = ['SS-7A9Q-2L4M', 'SS-3F8K-9R2P', 'SS-6T1W-4H7N', 'SS-8C5V-1J3X', 'SS-2M9B-6D4G', 'SS-5P7Y-8K1A'];

interface PasswordFields {
  current: string;
  next: string;
  confirm: string;
}

const EMPTY_PASSWORDS: PasswordFields = { current: '', next: '', confirm: '' };

function PasswordSection() {
  const [fields, setFields] = useState(EMPTY_PASSWORDS);
  const [errors, setErrors] = useState<Partial<Record<keyof PasswordFields, string>>>({});
  const [changed, setChanged] = useState(false);
  const { showToast } = useToast();

  function update(field: keyof PasswordFields, value: string) {
    setFields((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setChanged(false);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: Partial<Record<keyof PasswordFields, string>> = {};
    if (!fields.current) nextErrors.current = 'Enter your current password.';
    if (fields.next.length < 10) nextErrors.next = 'Use at least 10 characters.';
    else if (!/[A-Z]/.test(fields.next) || !/[a-z]/.test(fields.next) || !/\d/.test(fields.next)) nextErrors.next = 'Include upper and lowercase letters and a number.';
    else if (fields.next === fields.current) nextErrors.next = 'Choose a password different from the current one.';
    if (fields.confirm !== fields.next) nextErrors.confirm = 'Passwords do not match.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setFields(EMPTY_PASSWORDS);
    setChanged(true);
    showToast('Mock password change completed. No password was stored.', 'positive');
  }

  return <AccountPanel icon={LockKeyhole} title="Password" description="Use a unique password for your Stock Supplies account.">
    {changed ? <Alert tone="positive" title="Password change simulated">The form was validated and cleared. This prototype does not update or store a password.</Alert> : null}
    <form className="account-password-form" onSubmit={submit}>
      <Field label="Current password" error={errors.current}><Input type="password" autoComplete="current-password" value={fields.current} onChange={(event) => update('current', event.target.value)} /></Field>
      <div className="account-form-grid">
        <Field label="New password" hint="At least 10 characters with upper and lowercase letters and a number." error={errors.next}><Input type="password" autoComplete="new-password" value={fields.next} onChange={(event) => update('next', event.target.value)} /></Field>
        <Field label="Confirm new password" error={errors.confirm}><Input type="password" autoComplete="new-password" value={fields.confirm} onChange={(event) => update('confirm', event.target.value)} /></Field>
      </div>
      <div className="account-form-actions"><Button type="submit" variant="primary"><KeyRound size={15} /> Change password</Button></div>
    </form>
    <p className="account-prototype-note">Prototype validation only · any non-empty current password is accepted · no credential is retained.</p>
  </AccountPanel>;
}

function TwoFactorSection() {
  const [security, saveSecurity] = useAccountSecurity();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'verify' | 'recovery'>('verify');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const { showToast } = useToast();

  function beginSetup() {
    setStep('verify');
    setCode('');
    setError('');
    setOpen(true);
  }

  function verify() {
    if (!/^\d{6}$/.test(code)) {
      setError('Enter any 6 digits to complete this illustrative verification.');
      return;
    }
    saveSecurity({ ...security, twoFactorEnabled: true });
    setStep('recovery');
    setError('');
    showToast('Two-factor authentication enabled for this prototype.', 'positive');
  }

  function disable() {
    saveSecurity({ ...security, twoFactorEnabled: false });
    setStep('verify');
    setCode('');
    showToast('Two-factor authentication disabled in this browser.', 'warning');
  }

  async function copyRecoveryCodes() {
    try {
      await navigator.clipboard.writeText(RECOVERY_CODES.join('\n'));
      showToast('Illustrative recovery codes copied.', 'positive');
    } catch {
      showToast('Copy is unavailable. Select the codes manually.', 'warning');
    }
  }

  return <>
    <AccountPanel icon={ShieldCheck} title="Two-factor authentication" description="Add a second verification step when signing in." aside={<Badge tone={security.twoFactorEnabled ? 'positive' : 'neutral'}>{security.twoFactorEnabled ? 'Enabled' : 'Disabled'}</Badge>}>
      <div className="account-security-summary">
        <span className={security.twoFactorEnabled ? 'enabled' : ''}>{security.twoFactorEnabled ? <CheckCircle2 size={21} /> : <Smartphone size={21} />}</span>
        <div><strong>{security.twoFactorEnabled ? 'Authenticator app is enabled' : 'Protect your account with an authenticator app'}</strong><p>{security.twoFactorEnabled ? 'The mocked second step is active for this browser prototype.' : 'Set up an illustrative QR code, verify a six-digit code, and review recovery codes.'}</p></div>
        {security.twoFactorEnabled ? <div className="account-inline-actions"><Button type="button" size="compact" onClick={() => { setStep('recovery'); setOpen(true); }}>View recovery codes</Button><ConfirmationDialog trigger={<Button type="button" variant="danger" size="compact">Disable</Button>} title="Disable two-factor authentication?" description="This only updates the local prototype state. In production, password or recovery-code verification would be required." confirmLabel="Disable 2FA" onConfirm={disable} /></div> : <Button type="button" variant="primary" onClick={beginSetup}>Set up 2FA</Button>}
      </div>
      <p className="account-prototype-note">No real TOTP secret is generated, shared, or stored.</p>
    </AccountPanel>
    <Modal open={open} onOpenChange={setOpen} title={step === 'verify' ? 'Set up two-factor authentication' : 'Save your recovery codes'} description={step === 'verify' ? 'Illustrative authenticator setup · no real secret is created.' : 'These sample codes demonstrate the expected handoff after verification.'}>
      {step === 'verify' ? <div className="account-two-factor-setup">
        <ol className="account-setup-steps"><li><span>1</span><div><strong>Scan the illustrative QR code</strong><p>Open your authenticator app and add a new account.</p></div></li></ol>
        <div className="account-qr-wrap"><div className="account-qr" role="img" aria-label="Illustrative QR code, not a real authenticator secret"><ShieldCheck size={36} /></div><div><small>Can’t scan it?</small><strong className="account-setup-code">SS93 AXK2 P7DE MO42</strong><p>This setup code is illustrative and cannot generate a valid token.</p></div></div>
        <ol className="account-setup-steps" start={2}><li><span>2</span><div><strong>Enter the six-digit code</strong><p>For this prototype, any six digits will verify successfully.</p></div></li></ol>
        <Field label="Verification code" error={error}><Input className="account-verification-code" value={code} inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" onChange={(event) => { setCode(event.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }} /></Field>
        <div className="account-dialog-actions"><Button type="button" variant="primary" onClick={verify}>Verify and enable</Button></div>
      </div> : <div className="account-recovery-view">
        <Alert tone="positive" title="Two-factor authentication enabled">Keep recovery codes somewhere safe. Each code would normally be single-use.</Alert>
        <div className="account-recovery-codes" aria-label="Illustrative recovery codes">{RECOVERY_CODES.map((recoveryCode) => <code key={recoveryCode}>{recoveryCode}</code>)}</div>
        <p>Prototype only: these codes are fixed examples and cannot recover an account.</p>
        <div className="account-dialog-actions"><Button type="button" onClick={() => { void copyRecoveryCodes(); }}><Copy size={14} /> Copy codes</Button><Button type="button" variant="primary" onClick={() => setOpen(false)}>Done</Button></div>
      </div>}
    </Modal>
  </>;
}

function SessionsSection() {
  const [security, saveSecurity] = useAccountSecurity();
  const { showToast } = useToast();

  function signOutOthers() {
    saveSecurity({ ...security, otherSessionsActive: false });
    showToast('Other prototype sessions signed out.', 'positive');
  }

  return <AccountPanel icon={MonitorSmartphone} title="Sessions" description="Review browsers and devices currently represented for your account." aside={<Button type="button" size="compact" disabled={!security.otherSessionsActive} onClick={signOutOthers}><LogOut size={14} /> Sign out other sessions</Button>}>
    <div className="account-session-list">
      <article><span className="account-session-icon"><Laptop size={18} /></span><div><header><strong>Microsoft Edge on Windows</strong><Badge tone="positive">Current session</Badge></header><p>Karachi, Pakistan · Active now</p><small>Last activity 25 Sep 2026, 14:32 PKT</small></div></article>
      {security.otherSessionsActive ? <article><span className="account-session-icon"><Smartphone size={18} /></span><div><header><strong>Safari on iPhone</strong><Badge tone="neutral">Another session</Badge></header><p>London, United Kingdom · 2 days ago</p><small>Last activity 23 Sep 2026, 09:14 BST</small></div></article> : <div className="account-sessions-cleared"><CheckCircle2 size={17} /><span><strong>No other sessions</strong><small>Only this browser remains in the local prototype state.</small></span></div>}
    </div>
    <p className="account-prototype-note">Device locations and sign-out actions are representative. No server session is inspected or revoked.</p>
  </AccountPanel>;
}

export function SecurityPage() {
  return <div className="account-page account-security-page">
    <AccountPageHeading eyebrow="My account" title="Security" description="Review password, two-factor authentication, and signed-in device controls." />
    <div className="account-page-stack"><PasswordSection /><TwoFactorSection /><SessionsSection /></div>
  </div>;
}

