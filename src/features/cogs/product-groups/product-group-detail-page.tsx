'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, CalendarClock, History, Info, Layers3, ShieldCheck, Sparkles } from 'lucide-react';
import { useAnalysisContext } from '@/src/components/providers/analysis-context-provider';
import { AccessState } from '@/src/components/rbac/access';
import { EmptyState, ErrorState } from '@/src/components/states/states';
import { MarketplaceBadge, MetricValue, SectionHeader } from '@/src/components/product/patterns';
import { Button } from '@/src/components/ui/actions';
import { Alert, Badge, Skeleton, useToast, type Tone } from '@/src/components/ui/feedback';
import { Checkbox, Field, Input, SearchInput, Select, Textarea, UnambiguousDateInput } from '@/src/components/ui/forms';
import { Breadcrumbs } from '@/src/components/ui/navigation';
import { Drawer } from '@/src/components/ui/overlays';
import { formatDate, formatInteger, formatMoney, formatMoneyCompact, formatPercentage } from '@/src/domain/calculations';
import { COGS_TODAY } from '@/src/domain/cogs';
import { deriveInheritedCogsMinor, type ProductGroupCostProposal, type ProductGroupDetail, type ProductGroupMemberDetail } from '@/src/domain/product-groups';
import { ProductThumbnail } from '@/src/features/products/product-thumbnail';
import { useProductGroup, useProductGroupActions, useProductGroupCompanyProducts } from '@/src/services/hooks/use-product-groups';
import { CogsSubNavigation } from './cogs-sub-navigation';
import { TransactionsLink } from '@/src/features/transactions/transaction-links';

type ProductGroupTab = 'overview' | 'members' | 'profitability' | 'cost-history' | 'activity';

const TABS: Array<{ id: ProductGroupTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'members', label: 'Members' },
  { id: 'profitability', label: 'Profitability' },
  { id: 'cost-history', label: 'Cost History' },
  { id: 'activity', label: 'Activity' },
];

function activeTabFor(value: string | null): ProductGroupTab {
  return TABS.some((tab) => tab.id === value) ? value as ProductGroupTab : 'overview';
}

function formatUnitRate(baseCostMinor: number | null, baseQuantity: number, currency: string) {
  if (baseCostMinor === null || baseQuantity <= 0) return 'Missing';
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(baseCostMinor / baseQuantity / 100);
}

function formatPeriod(from: string, to: string | null) {
  if (!to) return `${formatDate(from)} – Current`;
  const inclusiveEnd = new Date(`${to.slice(0, 10)}T00:00:00.000Z`);
  inclusiveEnd.setUTCDate(inclusiveEnd.getUTCDate() - 1);
  return `${formatDate(from)} – ${formatDate(inclusiveEnd.toISOString())}`;
}

function proposalTone(status: ProductGroupCostProposal['status']): Tone {
  if (status === 'applied') return 'positive';
  if (status === 'failed' || status === 'cancelled') return 'negative';
  if (status === 'awaiting-approval' || status === 'recalculating') return 'info';
  return 'warning';
}

function valueText(value: unknown): string {
  if (value === null || value === undefined) return 'Not set';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value).replaceAll('_', ' ');
  if (Array.isArray(value)) return value.map(valueText).join(', ');
  if (typeof value === 'object') return Object.entries(value as Record<string, unknown>).map(([key, item]) => `${key.replaceAll('_', ' ')}: ${valueText(item)}`).join(' · ');
  return String(value);
}

function ProductGroupDetailLoading() {
  return <div className="cogs-page product-group-detail-page" role="status" aria-label="Loading Product Group"><Skeleton className="product-group-loading-title" /><section className="product-group-detail-hero"><Skeleton /><Skeleton /><Skeleton /></section><section className="product-group-detail-panel"><Skeleton /><Skeleton /><Skeleton /></section></div>;
}

function ProductSourceBadge({ member }: { member: ProductGroupMemberDetail }) {
  const source = member.resolvedCogs;
  if (source.source === 'inherited') return <Badge tone="info">Inherited from Product Group</Badge>;
  if (source.source === 'direct') return <Badge tone="neutral">{source.label}</Badge>;
  return <Badge tone="warning">Missing COGS</Badge>;
}

