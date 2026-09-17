'use client';

import Link from 'next/link';
import { useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Calculator, Check, Info, Layers3, Plus, ShieldCheck, X } from 'lucide-react';
import { useAnalysisContext } from '@/src/components/providers/analysis-context-provider';
import { AccessState } from '@/src/components/rbac/access';
import { PageHeader } from '@/src/components/product/patterns';
import { Button, IconButton } from '@/src/components/ui/actions';
import { Alert, Badge, useToast } from '@/src/components/ui/feedback';
import { Checkbox, Field, Input, SearchInput, Select, Textarea, UnambiguousDateInput } from '@/src/components/ui/forms';
import { Breadcrumbs } from '@/src/components/ui/navigation';
import { formatInteger, formatMoney } from '@/src/domain/calculations';
import { deriveInheritedCogsMinor } from '@/src/domain/product-groups';
import { ProductThumbnail } from '@/src/features/products/product-thumbnail';
import type { ProductGroupProductOption } from '@/src/services/product-groups-contracts';
import { useProductGroupActions, useProductGroupCompanyProducts } from '@/src/services/hooks/use-product-groups';
import { CogsSubNavigation } from './cogs-sub-navigation';

interface SelectedMember {
  product: ProductGroupProductOption['product'];
  listingCount: number;
  packQuantity: string;
}

