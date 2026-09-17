'use client';

import Link from 'next/link';
import Image from 'next/image';
import * as Dialog from '@radix-ui/react-dialog';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import { ChevronDown, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { MarketingCTA } from './cta';

const menus = [
  { label: 'Product', links: [['Marketplace Profitability', '/marketplace-profitability'], ['Product Profitability', '/product-profitability'], ['COGS Management', '/cogs-management'], ['Product Groups', '/product-groups'], ['Copilot', '/copilot']] },
  { label: 'Solutions', links: [['Finance & Accounts', '/#teams'], ['Marketplace Managers', '/marketplace-analytics'], ['Multi-company Commerce', '/#multi-company'], ['Cost Teams', '/cogs-management']] },
  { label: 'Marketplaces', links: [['Amazon', '/integrations/amazon'], ['eBay', '/integrations/ebay'], ['Temu', '/integrations/temu'], ['Combined analytics', '/marketplace-analytics']] },
  { label: 'Resources', links: [['How it works', '/#onboarding'], ['Security & access', '/security'], ['About Stock Supplies', '/about'], ['Talk to us', '/contact']] },
];

export function Brand() {
  return <Link href="/" className="m-brand" aria-label="Stock Supplies home"><Image src="/favicon.svg" width={31} height={31} alt="" /><span>Stock Supplies<span className="m-brand-dot">.</span></span></Link>;
}

export function MarketingHeader() {
  const [open, setOpen] = useState(false);
  return <header className="m-header"><div className="m-container m-header-inner"><Brand />
    <nav className="m-desktop-nav" aria-label="Main navigation">{menus.map((menu) => <Dropdown.Root key={menu.label}><Dropdown.Trigger className="m-nav-trigger">{menu.label}<ChevronDown size={13} aria-hidden="true" /></Dropdown.Trigger><Dropdown.Portal><Dropdown.Content className="m-nav-dropdown" sideOffset={17} align="start">{menu.links.map(([label, href]) => <Dropdown.Item key={href} asChild><Link href={href} prefetch={false}>{label}</Link></Dropdown.Item>)}</Dropdown.Content></Dropdown.Portal></Dropdown.Root>)}<Link href="/pricing">Pricing</Link></nav>
    <div className="m-header-actions"><Link href="/auth/sign-in" prefetch={false} data-cta="header-sign-in">Sign in</Link><MarketingCTA id="header-start-test-plan" /></div>
    <Dialog.Root open={open} onOpenChange={setOpen}><Dialog.Trigger className="m-mobile-toggle" aria-label="Open navigation"><Menu size={23} /></Dialog.Trigger><Dialog.Portal><Dialog.Overlay className="m-drawer-overlay" /><Dialog.Content className="m-mobile-drawer" aria-describedby="mobile-nav-description"><div className="m-drawer-top"><Dialog.Title>Stock Supplies</Dialog.Title><Dialog.Close aria-label="Close navigation"><X size={23} /></Dialog.Close></div><Dialog.Description id="mobile-nav-description" className="m-sr-only">Explore the product, marketplaces and account access.</Dialog.Description><nav aria-label="Mobile navigation" onClick={(event) => { if ((event.target as HTMLElement).closest('a')) setOpen(false); }}>{menus.map((menu) => <details key={menu.label} open={menu.label === 'Product'}><summary>{menu.label}<ChevronDown size={16} /></summary>{menu.links.map(([label, href]) => <Link href={href} prefetch={false} key={href}>{label}</Link>)}</details>)}<Link className="m-mobile-direct" href="/pricing">Pricing</Link><Link className="m-mobile-direct" href="/auth/sign-in" prefetch={false}>Sign in</Link><MarketingCTA id="mobile-start-test-plan" /></nav></Dialog.Content></Dialog.Portal></Dialog.Root>
  </div></header>;
}