function OverviewPanel({ detail, orgSlug }: { detail: ProductGroupDetail; orgSlug: string }) {
  const { group, currentCost } = detail;
  return <div className="product-group-tab-stack">
    <section className="product-group-overview-grid">
      <article className="product-group-detail-panel">
        <SectionHeader title="Group definition" description="Company-owned costing identity and current basis." />
        <dl className="product-group-definition-list">
          <div><dt>Company</dt><dd>{detail.companyName}</dd></div>
          <div><dt>Status</dt><dd><Badge tone={group.status === 'active' ? 'positive' : 'neutral'}>{group.status}</Badge></dd></div>
          <div><dt>Base Product</dt><dd><Link href={`/o/${orgSlug}/products/${encodeURIComponent(group.baseProduct.id)}`}>{group.baseProduct.title}</Link><small className="mono">{group.baseProduct.internalSku}</small></dd></div>
          <div><dt>Base Quantity</dt><dd>{formatInteger(currentCost?.baseQuantity ?? group.baseQuantity)} {group.unitOfMeasure}</dd></div>
          <div><dt>Currency</dt><dd>{currentCost?.currency ?? group.currency}</dd></div>
          <div><dt>Last updated</dt><dd>{formatDate(group.updatedAt)}<small>{group.updatedByName}</small></dd></div>
        </dl>
      </article>
      <article className="product-group-detail-panel product-group-current-basis">
        <SectionHeader title="Current costing basis" description="Effective-dated and approved before use." />
        {currentCost ? <><div className="product-group-cost-hero"><small>Current Base Cost</small><strong>{formatMoney(currentCost.baseCostMinor, currentCost.currency)}</strong><span>Effective from {formatDate(currentCost.effectiveFrom)}</span></div><dl><div><dt>Base Unit Cost</dt><dd>{formatUnitRate(currentCost.baseCostMinor, currentCost.baseQuantity, currentCost.currency)}</dd></div><div><dt>Source</dt><dd>{currentCost.source}</dd></div><div><dt>Approved by</dt><dd>{currentCost.approvedByName}</dd></div><div><dt>Reason</dt><dd>{currentCost.reason}</dd></div></dl></> : <Alert tone="warning" title="Group cost is missing">Members resolve to unknown COGS until an approved Group cost or direct Product cost is effective.</Alert>}
      </article>
    </section>
    <section className="product-group-detail-panel">
      <SectionHeader title="Cost-source precedence" description="One deterministic source is resolved for every Product and transaction date." />
      <div className="product-group-precedence" aria-label="Product cost source precedence"><article><strong>1</strong><span><b>Valid direct Product COGS</b><small>Manual or imported Product cost wins from its effective date.</small></span></article><ArrowRight size={16} /><article><strong>2</strong><span><b>Inherited Product Group COGS</b><small>Uses the cost and Pack Quantity effective on the transaction date.</small></span></article><ArrowRight size={16} /><article><strong>3</strong><span><b>Missing</b><small>Unknown is never represented as zero.</small></span></article></div>
    </section>
    <p className="cogs-governance-note"><History size={14} /> Group cost and membership histories are retained. Updating today’s basis never rewrites old profitability.</p>
  </div>;
}

