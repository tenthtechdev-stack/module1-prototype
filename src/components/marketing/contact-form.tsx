'use client';

import { useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, AlertCircle, Copy } from 'lucide-react';

export function ContactForm() {
  const [state, setState] = useState<'idle' | 'submitting' | 'success' | 'failure'>('idle');
  const [error, setError] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const enquiryText = useRef('');
  const statusRef = useRef<HTMLDivElement>(null);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const marketplaces = data.getAll('marketplaces');
    if (!marketplaces.length) { setError('Select at least one marketplace.'); form.querySelector<HTMLInputElement>('input[name="marketplaces"]')?.focus(); return; }
    if (String(data.get('name')).trim().length < 2 || String(data.get('company')).trim().length < 2 || String(data.get('message')).trim().length < 10) { setError('Enter your name, Company and a message of at least 10 characters.'); return; }
    setError(''); setState('submitting');
    const enquiry = { name: String(data.get('name')).trim(), email: String(data.get('email')).trim(), company: String(data.get('company')).trim(), role: data.get('role'), marketplaces, accounts: Number(data.get('accounts')), interest: data.get('interest'), message: String(data.get('message')).trim() };
    enquiryText.current = Object.entries(enquiry).map(([key,value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`).join('\n');
    await new Promise((done) => setTimeout(done, 450));
    try { localStorage.setItem('stock-supplies:marketing-enquiry', JSON.stringify(enquiry)); setState('success'); }
    catch { setState('failure'); }
    requestAnimationFrame(() => statusRef.current?.focus());
  }
  async function copy() {
    try { await navigator.clipboard.writeText(enquiryText.current); setCopyStatus('Enquiry copied.'); }
    catch { setCopyStatus('Copy is unavailable in this browser. Your form values are still shown below.'); }
  }
  return <div className="m-contact-panel"><div className="m-form-heading"><h2>Your business, in context.</h2><p>All fields are required unless marked optional.</p></div><div className="m-local-note"><AlertCircle size={18} aria-hidden="true" /><p>Frontend preview: this form saves in this browser only. No email is sent and Stock Supplies is not notified.</p></div>
    {state === 'success' && <div className="m-form-status m-form-success" role="status" ref={statusRef} tabIndex={-1}><CheckCircle2 size={22} /><div><strong>Enquiry saved in this browser.</strong><p>Nothing has been emailed or submitted to Stock Supplies. You can copy the enquiry for your records.</p><button type="button" onClick={copy}><Copy size={15} /> Copy enquiry</button><p>{copyStatus}</p></div></div>}
    {state === 'failure' && <div className="m-form-status m-form-failure" role="alert" ref={statusRef} tabIndex={-1}><AlertCircle size={22} /><div><strong>Your browser could not save the enquiry.</strong><p>Your entries are still here. Enable local storage and try again, or copy the enquiry.</p><button type="button" onClick={copy}><Copy size={15} /> Copy enquiry</button><p>{copyStatus}</p></div></div>}
    <form onSubmit={submit} aria-label="Contact enquiry" aria-busy={state === 'submitting'}><div className="m-form-grid"><label>Name<input name="name" autoComplete="name" required minLength={2} maxLength={100} /></label><label>Work email<input name="email" type="email" autoComplete="email" required maxLength={200} /></label><label>Company<input name="company" autoComplete="organization" required minLength={2} maxLength={150} /></label><label>Role<select name="role" required defaultValue=""><option value="" disabled>Select your role</option>{['Finance & Accounts', 'Marketplace Manager', 'Purchasing / Cost Team', 'Management / Analyst', 'Other'].map((role) => <option key={role}>{role}</option>)}</select></label></div>
      <fieldset aria-describedby={error ? 'contact-error' : undefined}><legend>Marketplaces</legend><div className="m-form-marketplaces">{['Amazon', 'eBay', 'Temu'].map((name) => <label key={name}><input type="checkbox" name="marketplaces" value={name} />{name}</label>)}</div></fieldset>
      <div className="m-form-grid"><label>Number of marketplace accounts<input name="accounts" type="number" min={1} max={10000} step={1} required inputMode="numeric" /></label><label>Interested in <span>(optional)</span><select name="interest" defaultValue="Module 01 access">{['Module 01 access', 'Demo', 'Partnership', 'General enquiry'].map((value) => <option key={value}>{value}</option>)}</select></label></div>
      <label>Message<textarea name="message" rows={5} minLength={10} maxLength={5000} required placeholder="Tell us about your marketplace setup and what you need to understand." /></label>
      {error && <p id="contact-error" role="alert" className="m-form-error">{error}</p>}
      <button type="submit" className="m-cta m-cta-primary" data-cta="contact-save-enquiry" disabled={state === 'submitting'}>{state === 'submitting' ? 'Saving enquiry…' : state === 'failure' ? 'Try saving again' : 'Save enquiry locally'}<ArrowRight size={17} /></button><p className="m-form-footnote">Saved only on this device. You can replace the local enquiry by submitting this form again.</p>
    </form></div>;
}
