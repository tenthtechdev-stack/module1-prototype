'use client';

import { ArrowUpRight, CheckCircle2, Clock3, Construction, Database, ShieldCheck } from 'lucide-react';
import type { Capability } from '@/src/domain/permissions';
import { useAccess, AccessState } from '@/src/components/rbac/access';
import { StatusIndicator } from '@/src/components/states/states';

interface FeaturePageProps {
  eyebrow?: string;
  title: string;
  description: string;
  capability: Capability;
  detail?: string;
  children?: React.ReactNode;
}

export function FeaturePage({ eyebrow = 'Phase 1 foundation', title, description, capability, detail, children }: FeaturePageProps) {
  const decision = useAccess(capability);
  return (
    <div className="feature-page">
      <header className="page-heading">
        <div><p>{eyebrow}</p><h1>{title}</h1><span>{description}</span></div>
        {decision.allowed ? <StatusIndicator tone="positive" label="Foundation ready" /> : null}
      </header>
      {decision.allowed ? children ?? (
        <section className="route-foundation-panel">
          <div className="foundation-intro"><span><Construction size={21} /></span><div><h2>{title} workspace</h2><p>{detail ?? 'The route, shell, permissions and data context are ready for the product workflow in its implementation phase.'}</p></div><button className="secondary-button">View contract <ArrowUpRight size={14} /></button></div>
          <div className="foundation-grid">
            <article><Database size={17} /><strong>Service boundary</strong><p>Feature code is isolated from the replaceable repository implementation.</p><span><CheckCircle2 size={13} /> Connected</span></article>
            <article><ShieldCheck size={17} /><strong>Capability gate</strong><p>This page declares <code>{capability}</code> instead of checking a role name.</p><span><CheckCircle2 size={13} /> Evaluated</span></article>
            <article><Clock3 size={17} /><strong>Loading contract</strong><p>Route-level loading, empty and error states preserve the application shell.</p><span><CheckCircle2 size={13} /> Available</span></article>
          </div>
        </section>
      ) : <AccessState decision={decision} />}
    </div>
  );
}