function MembersPanel({ detail, orgSlug, canEdit, onManage }: { detail: ProductGroupDetail; orgSlug: string; canEdit: boolean; onManage: () => void }) {
  return <div className="product-group-tab-stack">
    <section className="product-group-detail-panel">
      <SectionHeader title="Effective members" description={`${detail.members.length} Company-owned Products inherit this Group basis unless a valid direct Product cost takes precedence.`} actions={canEdit ? <Button size="compact" onClick={onManage}>Manage Membership</Button> : <Badge>Read only</Badge>} />
      {detail.members.length ? <div className="product-group-table-scroll"><table><thead><tr><th>Product</th><th>Internal SKU</th><th>Pack Quantity</th><th>Effective Period</th><th>Inherited COGS</th><th>Resolved COGS</th><th>COGS Source</th><th>Listings</th></tr></thead><tbody>{detail.members.map((member) => <tr key={member.membership.id}><td data-label="Product"><Link className="product-group-member-product" href={`/o/${orgSlug}/products/${encodeURIComponent(member.product.id)}?tab=costs`}><ProductThumbnail category={member.product.category} /><strong>{member.product.title}</strong></Link></td><td data-label="Internal SKU" className="mono">{member.product.internalSku}</td><td data-label="Pack Quantity" className="numeric strong">{formatInteger(member.membership.packQuantity)}</td><td data-label="Effective Period">{formatPeriod(member.membership.effectiveFrom, member.membership.effectiveTo)}</td><td data-label="Inherited COGS" className="numeric">{member.inheritedCostMinor === null ? 'Unknown' : formatMoney(member.inheritedCostMinor, detail.currentCost?.currency ?? detail.group.currency)}</td><td data-label="Resolved COGS" className="numeric strong">{member.resolvedCogs.unitCostMinor === null ? 'Unknown' : formatMoney(member.resolvedCogs.unitCostMinor, member.resolvedCogs.currency)}</td><td data-label="COGS Source"><ProductSourceBadge member={member} /></td><td data-label="Listings"><span className="product-group-marketplaces">{member.listings.map((listing) => <MarketplaceBadge marketplace={listing.marketplace} key={listing.id} />)}</span><small>{member.listings.length} linked</small></td></tr>)}</tbody></table></div> : <EmptyState title="No current members" description="This Group has no Products with an effective membership on the selected date." />}
    </section>
    <Alert tone="info" title="Membership is effective-dated">Joining, leaving, or changing Pack Quantity creates a new historical range. Earlier transaction costs remain unchanged.</Alert>
  </div>;
}

type MembershipAction = 'add' | 'change-pack-quantity' | 'remove';

function ManageMembershipDrawer({ detail, open, onClose }: { detail: ProductGroupDetail; open: boolean; onClose: () => void }) {
  const { showToast } = useToast();
  const actions = useProductGroupActions();
  const [action, setAction] = useState<MembershipAction>('add');
  const [productId, setProductId] = useState('');
  const [packQuantity, setPackQuantity] = useState('1');
  const [effectiveFrom, setEffectiveFrom] = useState(COGS_TODAY);
  const [reason, setReason] = useState('');
  const [search, setSearch] = useState('');
  const products = useProductGroupCompanyProducts(detail.group.companyId, search, detail.group.id, effectiveFrom || COGS_TODAY);
  const options = action === 'add'
    ? (products.query.data ?? []).filter((option) => option.activeGroupId === null)
    : detail.members.map((member) => ({ product: member.product, activeGroupId: detail.group.id }));
  const selected = options.find((option) => option.product.id === productId)?.product;
  const quantity = Number(packQuantity);
  const requiresQuantity = action !== 'remove';
  const canSubmit = Boolean(selected && effectiveFrom && reason.trim()) && (!requiresQuantity || (Number.isFinite(quantity) && quantity > 0));

  function chooseAction(next: MembershipAction) {
    setAction(next);
    setProductId('');
    setPackQuantity('1');
    setReason('');
    setSearch('');
  }

  async function save() {
    if (!canSubmit || !selected) return;
    try {
      await actions.changeMembership({
        companyId: detail.group.companyId,
        groupId: detail.group.id,
        productId: selected.id,
        action,
        effectiveFrom,
        packQuantity: requiresQuantity ? quantity : undefined,
        reason: reason.trim(),
      });
      showToast(action === 'add' ? 'Product membership added with an effective date.' : action === 'remove' ? 'Product membership end date recorded.' : 'Pack Quantity history updated.', 'positive');
      onClose();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'The membership change could not be saved.', 'negative');
    }
  }

  return <Drawer open={open} onOpenChange={(next) => { if (!next) onClose(); }} title="Manage Membership" description={`${detail.group.name} · effective-dated Company Products`} footer={<Button variant="primary" disabled={!canSubmit} loading={actions.changeMembershipMutation.isPending} onClick={() => { void save(); }}>Save membership change</Button>}>
    <div className="product-group-membership-editor">
      <Alert tone="info" title="History is preserved">Joining, leaving, and Pack Quantity changes create dated membership ranges. They never rewrite an earlier transaction.</Alert>
      <Field label="Change"><Select value={action} onChange={(event) => chooseAction(event.target.value as MembershipAction)}><option value="add">Add Product</option><option value="change-pack-quantity">Change Pack Quantity</option><option value="remove">Remove Product</option></Select></Field>
      {action === 'add' ? <SearchInput aria-label="Search ungrouped Company Products" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search ungrouped Product or internal SKU" /> : null}
      <Field label="Product" hint={action === 'add' ? 'Only ungrouped Products owned by this Company are available.' : 'Only current members of this Group are available.'}><Select value={productId} onChange={(event) => setProductId(event.target.value)}><option value="">Choose Product</option>{options.map((option) => <option key={option.product.id} value={option.product.id}>{option.product.title} · {option.product.internalSku}</option>)}</Select></Field>
      {requiresQuantity ? <Field label="Pack Quantity" hint="Must be greater than zero and is stored on the new membership range."><Input type="number" min="0.0001" step="any" value={packQuantity} onChange={(event) => setPackQuantity(event.target.value)} /></Field> : null}
      <Field label={action === 'remove' ? 'Effective To' : 'Effective From'} hint={effectiveFrom ? `Stored as ${effectiveFrom}` : undefined}><UnambiguousDateInput value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} /></Field>
      <Field label="Reason" hint="Recorded in Product Group Activity."><Textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why is this membership changing?" /></Field>
      {selected ? <div className="product-group-membership-preview"><ProductThumbnail category={selected.category} /><span><strong>{selected.title}</strong><small className="mono">{selected.internalSku}</small></span><Badge tone="info">{action.replaceAll('-', ' ')}</Badge></div> : null}
    </div>
  </Drawer>;
}

