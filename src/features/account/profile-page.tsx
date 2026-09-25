'use client';

import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Camera, Laptop, Moon, Palette, Save, Sun, UserRound, X } from 'lucide-react';
import { Button } from '@/src/components/ui/actions';
import { Field, Input, Select } from '@/src/components/ui/forms';
import { Alert, useToast } from '@/src/components/ui/feedback';
import { useTheme, type AppearancePreference } from '@/src/components/providers/theme-provider';
import { AccountPageHeading, AccountPanel, InitialsAvatar } from '@/src/features/account/account-ui';
import { useAccountProfile, type AccountProfile } from '@/src/features/account/account-store';

const TIMEZONES = [
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Dublin', label: 'Dublin (GMT/IST)' },
  { value: 'Asia/Karachi', label: 'Karachi (PKT)' },
  { value: 'America/New_York', label: 'New York (ET)' },
  { value: 'America/Los_Angeles', label: 'Los Angeles (PT)' },
];

const APPEARANCE_OPTIONS: Array<{ value: AppearancePreference; label: string; description: string; icon: typeof Sun }> = [
  { value: 'light', label: 'Light', description: 'A bright workspace for daytime use.', icon: Sun },
  { value: 'dark', label: 'Dark', description: 'Reduced glare in low-light environments.', icon: Moon },
  { value: 'system', label: 'System', description: 'Follow this device automatically.', icon: Laptop },
];

function ProfileEditor({ profile, saveProfile }: { profile: AccountProfile; saveProfile: (profile: AccountProfile) => void }) {
  const [draft, setDraft] = useState(profile);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [photoError, setPhotoError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const { preference, resolvedTheme, setPreference } = useTheme();
  const { showToast } = useToast();

  const changed = JSON.stringify(draft) !== JSON.stringify(profile);

  function update(field: 'name' | 'email' | 'jobTitle' | 'timezone', value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: '' }));
  }

  function selectPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setPhotoError('Choose a PNG, JPG, GIF or WebP image.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setPhotoError('Choose an image smaller than 2 MB for this browser-only preview.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      setDraft((current) => ({ ...current, avatarDataUrl: reader.result as string }));
      setPhotoError('');
    };
    reader.onerror = () => setPhotoError('This image could not be previewed. Choose another file.');
    reader.readAsDataURL(file);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (draft.name.trim().length < 2) nextErrors.name = 'Enter your full name.';
    if (!/^\S+@\S+\.\S+$/.test(draft.email)) nextErrors.email = 'Enter a valid email address.';
    if (!draft.jobTitle.trim()) nextErrors.jobTitle = 'Enter a job title.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    const next = { ...draft, name: draft.name.trim(), email: draft.email.trim().toLowerCase(), jobTitle: draft.jobTitle.trim() };
    saveProfile(next);
    setDraft(next);
    showToast('Profile changes saved in this browser.', 'positive');
  }

  return <div className="account-page account-profile-page">
    <AccountPageHeading eyebrow="My account" title="My Profile" description="Manage the personal identity and display settings used across your organisations." />
    <form className="account-page-stack" onSubmit={submit}>
      <AccountPanel icon={UserRound} title="Profile details" description="These details describe you, not your access inside any one organisation.">
        <div className="account-profile-editor">
          <div className="account-photo-editor">
            <InitialsAvatar name={draft.name} image={draft.avatarDataUrl} size="large" />
            <div><strong>Profile photo</strong><p>Previewed and stored only in this browser. Maximum 2 MB.</p><div className="account-inline-actions"><Button type="button" size="compact" onClick={() => fileInput.current?.click()}><Camera size={14} /> Choose image</Button>{draft.avatarDataUrl ? <Button type="button" variant="ghost" size="compact" onClick={() => setDraft((current) => ({ ...current, avatarDataUrl: null }))}><X size={14} /> Remove</Button> : null}</div>{photoError ? <small role="alert">{photoError}</small> : null}</div>
            <input ref={fileInput} className="sr-only" type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={selectPhoto} />
          </div>
          <div className="account-form-grid">
            <Field label="Full name" error={errors.name}><Input autoComplete="name" value={draft.name} onChange={(event) => update('name', event.target.value)} /></Field>
            <Field label="Email" hint="No verification email is sent in this prototype." error={errors.email}><Input type="email" autoComplete="email" value={draft.email} onChange={(event) => update('email', event.target.value)} /></Field>
            <Field label="Job title" error={errors.jobTitle}><Input autoComplete="organization-title" value={draft.jobTitle} onChange={(event) => update('jobTitle', event.target.value)} /></Field>
            <Field label="Timezone" hint="Used for account-level timestamps and display preferences."><Select value={draft.timezone} onChange={(event) => update('timezone', event.target.value)}>{TIMEZONES.map((timezone) => <option key={timezone.value} value={timezone.value}>{timezone.label}</option>)}</Select></Field>
          </div>
        </div>
        <div className="account-form-actions"><Button type="button" variant="ghost" disabled={!changed} onClick={() => { setDraft(profile); setErrors({}); setPhotoError(''); }}>Discard changes</Button><Button type="submit" variant="primary" disabled={!changed}><Save size={15} /> Save profile</Button></div>
      </AccountPanel>
      <AccountPanel icon={Palette} title="Appearance" description="Choose how the application looks on this device." aside={<span className="account-resolved-theme">Currently {resolvedTheme}</span>}>
        <div className="account-appearance-options" role="radiogroup" aria-label="Appearance">
          {APPEARANCE_OPTIONS.map((option) => <button type="button" role="radio" aria-checked={preference === option.value} className={preference === option.value ? 'selected' : ''} key={option.value} onClick={() => setPreference(option.value)}><span><option.icon size={18} aria-hidden="true" /></span><strong>{option.label}</strong><small>{option.description}</small></button>)}
        </div>
        <Alert tone="info" title="Device preference">Appearance is saved locally. System mode follows your operating system when it changes.</Alert>
      </AccountPanel>
    </form>
  </div>;
}

export function ProfilePage() {
  const [profile, saveProfile] = useAccountProfile();
  return <ProfileEditor key={JSON.stringify(profile)} profile={profile} saveProfile={saveProfile} />;
}
