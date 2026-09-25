'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import * as Popover from '@radix-ui/react-popover';
import { Bell, BellRing, Boxes, Check, CheckCheck, KeyRound, ReceiptText, RefreshCw, ShieldAlert, UserRoundCheck, X, type LucideIcon } from 'lucide-react';
import { DEFAULT_NOTIFICATION_READ_IDS, NOTIFICATION_READ_STORAGE_KEY, useLocalAccountState } from '@/src/features/account/account-store';

type NotificationTone = 'financial' | 'marketplace' | 'people' | 'security';

interface PrototypeNotification {
  id: string;
  area: string;
  title: string;
  message: string;
  timestamp: string;
  relativeTime: string;
  href: string;
  tone: NotificationTone;
  icon: LucideIcon;
}

function notificationsFor(orgSlug: string): PrototypeNotification[] {
  const tenant = `/o/${encodeURIComponent(orgSlug)}`;
  return [
    { id: 'notification-cogs-approval', area: 'COGS', title: 'COGS import awaiting approval', message: 'Supplier Costs Sep 2026 is ready for a human approval decision.', timestamp: '2026-09-25T09:20:00Z', relativeTime: '12 min ago', href: `${tenant}/cogs/import`, tone: 'financial', icon: Boxes },
    { id: 'notification-missing-cogs', area: 'Products', title: '18 products are missing COGS', message: 'Profitability remains incomplete for affected Stock Supplies products.', timestamp: '2026-09-25T08:47:00Z', relativeTime: '45 min ago', href: `${tenant}/products?cogs=missing`, tone: 'financial', icon: Boxes },
    { id: 'notification-authentication', area: 'Marketplace accounts', title: 'eBay authentication required', message: 'Stock Supplies eBay UK needs to be reconnected before syncing can continue.', timestamp: '2026-09-25T07:35:00Z', relativeTime: '1 hr ago', href: `${tenant}/admin/marketplace-accounts`, tone: 'marketplace', icon: KeyRound },
    { id: 'notification-sync-delayed', area: 'Sync health', title: 'Amazon sync is delayed', message: 'Northbridge Amazon UK has not completed a successful sync in 4 hours.', timestamp: '2026-09-24T19:10:00Z', relativeTime: 'Yesterday', href: `${tenant}/operations/sync-health`, tone: 'marketplace', icon: RefreshCw },
    { id: 'notification-expense', area: 'Expenses', title: 'Expense needs review', message: 'September warehouse rent has an allocation scope that needs confirmation.', timestamp: '2026-09-24T14:42:00Z', relativeTime: 'Yesterday', href: `${tenant}/expenses`, tone: 'financial', icon: ReceiptText },
    { id: 'notification-invitation', area: 'Users', title: 'Invitation accepted', message: 'Alex Morgan joined Stock Supplies Ltd as a Company Manager.', timestamp: '2026-09-23T10:15:00Z', relativeTime: '2 days ago', href: `${tenant}/admin/users`, tone: 'people', icon: UserRoundCheck },
    { id: 'notification-security', area: 'Security', title: 'Account security reminder', message: 'Two-factor authentication is available for your personal account.', timestamp: '2026-09-22T08:00:00Z', relativeTime: '3 days ago', href: '/account/security', tone: 'security', icon: ShieldAlert },
  ];
}

export function NotificationCentre({ trigger, orgSlug = 'stock-supplies' }: { trigger?: React.ReactNode; orgSlug?: string }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [readIds, persistReadIds] = useLocalAccountState(NOTIFICATION_READ_STORAGE_KEY, DEFAULT_NOTIFICATION_READ_IDS);
  const notifications = useMemo(() => notificationsFor(orgSlug), [orgSlug]);

  const unreadCount = notifications.filter((item) => !readIds.includes(item.id)).length;
  const visible = filter === 'unread' ? notifications.filter((item) => !readIds.includes(item.id)) : notifications;

  function persist(next: string[]) {
    const unique = [...new Set(next)];
    persistReadIds(unique);
  }

  function markRead(id: string) {
    if (!readIds.includes(id)) persist([...readIds, id]);
  }

  function markAllRead() {
    persist(notifications.map((item) => item.id));
  }

  return <Popover.Root open={open} onOpenChange={setOpen}>
    <Popover.Trigger asChild>{trigger ?? <button type="button" className="icon-button" aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'}><Bell size={18} />{unreadCount ? <i /> : null}</button>}</Popover.Trigger>
    <Popover.Portal>
      <Popover.Content className="ui-popover-content notification-centre" align="end" sideOffset={7} collisionPadding={8} aria-label="Notification centre">
        <header className="notification-centre-header"><div><span><BellRing size={17} /></span><div><strong>Notifications</strong><small>{unreadCount ? `${unreadCount} unread` : 'You’re all caught up'}</small></div></div><Popover.Close className="notification-close" aria-label="Close notifications"><X size={16} /></Popover.Close></header>
        <div className="notification-centre-controls"><div role="tablist" aria-label="Notification filters"><button type="button" role="tab" aria-selected={filter === 'all'} onClick={() => setFilter('all')}>All</button><button type="button" role="tab" aria-selected={filter === 'unread'} onClick={() => setFilter('unread')}>Unread {unreadCount ? `(${unreadCount})` : ''}</button></div><button type="button" disabled={!unreadCount} onClick={markAllRead}><CheckCheck size={14} /> Mark all read</button></div>
        <div className="notification-list">
          {visible.length ? visible.map((item) => {
            const read = readIds.includes(item.id);
            return <article key={item.id} className={`notification-item${read ? ' read' : ' unread'}`}>
              <span className={`notification-item-icon ${item.tone}`}><item.icon size={16} aria-hidden="true" /></span>
              <div className="notification-item-content"><div className="notification-item-meta"><span>{item.area}</span><time dateTime={item.timestamp}>{item.relativeTime}</time></div><Popover.Close asChild><Link href={item.href} onClick={() => markRead(item.id)}><strong>{item.title}</strong><span>{item.message}</span></Link></Popover.Close></div>
              {!read ? <button type="button" className="notification-read-action" aria-label={`Mark ${item.title} as read`} title="Mark as read" onClick={() => markRead(item.id)}><Check size={14} /></button> : <span className="notification-read-indicator" aria-label="Read"><CheckCheck size={13} /></span>}
            </article>;
          }) : <div className="notification-empty"><CheckCheck size={22} /><strong>No unread notifications</strong><span>New operational and account updates will appear here.</span></div>}
        </div>
        <footer><Popover.Close asChild><Link href="/account/notifications">Manage notification preferences</Link></Popover.Close><small>Prototype data · no email or push delivery</small></footer>
        <Popover.Arrow className="notification-centre-arrow" />
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>;
}