function ProfitabilityPanel({ detail }: { detail: ProductGroupDetail }) {
  const total = detail.profitability;
  return <div className="product-group-tab-stack">
    {!total.complete ? <Alert tone="warning" title="Group profitability is incomplete">Known profit excludes member transactions without valid direct or inherited COGS. Coverage is {formatPercentage(total.profitabilityCoverageBps)}.</Alert> : null}
    <section className="product-group-profit-metrics" aria-label="Product Group profitability summary">
      <MetricValue label="Revenue" value={formatMoneyCompact(total.revenueMinor)} detail="Selected analytical scope" />
      <MetricValue label={total.complete ? 'COGS' : 'Known COGS'} value={formatMoneyCompact(total.cogsMinor)} detail={`${formatPercentage(total.profitabilityCoverageBps)} coverage`} />
      <MetricValue label={total.complete ? 'Net Profit' : 'Known Net Profit'} value={formatMoneyCompact(total.knownNetProfitMinor)} detail="Canonical financial engine" />
      <MetricValue label={total.complete ? 'Margin' : 'Known Margin'} value={formatPercentage(total.marginBps)} detail="Net Profit ÷ Net Revenue" />
    </section>
    <section className="product-group-detail-panel">
      <SectionHeader title="Member profitability" description="The same Phase 3 financial engine and covered-profit semantics used by Dashboard and Product profitability." actions={<TransactionsLink productGroupId={detail.group.id} />} />
      <div className="product-group-table-scroll"><table><thead><tr><th>Product</th><th>Internal SKU</th><th>COGS Source</th><th>Revenue</th><th>Known COGS</th><th>Known Net Profit</th><th>Margin</th><th>Coverage</th></tr></thead><tbody>{detail.members.map((member) => <tr key={member.membership.id}><td data-label="Product"><strong>{member.product.title}</strong></td><td data-label="Internal SKU" className="mono">{member.product.internalSku}</td><td data-label="COGS Source"><ProductSourceBadge member={member} /></td><td data-label="Revenue" className="numeric">{formatMoney(member.profitability.revenueMinor)}</td><td data-label="Known COGS" className="numeric">{formatMoney(member.profitability.cogsMinor)}</td><td data-label="Known Net Profit" className="numeric strong">{formatMoney(member.profitability.knownNetProfitMinor)}</td><td data-label="Margin" className="numeric">{formatPercentage(member.profitability.marginBps)}</td><td data-label="Coverage">{formatPercentage(member.profitability.profitabilityCoverageBps)}</td></tr>)}</tbody></table></div>
    </section>
    <p className="cogs-governance-note"><ShieldCheck size={14} /> Direct overrides, Group costs and Pack Quantity are resolved on each transaction date before financial aggregation.</p>
  </div>;
}

