'use client';

import Link from 'next/link';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { BellRing, Check, Laptop, LogOut, Moon, ShieldCheck, Sun, UserRound } from 'lucide-react';
import { useTheme, type AppearancePreference } from '@/src/components/providers/theme-provider';

const OPTIONS: Array<{ value: AppearancePreference; label: string; icon: typeof Sun }> = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Laptop },
];

export function AppearanceSelect() {
  const { preference, setPreference } = useTheme();
  return <label className="prototype-control prototype-appearance-control"><span>Appearance</span><select aria-label="Prototype appearance" value={preference} onChange={(event) => setPreference(event.target.value as AppearancePreference)}>{OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>;
}

export function AppearanceMenu({ trigger, userName, userEmail }: { trigger: React.ReactNode; userName?: string; userEmail?: string }) {
  const { preference, resolvedTheme, setPreference } = useTheme();
  return <DropdownMenu.Root>
    <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
    <DropdownMenu.Portal>
      <DropdownMenu.Content className="ui-popover-content appearance-menu" align="end" sideOffset={7} collisionPadding={8} aria-label="Account and appearance menu">
        {userName ? <div className="appearance-menu-user"><strong>{userName}</strong><small>{userEmail ?? 'Signed-in prototype user'}</small></div> : null}
        <DropdownMenu.Label className="appearance-menu-label">My account</DropdownMenu.Label>
        <DropdownMenu.Item asChild><Link className="appearance-menu-item account-menu-link" href="/account/profile"><UserRound size={15} aria-hidden="true" /><span>My Profile</span></Link></DropdownMenu.Item>
        <DropdownMenu.Item asChild><Link className="appearance-menu-item account-menu-link" href="/account/security"><ShieldCheck size={15} aria-hidden="true" /><span>Security</span></Link></DropdownMenu.Item>
        <DropdownMenu.Item asChild><Link className="appearance-menu-item account-menu-link" href="/account/notifications"><BellRing size={15} aria-hidden="true" /><span>Notifications</span></Link></DropdownMenu.Item>
        <DropdownMenu.Separator className="appearance-menu-separator" />
        <DropdownMenu.Label className="appearance-menu-label">Appearance</DropdownMenu.Label>
        <DropdownMenu.RadioGroup value={preference} onValueChange={(value) => setPreference(value as AppearancePreference)}>
          {OPTIONS.map((option) => <DropdownMenu.RadioItem className="appearance-menu-item" value={option.value} key={option.value}>
            <option.icon size={15} aria-hidden="true" />
            <span>{option.label}</span>
            <DropdownMenu.ItemIndicator><Check size={14} aria-hidden="true" /></DropdownMenu.ItemIndicator>
          </DropdownMenu.RadioItem>)}
        </DropdownMenu.RadioGroup>
        <p className="appearance-menu-hint">{preference === 'system' ? `Following the system · ${resolvedTheme}` : `${resolvedTheme.charAt(0).toUpperCase()}${resolvedTheme.slice(1)} theme selected`}</p>
        <DropdownMenu.Separator className="appearance-menu-separator" />
        <DropdownMenu.Item asChild><Link className="appearance-menu-item account-menu-link account-menu-signout" href="/auth/sign-in"><LogOut size={15} aria-hidden="true" /><span>Sign out</span></Link></DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>;
}
