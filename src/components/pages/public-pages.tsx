import Link from 'next/link';
import { ArrowRight, Check, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';

export function AuthPage({ type, token }: { type: 'sign-in' | 'register' | 'forgot-password' | 'invite'; token?: string }) {
  const content = {
    'sign-in': { eyebrow: 'Welcome back', title: 'Sign in to Stock Supplies', description: 'Continue to your profitability workspace.', submit: 'Sign in', alt: 'Create an account', altHref: '/auth/register' },
    register: { eyebrow: 'Start your workspace', title: 'Create your organisation', description: 'Begin your guided Stock Supplies setup.', submit: 'Create account', alt: 'Already have an account?', altHref: '/auth/sign-in' },
    'forgot-password': { eyebrow: 'Account recovery', title: 'Reset your password', description: 'We will send a secure reset link to your work email.', submit: 'Send reset link', alt: 'Back to sign in', altHref: '/auth/sign-in' },
    invite: { eyebrow: 'You have been invited', title: 'Join Stock Supplies', description: `Accept invitation ${token ? `ending ${token.slice(-4)}` : ''} and set up your account.`, submit: 'Accept invitation', alt: 'Use a different account', altHref: '/auth/sign-in' },
  }[type];
  return (
    <main className="auth-page">
      <section className="auth-aside"><div className="auth-brand"><span className="brand-mark">SS</span><strong>Stock Supplies</strong></div><div><p className="eyebrow light">Marketplace profitability</p><h1>Know what every sale really earned.</h1><p>Reconcile revenue, fees, COGS and operating costs across Amazon, eBay and Temu.</p><ul><li><Check size={15} /> Shared financial context</li><li><Check size={15} /> Clear data freshness</li><li><Check size={15} /> Capability-based access</li></ul></div><small>Built by Tenth Tech</small></section>
      <section className="auth-form-wrap"><form className="auth-card"><span className="auth-icon">{type === 'forgot-password' ? <Mail size={20} /> : type === 'invite' ? <ShieldCheck size={20} /> : <LockKeyhole size={20} />}</span><p className="eyebrow">{content.eyebrow}</p><h2>{content.title}</h2><p>{content.description}</p><label>Work email<input type="email" defaultValue={type === 'sign-in' ? 'zara@stocksupplies.co.uk' : ''} placeholder="you@company.com" /></label>{type !== 'forgot-password' ? <label>Password<input type="password" defaultValue={type === 'sign-in' ? 'prototype' : ''} placeholder="At least 8 characters" /></label> : null}<Link className="primary-button auth-submit" href={type === 'sign-in' ? '/o/stock-supplies/dashboard' : '/onboarding/subscription'}>{content.submit}<ArrowRight size={15} /></Link><footer>{content.alt} <Link href={content.altHref}>Continue</Link></footer></form></section>
    </main>
  );
}

const onboardingSteps = ['Subscription', 'Payment', 'Organisation', 'Companies', 'Marketplaces', 'Initial sync', 'COGS readiness', 'Invite users', 'Complete'];

export function OnboardingPage({ step, title, description }: { step: number; title: string; description: string }) {
  const previous = step > 1 ? `/onboarding/${['subscription', 'payment', 'organisation', 'companies', 'marketplaces', 'sync', 'cogs', 'users', 'complete'][step - 2]}` : '/auth/register';
  const next = step < onboardingSteps.length ? `/onboarding/${['subscription', 'payment', 'organisation', 'companies', 'marketplaces', 'sync', 'cogs', 'users', 'complete'][step]}` : '/o/stock-supplies/dashboard';
  return (
    <main className="onboarding-page"><header><div className="auth-brand"><span className="brand-mark">SS</span><strong>Stock Supplies</strong></div><span>Step {step} of {onboardingSteps.length}</span></header><div className="onboarding-layout"><aside><p className="eyebrow">Guided setup</p>{onboardingSteps.map((label, index) => <div className={index + 1 === step ? 'current' : index + 1 < step ? 'complete' : ''} key={label}><span>{index + 1 < step ? <Check size={13} /> : index + 1}</span>{label}</div>)}</aside><section className="onboarding-card"><p className="eyebrow">{onboardingSteps[step - 1]}</p><h1>{title}</h1><p>{description}</p><div className="setup-preview"><span><ShieldCheck size={20} /></span><div><strong>Foundation preview</strong><p>This step is routed and ready for the Phase 2 guided workflow.</p></div></div><footer><Link className="secondary-button" href={previous}>Back</Link><Link className="primary-button" href={next}>{step === onboardingSteps.length ? 'Open workspace' : 'Continue'} <ArrowRight size={15} /></Link></footer></section></div></main>
  );
}