function CostHistoryPanel({ detail }: { detail: ProductGroupDetail }) {
  return <section className="product-group-detail-panel">
    <SectionHeader title="Effective-dated Group cost history" description="Base Quantity is stored with every record; superseded periods remain available for historical profitability." />
    {detail.costHistory.length ? <ol className="product-group-cost-history">{[...detail.costHistory].sort((left, right) => right.effectiveFrom.localeCompare(left.effectiveFrom)).map((cost) => {
      const current = detail.currentCost?.id === cost.id;
      return <li key={cost.id}><span className={current ? 'current' : undefined}><CalendarClock size={14} /></span><article><header><div><Badge tone={current ? 'positive' : cost.status === 'active' ? 'info' : 'neutral'}>{current ? 'Effective' : cost.status}</Badge><strong>{formatMoney(cost.baseCostMinor, cost.currency)} / {formatInteger(cost.baseQuantity)} {detail.group.unitOfMeasure}</strong></div><time>{formatPeriod(cost.effectiveFrom, cost.effectiveTo)}</time></header><dl><div><dt>Base Unit Cost</dt><dd>{formatUnitRate(cost.baseCostMinor, cost.baseQuantity, cost.currency)}</dd></div><div><dt>Source</dt><dd>{cost.source}</dd></div><div><dt>Created by</dt><dd>{cost.createdByName} · {formatDate(cost.createdAt)}</dd></div><div><dt>Approved by</dt><dd>{cost.approvedByName} · {formatDate(cost.approvedAt)}</dd></div><div><dt>Reason</dt><dd>{cost.reason}</dd></div></dl></article></li>;
    })}</ol> : <EmptyState title="No Group cost history" description="Members resolve to Missing COGS until an approved effective-dated Group cost exists." />}
  </section>;
}

