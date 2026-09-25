import Image from 'next/image';
import type { LucideIcon } from 'lucide-react';

export function AccountPageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <header className="page-heading account-page-heading"><div><p>{eyebrow}</p><h1>{title}</h1><span>{description}</span></div>{action ? <div className="page-heading-actions">{action}</div> : null}</header>;
}

export function AccountPanel({ icon: Icon, title, description, aside, children, className = '' }: { icon: LucideIcon; title: string; description: string; aside?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return <section className={`account-panel ${className}`.trim()}>
    <header className="account-panel-heading"><span className="account-panel-icon"><Icon size={18} aria-hidden="true" /></span><div><h2>{title}</h2><p>{description}</p></div>{aside ? <aside>{aside}</aside> : null}</header>
    <div className="account-panel-body">{children}</div>
  </section>;
}

export function InitialsAvatar({ name, image, size = 'default' }: { name: string; image?: string | null; size?: 'default' | 'large' }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'ZR';
  const pixels = size === 'large' ? 76 : 32;
  return <span className={`account-avatar ${size}`} aria-label={`${name || 'User'} profile photo`}>{image ? <Image src={image} alt="" width={pixels} height={pixels} unoptimized /> : initials}</span>;
}