function parseMoneyMinor(value: string) {
  const amount = Number(value.replaceAll(',', '').trim());
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const minor = Math.round(amount * 100);
  return Number.isSafeInteger(minor) && minor > 0 ? minor : null;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function CreateProductGroupPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const { workspace, context, authorisedCompanies, setCompany } = useAnalysisContext();
  const actions = useProductGroupActions();
  const orgSlug = workspace.organisation.slug;
  const initialCompanyId = context.companyId === 'all' ? authorisedCompanies[0]?.id ?? '' : context.companyId;
  const [companyId, setCompanyId] = useState(initialCompanyId);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [baseProductId, setBaseProductId] = useState('');
  const [baseQuantity, setBaseQuantity] = useState('1000');
  const [unitOfMeasure, setUnitOfMeasure] = useState('units');
  const [currency, setCurrency] = useState('GBP');
  const [baseCost, setBaseCost] = useState('100.00');
  const [effectiveFrom, setEffectiveFrom] = useState(todayIso());
  const [source, setSource] = useState('Supplier invoice');
  const [reason, setReason] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [members, setMembers] = useState<Record<string, SelectedMember>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const products = useProductGroupCompanyProducts(companyId, productSearch);
  const options = useMemo(() => products.query.data ?? [], [products.query.data]);
  const selectedMembers = useMemo(() => Object.values(members), [members]);
  const baseQuantityNumber = Number(baseQuantity);
  const baseCostMinor = parseMoneyMinor(baseCost);
  const validMembers = selectedMembers.filter((member) => Number(member.packQuantity) > 0);
  const baseProduct = options.find((option) => option.product.id === baseProductId)?.product ?? selectedMembers.find((member) => member.product.id === baseProductId)?.product;
  const errors = {
    name: attempted && !name.trim() ? 'Group Name is required.' : undefined,
    company: attempted && !companyId ? 'Company is required.' : undefined,
    baseProduct: attempted && !baseProductId ? 'Choose a Base Product owned by this Company.' : undefined,
    baseQuantity: attempted && (!Number.isFinite(baseQuantityNumber) || baseQuantityNumber <= 0) ? 'Base Quantity must be greater than zero.' : undefined,
    baseCost: attempted && baseCostMinor === null ? 'Base Cost must be greater than zero.' : undefined,
    reason: attempted && !reason.trim() ? 'A financial reason is required.' : undefined,
    members: attempted && !selectedMembers.length ? 'Select at least one existing Product.' : undefined,
    memberQuantity: attempted && validMembers.length !== selectedMembers.length ? 'Every selected Product needs a Pack Quantity greater than zero.' : undefined,
    confirmation: attempted && !confirmed ? 'Confirm the financial basis before creating the Group.' : undefined,
  };
  const hasErrors = Object.values(errors).some(Boolean);

  function chooseCompany(nextCompanyId: string) {
    setCompanyId(nextCompanyId);
    setCompany(nextCompanyId);
    setBaseProductId('');
    setMembers({});
    setConfirmed(false);
  }

  function toggleMember(option: ProductGroupProductOption) {
    const product = option.product;
    setMembers((current) => {
      if (current[product.id]) {
        const next = { ...current };
        delete next[product.id];
        return next;
      }
      return { ...current, [product.id]: { product, listingCount: option.listingCount, packQuantity: '1' } };
    });
    setConfirmed(false);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setAttempted(true);
    if (hasErrors || !baseProduct || baseCostMinor === null) return;
    try {
      const created = await actions.createGroup({
        companyId,
        name: name.trim(),
        description: description.trim(),
        baseProductId,
        baseQuantity: baseQuantityNumber,
        unitOfMeasure,
        currency,
        baseCostMinor,
        effectiveFrom,
        source,
        reason: reason.trim(),
        members: selectedMembers.map((member) => ({ productId: member.product.id, packQuantity: Number(member.packQuantity), effectiveFrom })),
      });
      showToast(`${created.group.name} was created with effective-dated member costs.`, 'positive');
      router.push(`/o/${orgSlug}/cogs/groups/${encodeURIComponent(created.group.id)}`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'The Product Group could not be created.', 'negative');
    }
  }

  if (!actions.access.allowed) return <AccessState decision={actions.access} />;
  if (!actions.permissions.canEdit) return <AccessState decision={{ allowed: false, reason: 'capability_missing' }} />;

  return <div className="cogs-page product-group-create-page">
    <Breadcrumbs items={[{ label: workspace.organisation.name }, { label: 'COGS', href: `/o/${orgSlug}/cogs` }, { label: 'Product Groups', href: `/o/${orgSlug}/cogs/groups` }, { label: 'Create' }]} />
    <PageHeader eyebrow="Inherited COGS" title="Create Product Group" description="Define one Company-owned costing basis and the Products that inherit from it." actions={<Link className="ui-button secondary compact" href={`/o/${orgSlug}/cogs/groups`}>Cancel</Link>} />
    <CogsSubNavigation orgSlug={orgSlug} active="groups" companyId={context.companyId} />
    <Alert tone="info" title="Group setup is human-controlled">Copilot can suggest likely groupings and pack quantities, but cannot create a Group, attach Products, set costs or approve this financial change.</Alert>
    <form className="product-group-create-form" onSubmit={submit} noValidate>
      <section className="product-group-form-panel" aria-labelledby="group-identity-title">
        <header><span><Layers3 size={17} /></span><div><h2 id="group-identity-title">Group identity</h2><p>A Product Group belongs to exactly one Company and does not replace the Product catalogue.</p></div></header>
        <div className="product-group-form-grid two">
          <Field label="Group Name" error={errors.name}><Input value={name} onChange={(event) => { setName(event.target.value); setConfirmed(false); }} placeholder="e.g. Disposable Gloves" autoFocus /></Field>
          <Field label="Company" error={errors.company}><Select value={companyId} onChange={(event) => chooseCompany(event.target.value)}><option value="">Choose Company</option>{authorisedCompanies.map((company) => <option value={company.id} key={company.id}>{company.name}</option>)}</Select></Field>
          <Field label="Description"><Textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Explain which Product variants share this costing basis." /></Field>
          <Field label="Base Product" hint="An existing ungrouped Product owned by the selected Company." error={errors.baseProduct}><Select value={baseProductId} onChange={(event) => { setBaseProductId(event.target.value); setConfirmed(false); }} disabled={!companyId || products.query.isPending}><option value="">Choose Base Product</option>{options.map((option) => <option key={option.product.id} value={option.product.id}>{option.product.title} · {option.product.internalSku}</option>)}</Select></Field>
        </div>
      </section>

      <section className="product-group-form-panel" aria-labelledby="costing-basis-title">
        <header><span><Calculator size={17} /></span><div><h2 id="costing-basis-title">Costing basis</h2><p>The base ratio is stored with each approved cost record so historical calculations remain correct.</p></div></header>
        <div className="product-group-form-grid four">
          <Field label="Base Quantity" error={errors.baseQuantity}><Input type="number" min="0.0001" step="any" value={baseQuantity} onChange={(event) => { setBaseQuantity(event.target.value); setConfirmed(false); }} /></Field>
          <Field label="Unit of Measure"><Select value={unitOfMeasure} onChange={(event) => setUnitOfMeasure(event.target.value)}><option value="units">Units</option><option value="pairs">Pairs</option><option value="rolls">Rolls</option><option value="metres">Metres</option><option value="litres">Litres</option><option value="kilograms">Kilograms</option></Select></Field>
          <Field label="Currency"><Select value={currency} onChange={(event) => setCurrency(event.target.value)}><option value="GBP">GBP</option><option value="EUR">EUR</option><option value="USD">USD</option></Select></Field>
          <Field label="Base Cost" hint="Enter the cost for the full Base Quantity." error={errors.baseCost}><Input inputMode="decimal" value={baseCost} onChange={(event) => { setBaseCost(event.target.value); setConfirmed(false); }} placeholder="100.00" /></Field>
          <Field label="Effective From" hint={effectiveFrom ? `Stored as ${effectiveFrom}` : undefined}><UnambiguousDateInput value={effectiveFrom} onChange={(event) => { setEffectiveFrom(event.target.value); setConfirmed(false); }} /></Field>
          <Field label="Source"><Select value={source} onChange={(event) => setSource(event.target.value)}><option>Supplier invoice</option><option>Supplier price list</option><option>Contract</option><option>Initial setup</option><option>Manual review</option></Select></Field>
          <Field label="Reason" error={errors.reason}><Textarea rows={3} value={reason} onChange={(event) => { setReason(event.target.value); setConfirmed(false); }} placeholder="Why this financial basis is being created" /></Field>
          <div className="product-group-ratio-preview"><small>Base Unit Cost</small><strong>{baseCostMinor !== null && baseQuantityNumber > 0 ? new Intl.NumberFormat('en-GB', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(baseCostMinor / baseQuantityNumber / 100) : '—'}</strong><span>{baseCostMinor !== null ? `${formatMoney(baseCostMinor, currency)} ÷ ${formatInteger(baseQuantityNumber || 0)}` : 'Enter a valid cost basis'}</span></div>
        </div>
      </section>

      <section className="product-group-form-panel" aria-labelledby="group-members-title">
        <header><span><Plus size={17} /></span><div><h2 id="group-members-title">Group members</h2><p>Select existing Products owned by {authorisedCompanies.find((company) => company.id === companyId)?.name ?? 'this Company'} and provide each Pack Quantity.</p></div><Badge>{selectedMembers.length} selected</Badge></header>
        {errors.members || errors.memberQuantity ? <Alert tone="warning" title="Member details need attention">{errors.members ?? errors.memberQuantity}</Alert> : null}
        <SearchInput aria-label="Search Company Products" placeholder="Search Product or internal SKU" value={productSearch} onChange={(event) => setProductSearch(event.target.value)} />
        <div className="product-group-product-picker" aria-label="Available Company Products">
          {products.query.isPending ? <p className="product-group-inline-state">Loading Company Products…</p> : options.length ? options.map((option) => {
            const product = option.product;
            const selected = Boolean(members[product.id]);
            return <button type="button" className={selected ? 'selected' : undefined} key={product.id} aria-pressed={selected} onClick={() => toggleMember(option)}><ProductThumbnail category={product.category} /><span><strong>{product.title}</strong><small className="mono">{product.internalSku}</small></span><span>{option.listingCount} listing{option.listingCount === 1 ? '' : 's'}</span>{selected ? <Check size={15} /> : <Plus size={15} />}</button>;
          }) : <p className="product-group-inline-state">No ungrouped Products match this Company and search.</p>}
        </div>
        {selectedMembers.length ? <div className="product-group-member-preview">
          <header><div><h3>Live inherited-cost calculation</h3><p>Calculated once in minor units: round(Base Cost Minor × Pack Quantity ÷ Base Quantity).</p></div><ShieldCheck size={17} /></header>
          <div className="product-group-table-scroll"><table><thead><tr><th>Product</th><th>Internal SKU</th><th>Pack Quantity</th><th>Conversion %</th><th>Inherited COGS</th><th><span className="sr-only">Remove</span></th></tr></thead><tbody>{selectedMembers.map((member) => {
            const packQuantity = Number(member.packQuantity);
            const inherited = baseCostMinor !== null && packQuantity > 0 && baseQuantityNumber > 0 ? deriveInheritedCogsMinor(baseCostMinor, packQuantity, baseQuantityNumber) : null;
            const option = options.find((candidate) => candidate.product.id === member.product.id) ?? { product: member.product, listingCount: member.listingCount, marketplaces: [], marketplaceAccountIds: [], activeGroupId: null, activeGroupName: null };
            return <tr key={member.product.id}><td data-label="Product"><strong>{member.product.title}</strong></td><td data-label="Internal SKU" className="mono">{member.product.internalSku}</td><td data-label="Pack Quantity"><Input aria-label={`Pack Quantity for ${member.product.title}`} type="number" min="0.0001" step="any" value={member.packQuantity} onChange={(event) => { const value = event.target.value; setMembers((current) => ({ ...current, [member.product.id]: { ...current[member.product.id], packQuantity: value } })); setConfirmed(false); }} /></td><td data-label="Conversion %" className="numeric">{packQuantity > 0 && baseQuantityNumber > 0 ? `${((packQuantity / baseQuantityNumber) * 100).toFixed(2)}%` : '—'}</td><td data-label="Inherited COGS"><strong className="numeric">{inherited === null ? 'Unknown' : formatMoney(inherited, currency)}</strong></td><td><IconButton label={`Remove ${member.product.title}`} onClick={() => toggleMember(option)}><X size={14} /></IconButton></td></tr>;
          })}</tbody></table></div>
        </div> : null}
      </section>

      <section className="product-group-confirmation" aria-labelledby="group-confirm-title">
        <Info size={18} />
        <div><h2 id="group-confirm-title">Financial confirmation</h2><p>This creates effective-dated Group cost and membership records. Direct Product COGS will continue to take precedence from its own effective date.</p><Checkbox checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} label="I have reviewed the Base Quantity, Base Cost, Pack Quantities and effective date." />{errors.confirmation ? <small role="alert">{errors.confirmation}</small> : null}</div>
      </section>
      <footer className="product-group-form-actions"><Link className="ui-button secondary default" href={`/o/${orgSlug}/cogs/groups`}>Cancel</Link><Button variant="primary" type="submit" loading={actions.createGroupMutation.isPending}>Create Product Group</Button></footer>
    </form>
  </div>;
}