function ActivityPanel({ detail }: { detail: ProductGroupDetail }) {
  return <section className="product-group-detail-panel">
    <SectionHeader title="Product Group activity" description="Immutable Company-scoped audit events for financial and membership changes." />
    {detail.activity.length ? <ol className="product-group-activity">{detail.activity.map((event) => <li key={event.id}><span><History size={14} /></span><article><header><strong>{event.action.replace('product-group.', '').replaceAll('-', ' ')}</strong><time dateTime={event.occurredAt}>{formatDate(event.occurredAt, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</time></header><p>{event.actorName} · {event.reason}</p><div><span>{valueText(event.previousValue)}</span><ArrowRight size={13} /><strong>{valueText(event.newValue)}</strong></div></article></li>)}</ol> : <EmptyState title="No Group activity" description="Audited Group changes will appear here." />}
  </section>;
}

function UpdateGroupCostDrawer({ detail, open, onClose }: { detail: ProductGroupDetail; open: boolean; onClose: () => void }) {
  const { showToast } = useToast();
  const actions = useProductGroupActions();
  const current = detail.currentCost;
  const [baseCost, setBaseCost] = useState(current ? (current.baseCostMinor / 100).toFixed(2) : '');
  const [baseQuantity, setBaseQuantity] = useState(String(current?.baseQuantity ?? detail.group.baseQuantity));
  const [currency, setCurrency] = useState(current?.currency ?? detail.group.currency);
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));
  const [source, setSource] = useState('Supplier invoice');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [proposal, setProposal] = useState<ProductGroupCostProposal | null>(detail.pendingProposal);
  const baseCostMinor = Number.isFinite(Number(baseCost)) && Number(baseCost) > 0 ? Math.round(Number(baseCost) * 100) : null;
  const baseQuantityValue = Number(baseQuantity);
  const canSubmit = baseCostMinor !== null && baseQuantityValue > 0 && Boolean(effectiveFrom) && Boolean(reason.trim()) && confirmed;
  const impacts = useMemo(() => detail.members.map((member) => ({
    id: member.product.id,
    name: member.product.title,
    sku: member.product.internalSku,
    packQuantity: member.membership.packQuantity,
    currentCostMinor: member.resolvedCogs.unitCostMinor,
    newCostMinor: baseCostMinor !== null && baseQuantityValue > 0 ? deriveInheritedCogsMinor(baseCostMinor, member.membership.packQuantity, baseQuantityValue) : null,
  })), [baseCostMinor, baseQuantityValue, detail.members]);

  async function createProposal() {
    if (!canSubmit || baseCostMinor === null) return;
    try {
      const created = await actions.createCostProposal({ companyId: detail.group.companyId, groupId: detail.group.id, baseCostMinor, baseQuantity: baseQuantityValue, currency, effectiveFrom, source, reason: reason.trim(), financiallyConfirmed: true });
      setProposal(created);
      showToast(actions.permissions.canApprove ? 'Cost proposal is ready for approval.' : 'Group cost submitted for approval.', 'info');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'The Group cost proposal could not be created.', 'negative');
    }
  }

  async function applyProposal() {
    if (!proposal || !actions.permissions.canApprove) return;
    try {
      const applied = await actions.applyCostProposal(proposal.id);
      setProposal(applied);
      showToast('Group cost applied and profitability recalculated.', 'positive');
      onClose();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'The Group cost proposal could not be applied.', 'negative');
    }
  }

  const footer = proposal?.status === 'awaiting-approval' && actions.permissions.canApprove
    ? <Button variant="primary" loading={actions.applyCostProposalMutation.isPending} onClick={() => { void applyProposal(); }}>Approve and apply</Button>
    : proposal
      ? <Badge tone={proposalTone(proposal.status)}>{proposal.status.replaceAll('-', ' ')}</Badge>
      : <Button variant="primary" disabled={!canSubmit} loading={actions.createCostProposalMutation.isPending} onClick={() => { void createProposal(); }}>{actions.permissions.canApprove ? 'Continue to approval' : 'Submit for approval'}</Button>;

  return <Drawer open={open} onOpenChange={(next) => { if (!next) onClose(); }} title="Update Group Cost" description={`${detail.group.name} · ${detail.companyName}`} footer={footer}>
    <div className="product-group-cost-update">
      {proposal ? <Alert tone={proposal.status === 'awaiting-approval' ? 'info' : proposal.status === 'applied' ? 'positive' : 'warning'} title={`Proposal ${proposal.status.replaceAll('-', ' ')}`}>{proposal.status === 'awaiting-approval' ? actions.permissions.canApprove ? 'Review the exact impact again, then explicitly approve and apply.' : 'A user with cogs.approve must approve this financial change.' : 'The governed proposal status is shown above.'}</Alert> : null}
      <div className="product-group-form-grid two">
        <Field label="New Base Cost"><Input inputMode="decimal" value={baseCost} onChange={(event) => { setBaseCost(event.target.value); setConfirmed(false); setProposal(null); }} /></Field>
        <Field label="Base Quantity"><Input type="number" min="0.0001" step="any" value={baseQuantity} onChange={(event) => { setBaseQuantity(event.target.value); setConfirmed(false); setProposal(null); }} /></Field>
        <Field label="Currency"><Select value={currency} onChange={(event) => { setCurrency(event.target.value); setConfirmed(false); setProposal(null); }}><option value="GBP">GBP</option><option value="EUR">EUR</option><option value="USD">USD</option></Select></Field>
        <Field label="Effective From" hint={effectiveFrom ? `Stored as ${effectiveFrom}` : undefined}><UnambiguousDateInput value={effectiveFrom} onChange={(event) => { setEffectiveFrom(event.target.value); setConfirmed(false); setProposal(null); }} /></Field>
        <Field label="Source"><Select value={source} onChange={(event) => { setSource(event.target.value); setProposal(null); }}><option>Supplier invoice</option><option>Supplier price list</option><option>Contract</option><option>Manual review</option></Select></Field>
        <Field label="Reason"><Textarea rows={3} value={reason} onChange={(event) => { setReason(event.target.value); setConfirmed(false); setProposal(null); }} placeholder="Why is the Group cost changing?" /></Field>
      </div>
      <section className="product-group-impact-preview" aria-labelledby="group-impact-title">
        <header><div><span className="eyebrow">Financial preview</span><h3 id="group-impact-title">Current and new member impact</h3></div><Sparkles size={17} /></header>
        <div className="product-group-impact-summary"><span /><strong>Current</strong><strong>New</strong><span>Base Cost</span><b>{current ? formatMoney(current.baseCostMinor, current.currency) : 'Missing'}</b><b>{baseCostMinor === null ? '—' : formatMoney(baseCostMinor, currency)}</b><span>Base Unit Cost</span><b>{current ? formatUnitRate(current.baseCostMinor, current.baseQuantity, current.currency) : 'Missing'}</b><b>{baseCostMinor === null ? '—' : formatUnitRate(baseCostMinor, baseQuantityValue, currency)}</b></div>
        <div className="product-group-impact-members"><div><strong>Member / SKU</strong><strong>Current</strong><strong>New</strong></div>{impacts.map((impact) => <div key={impact.id}><span><b>{impact.sku}</b><small>{impact.name} · pack {formatInteger(impact.packQuantity)}</small></span><span>{formatMoney(impact.currentCostMinor, current?.currency ?? currency)}</span><strong>{impact.newCostMinor === null ? 'Unknown' : formatMoney(impact.newCostMinor, currency)}</strong></div>)}</div>
        <p><Info size={13} /> The preview derives every Product from the full base ratio, rounding only once at the final minor-unit boundary.</p>
      </section>
      {!proposal ? <div className="product-group-financial-check"><Checkbox checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} label="I have reviewed the Base Cost, Base Quantity, member impact and effective date." /><small>Required before the financial proposal can enter approval.</small></div> : null}
    </div>
  </Drawer>;
}

