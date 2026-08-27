'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { AlertTriangle, ArrowRight, BarChart3, CheckCircle2, Send, Sparkles, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useAnalysisContext } from '@/src/components/providers/analysis-context-provider';
import { useAccess } from '@/src/components/rbac/access';
import { companies, marketplaceAccounts } from '@/src/fixtures/data';

export function CopilotDrawer() {
  const access = useAccess('copilot.use');
  const pathname = usePathname();
  const { context } = useAnalysisContext();
  if (!access.allowed) return null;

  const page = pathname.split('/').filter(Boolean).at(-1)?.replaceAll('-', ' ') ?? 'dashboard';
  const company = context.companyId === 'all' ? 'All authorised companies' : companies.find((item) => item.id === context.companyId)?.name;
  const account = context.marketplaceAccountIds.length ? marketplaceAccounts.find((item) => item.id === context.marketplaceAccountIds[0])?.displayName : 'All matching accounts';

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild><button className="copilot-button"><Sparkles size={16} /> <span>Ask Copilot</span></button></Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="drawer-overlay copilot-overlay" />
        <Dialog.Content className="copilot-drawer" aria-describedby="copilot-description">
          <header>
            <div className="copilot-title"><span><Sparkles size={17} /></span><div><Dialog.Title>Stock Supplies Copilot</Dialog.Title><Dialog.Description id="copilot-description">Context-aware financial assistant</Dialog.Description></div></div>
            <Dialog.Close asChild><button className="icon-button" aria-label="Close Copilot"><X size={18} /></button></Dialog.Close>
          </header>
          <div className="copilot-context">
            <p>Using current page context</p>
            <div><span>{page}</span><span>{company}</span><span>{context.marketplace === 'all' ? 'All marketplaces' : context.marketplace}</span><span>{account}</span><span>{context.dateRange.from} – 27 Aug</span></div>
          </div>
          <div className="copilot-body">
            <div className="copilot-intro"><span><Sparkles size={18} /></span><div><strong>What would you like to understand?</strong><p>I already have this page and its authorised financial scope.</p></div></div>
            <div className="copilot-block finding"><span><BarChart3 size={16} /></span><div><small>Referenced metric</small><strong>7 products have incomplete profitability</strong><p>Missing COGS affects £12,840.22 of net revenue in this scope.</p></div></div>
            <div className="copilot-block anomaly"><span><AlertTriangle size={16} /></span><div><small>Anomaly</small><strong>Fee data is older than sales data</strong><p>Amazon fee settlement is two hours behind the latest order import.</p></div></div>
            <div className="copilot-block approval"><span><CheckCircle2 size={16} /></span><div><small>Approval request</small><strong>COGS suggestion awaiting review</strong><p>Suggestions never update financial data until an authorised person approves a separate mutation.</p><button className="secondary-button">Review suggestion <ArrowRight size={14} /></button></div></div>
          </div>
          <form className="copilot-composer">
            <label><span className="sr-only">Ask Copilot</span><textarea rows={2} placeholder="Ask about this page…" /></label>
            <button type="button" className="primary-button" aria-label="Send message"><Send size={15} /></button>
            <small>Copilot can explain and suggest. Financial changes always require approval.</small>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