export function ProductGroupDetailPage({ groupId }: { groupId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const { workspace, context } = useAnalysisContext();
  const detailQuery = useProductGroup(groupId);
  const actions = useProductGroupActions();
  const orgSlug = workspace.organisation.slug;
  const activeTab = activeTabFor(searchParams.get('tab'));
  const updateOpen = searchParams.get('action') === 'update-cost';
  const membershipOpen = searchParams.get('action') === 'manage-members';

  function updateUrl(values: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString());
    Object.entries(values).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key));
    router.replace(`${window.location.pathname}${next.size ? `?${next}` : ''}`, { scroll: false });
  }

  if (!detailQuery.access.allowed) return <AccessState decision={detailQuery.access} />;
  if (detailQuery.query.isPending) return <ProductGroupDetailLoading />;
  if (detailQuery.query.isError) return <div className="cogs-page product-group-detail-page"><ErrorState title="Product Group could not be loaded" description="No costs or memberships were changed." onRetry={() => { void detailQuery.query.refetch(); }} /></div>;
  const detail = detailQuery.query.data;
  if (!detail) return <div className="cogs-page product-group-detail-page"><Breadcrumbs items={[{ label: 'COGS', href: `/o/${orgSlug}/cogs` }, { label: 'Product Groups', href: `/o/${orgSlug}/cogs/groups` }, { label: 'Not found' }]} /><EmptyState title="Product Group not found" description="This Group does not exist or falls outside your Company assignment." /><Link className="ui-button secondary compact product-group-back-link" href={`/o/${orgSlug}/cogs/groups`}>Back to Product Groups</Link></div>;

  const current = detail.currentCost;
  let panel: React.ReactNode;
  if (activeTab === 'overview') panel = <OverviewPanel detail={detail} orgSlug={orgSlug} />;
  else if (activeTab === 'members') panel = <MembersPanel detail={detail} orgSlug={orgSlug} canEdit={detailQuery.permissions.canEdit} onManage={() => updateUrl({ action: 'manage-members' })} />;
  else if (activeTab === 'profitability') panel = detailQuery.permissions.canViewProfitability ? <ProfitabilityPanel detail={detail} /> : <AccessState decision={{ allowed: false, reason: 'capability_missing' }} />;
  else if (activeTab === 'cost-history') panel = <CostHistoryPanel detail={detail} />;
  else panel = detailQuery.permissions.canViewAudit ? <ActivityPanel detail={detail} /> : <AccessState decision={{ allowed: false, reason: 'capability_missing' }} />;
  const pendingProposal = detail.pendingProposal;

  async function applyPendingProposal() {
    if (!pendingProposal || !actions.permissions.canApprove) return;
    try {
      await actions.applyCostProposal(pendingProposal.id);
      showToast('Group cost applied and profitability recalculated.', 'positive');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'The Group cost proposal could not be applied.', 'negative');
    }
  }

  return <div className="cogs-page product-group-detail-page">
    <Breadcrumbs items={[{ label: workspace.organisation.name }, { label: 'COGS', href: `/o/${orgSlug}/cogs` }, { label: 'Product Groups', href: `/o/${orgSlug}/cogs/groups` }, { label: detail.group.name }]} />
    <CogsSubNavigation orgSlug={orgSlug} active="groups" companyId={context.companyId} />
    <section className="product-group-detail-hero" aria-labelledby="product-group-title">
      <div className="product-group-detail-identity"><span><Layers3 size={22} /></span><div><p className="eyebrow">Inherited COGS · {detail.companyName}</p><h1 id="product-group-title">{detail.group.name}</h1><p>{detail.group.description}</p><div><Badge tone={detail.group.status === 'active' ? 'positive' : 'neutral'}>{detail.group.status}</Badge><span>Base Product <b>{detail.group.baseProduct.title}</b></span></div></div></div>
      <div className="product-group-detail-actions">{detailQuery.permissions.canEdit ? <Button variant="primary" size="compact" onClick={() => updateUrl({ action: 'update-cost' })}>Update Group Cost</Button> : <Badge>Read only</Badge>}<Button size="compact" onClick={() => document.querySelector<HTMLButtonElement>('.copilot-button')?.click()}><Sparkles size={14} /> Ask Copilot</Button></div>
      <dl><div><dt>Current Base Cost</dt><dd>{current ? formatMoney(current.baseCostMinor, current.currency) : 'Missing'}</dd></div><div><dt>Base Quantity</dt><dd>{formatInteger(current?.baseQuantity ?? detail.group.baseQuantity)} {detail.group.unitOfMeasure}</dd></div><div><dt>Base Unit Cost</dt><dd>{current ? formatUnitRate(current.baseCostMinor, current.baseQuantity, current.currency) : 'Missing'}</dd></div><div><dt>Members</dt><dd>{formatInteger(detail.members.length)}</dd></div><div><dt>Effective From</dt><dd>{current ? formatDate(current.effectiveFrom) : '—'}</dd></div></dl>
    </section>
    {detail.pendingProposal ? <Alert tone={proposalTone(detail.pendingProposal.status) === 'negative' ? 'negative' : proposalTone(detail.pendingProposal.status) === 'positive' ? 'positive' : 'info'} title={`Group cost proposal ${detail.pendingProposal.status.replaceAll('-', ' ')}`}>{detail.pendingProposal.status === 'awaiting-approval' ? <span>{formatMoney(detail.pendingProposal.proposedBaseCostMinor, detail.pendingProposal.proposedCurrency)} effective {formatDate(detail.pendingProposal.effectiveFrom)}. {actions.permissions.canApprove ? <Button size="compact" loading={actions.applyCostProposalMutation.isPending} onClick={() => { void applyPendingProposal(); }}>Approve and apply</Button> : 'A cogs.approve user must approve it.'}</span> : 'The latest governed proposal remains visible until the Group detail refreshes.'}</Alert> : null}
    <section className="product-group-detail-tabs">
      <div role="tablist" aria-label="Product Group detail sections">{TABS.map((tab, index) => <button id={`product-group-tab-${tab.id}`} type="button" role="tab" aria-selected={activeTab === tab.id} aria-controls={`product-group-panel-${tab.id}`} tabIndex={activeTab === tab.id ? 0 : -1} key={tab.id} onClick={() => updateUrl({ tab: tab.id === 'overview' ? null : tab.id, action: null })} onKeyDown={(event) => {
        let nextIndex = index;
        if (event.key === 'ArrowRight') nextIndex = (index + 1) % TABS.length;
        else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + TABS.length) % TABS.length;
        else if (event.key === 'Home') nextIndex = 0;
        else if (event.key === 'End') nextIndex = TABS.length - 1;
        else return;
        event.preventDefault();
        const next = TABS[nextIndex];
        updateUrl({ tab: next.id === 'overview' ? null : next.id, action: null });
        document.getElementById(`product-group-tab-${next.id}`)?.focus();
      }}>{tab.label}{tab.id === 'members' ? ` (${detail.members.length})` : ''}</button>)}</div>
      <div id={`product-group-panel-${activeTab}`} role="tabpanel" aria-labelledby={`product-group-tab-${activeTab}`} tabIndex={0}>{panel}</div>
    </section>
    <p className="cogs-governance-note"><ShieldCheck size={14} /> Product Group access is restricted to authorised Companies. Marketplace listing data remains a linked, read-only projection.</p>
    {detailQuery.permissions.canEdit ? <UpdateGroupCostDrawer key={`${detail.group.id}:${current?.id ?? 'missing'}`} detail={detail} open={updateOpen} onClose={() => updateUrl({ action: null })} /> : null}
    {detailQuery.permissions.canEdit ? <ManageMembershipDrawer key={`${detail.group.id}:${detail.members.map((member) => member.membership.id).join(':')}`} detail={detail} open={membershipOpen} onClose={() => updateUrl({ action: null })} /> : null}
  </div>;
}
