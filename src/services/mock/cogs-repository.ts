import type { AuditEvent, COGSRecord } from '@/src/domain/models';
import { insertApprovedCogsRecord, normaliseCogsCurrency } from '@/src/domain/cogs';
import type { CogsCoverage, CostImportPreviewRow, OnboardingProduct } from '@/src/domain/onboarding';
import type {
  ApplyCostImportInput,
  InitialCogsRepository,
  PreviewCostImportInput,
  SaveInitialCostInput,
} from '@/src/services/onboarding-contracts';
import type { ScenarioId } from '@/src/fixtures/scenarios';
import { mockDelay } from '@/src/services/mock/mock-delay';
import {
  MockOnboardingStore,
  type MockOnboardingState,
  OnboardingServiceError,
  mockOnboardingStore,
  requireOrganisationId,
} from '@/src/services/mock/onboarding-store';
import {
  MockCogsManagementStore,
  mockCogsManagementStore,
} from '@/src/services/mock/cogs-management-store';

function coverageFor(organisationId: string, imported: number, covered: number): CogsCoverage {
  const safeCovered = Math.min(imported, Math.max(0, covered));
  return {
    organisationId,
    productsImported: imported,
    cogsComplete: safeCovered,
    cogsMissing: Math.max(0, imported - safeCovered),
    coveragePercent: imported ? Math.round((safeCovered / imported) * 100) : 0,
    reliableProfitability: imported > 0 && safeCovered === imported,
  };
}

function scenarioCoverage(base: CogsCoverage, scenarioId?: ScenarioId) {
  if (scenarioId === 'cogs-none') return coverageFor(base.organisationId, base.productsImported, 0);
  if (scenarioId === 'partial-cogs') return coverageFor(base.organisationId, base.productsImported, Math.round(base.productsImported * 0.64));
  return base;
}

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function ensureSamples(store: MockOnboardingStore, sessionId: string) {
  return store.transaction((draft) => {
    const organisationId = requireOrganisationId(draft, sessionId);
    const cogs = draft.cogs[organisationId];
    if (!cogs) throw new OnboardingServiceError('not_found', 'COGS setup could not be found.');
    if (cogs.importedProductCount < 1) throw new OnboardingServiceError('prerequisite', 'Wait for marketplace products to import before adding costs.');
    if (!cogs.sampleProducts.length) {
      const connectedCompanyId = Object.values(draft.marketplaceAccounts).find((account) => account.organisationId === organisationId && account.connectionStatus !== 'disconnected')?.companyId;
      const company = Object.values(draft.companies).find((item) => item.organisationId === organisationId && item.id === connectedCompanyId)
        ?? Object.values(draft.companies).find((item) => item.organisationId === organisationId);
      if (!company) throw new OnboardingServiceError('prerequisite', 'Create a company before importing product costs.');
      const names = ['Blue Nitrile Gloves XL', 'Heavy Duty Refuse Sacks', 'Microfibre Cleaning Cloths', 'C-Fold Hand Towels', 'Industrial Floor Cleaner', 'Packing Tape', 'Bubble Wrap Rolls', 'Safety Glasses'];
      cogs.sampleProducts = names.map((name, index): OnboardingProduct => {
        const sku = `ONB-${String(index + 1).padStart(4, '0')}`;
        return {
          id: store.createId('prd'),
          organisationId,
          ownerCompanyId: company.id,
          internalSku: sku,
          title: name,
          status: 'active',
          createdAt: '2026-08-01T09:00:00.000Z',
          updatedAt: '2026-08-01T09:00:00.000Z',
          companyId: company.id,
          sku,
          name,
          asin: index < 6 ? `B0TEST${String(index + 1).padStart(4, '0')}` : null,
        };
      });
    }
    return cogs.sampleProducts;
  });
}

export class MockInitialCogsRepository implements InitialCogsRepository {
  constructor(
    private readonly store: MockOnboardingStore = mockOnboardingStore,
    private readonly canonicalStore: MockCogsManagementStore = mockCogsManagementStore,
  ) {}

  private commitWithCanonical<T extends { records?: COGSRecord[]; record?: COGSRecord }>(mutate: (draft: MockOnboardingState) => T) {
    const onboardingBefore = this.store.read();
    const canonicalBefore = this.canonicalStore.read();
    try {
      const result = this.store.transaction(mutate);
      this.publishApprovedRecords(result.records ?? (result.record ? [result.record] : []));
      return result;
    } catch (error) {
      this.store.restore(onboardingBefore);
      this.canonicalStore.restore(canonicalBefore);
      if (error instanceof OnboardingServiceError) throw error;
      throw new OnboardingServiceError('processing_failed', 'Approved costs could not be committed. No costs were changed.');
    }
  }

  private publishApprovedRecords(records: readonly COGSRecord[]) {
    if (!records.length) return;
    const onboarding = this.store.read();
    const organisationId = records[0].organisationId;
    const organisationCompanies = Object.values(onboarding.companies).filter((company) => company.organisationId === organisationId);
    const samples = onboarding.cogs[organisationId]?.sampleProducts ?? [];
    const canonicalRecords = records.map((record) => {
      const sample = samples.find((candidate) => candidate.id === record.productId);
      const sampleIndex = sample ? samples.findIndex((candidate) => candidate.id === sample.id) : -1;
      const companyIndex = sample ? organisationCompanies.findIndex((company) => company.id === sample.ownerCompanyId) : -1;
      const productId = sampleIndex >= 0 && companyIndex >= 0
        ? `${organisationId}:product-${companyIndex + 1}-${String(sampleIndex + 1).padStart(3, '0')}`
        : record.productId;
      return { ...record, productId, sourceReferenceId: record.sourceReferenceId ?? `onboarding:${record.id}` };
    });

    this.canonicalStore.transaction((draft) => {
      const organisation = this.canonicalStore.ensureOrganisation(draft, organisationId);
      for (const record of canonicalRecords) {
        const inserted = insertApprovedCogsRecord(organisation.recordsByProduct[record.productId] ?? [], record);
        organisation.recordsByProduct[record.productId] = inserted.history;
        draft.sequence += 1;
        const audit: AuditEvent = {
          id: `audit-onboarding-cogs-${String(draft.sequence).padStart(6, '0')}`,
          organisationId,
          actor: { type: 'user', userId: record.approvedByUserId },
          action: 'cogs.changed',
          target: { type: 'product', id: record.productId },
          occurredAt: record.approvedAt,
          previousValue: inserted.previous ? { unitCostMinor: inserted.previous.unitCostMinor, currency: inserted.previous.currency, effectiveFrom: inserted.previous.effectiveFrom, effectiveTo: inserted.previous.effectiveTo } : null,
          newValue: { createdRecordId: inserted.created.id, previousRecordId: inserted.previous?.id, unitCostMinor: record.unitCostMinor, currency: record.currency, effectiveFrom: record.effectiveFrom, effectiveTo: inserted.created.effectiveTo, source: record.source, sourceReferenceId: record.sourceReferenceId },
          reason: record.reason,
        };
        organisation.auditEvents.unshift(audit);
      }
    });
  }

  /** Remove only records published by onboarding and unwind the ranges they changed. */
  resetPublishedRecords(snapshot: MockOnboardingState = this.store.read()) {
    const sourceReferences = new Set([
      ...Object.keys(snapshot.costImports),
      ...Object.keys(snapshot.sessions).map((sessionId) => `onboarding:${sessionId}`),
    ]);
    const organisationIds = new Set(Object.keys(snapshot.organisations));
    const isOnboardingReference = (value: unknown) => typeof value === 'string'
      && (value.startsWith('onboarding:') || sourceReferences.has(value));
    const asRecord = (value: unknown): Record<string, unknown> | null => value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;

    this.canonicalStore.transaction((draft) => {
      organisationIds.forEach((organisationId) => {
        const organisation = draft.organisations[organisationId];
        if (!organisation) return;
        const resetAuditIds = new Set<string>();
        organisation.auditEvents.forEach((event) => {
          const next = asRecord(event.newValue);
          if (!isOnboardingReference(next?.sourceReferenceId)) return;
          resetAuditIds.add(event.id);
          const previousId = next?.previousRecordId;
          const previous = asRecord(event.previousValue);
          if (typeof previousId !== 'string' || !previous) return;
          for (const history of Object.values(organisation.recordsByProduct)) {
            const record = history.find((candidate) => candidate.id === previousId);
            if (!record) continue;
            if (typeof previous.unitCostMinor === 'number') record.unitCostMinor = previous.unitCostMinor;
            if (typeof previous.currency === 'string') record.currency = previous.currency;
            if (typeof previous.effectiveFrom === 'string') record.effectiveFrom = previous.effectiveFrom;
            if (previous.effectiveTo === null || typeof previous.effectiveTo === 'string') record.effectiveTo = previous.effectiveTo;
            record.status = 'active';
            break;
          }
        });
        Object.entries(organisation.recordsByProduct).forEach(([productId, history]) => {
          const retained = history.filter((record) => !isOnboardingReference(record.sourceReferenceId));
          const active = retained.filter((record) => record.status === 'active').sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom));
          active.forEach((record, index) => {
            const next = active[index + 1];
            if (next && (record.effectiveTo === null || record.effectiveTo > next.effectiveFrom)) record.effectiveTo = next.effectiveFrom;
          });
          if (retained.length) organisation.recordsByProduct[productId] = retained;
          else delete organisation.recordsByProduct[productId];
        });
        organisation.auditEvents = organisation.auditEvents.filter((event) => !resetAuditIds.has(event.id));
      });
    });
  }

  async getCoverage(sessionId: string, scenarioId?: ScenarioId, signal?: AbortSignal) {
    await mockDelay(220, signal);
    const state = this.store.read();
    const organisationId = requireOrganisationId(state, sessionId);
    const cogs = state.cogs[organisationId];
    if (!cogs) throw new OnboardingServiceError('not_found', 'COGS setup could not be found.');
    return scenarioCoverage(coverageFor(organisationId, cogs.importedProductCount, cogs.coveredProductCount), scenarioId);
  }

  async listProducts(sessionId: string, signal?: AbortSignal) {
    await mockDelay(220, signal);
    return ensureSamples(this.store, sessionId);
  }

  async previewImport(input: PreviewCostImportInput, signal?: AbortSignal) {
    await mockDelay(620, signal);
    if (!input.file.name.trim() || input.file.size <= 0) throw new OnboardingServiceError('validation', 'Choose a non-empty CSV or spreadsheet file.');
    const products = ensureSamples(this.store, input.sessionId);
    const result = this.store.transaction((draft) => {
      const organisationId = requireOrganisationId(draft, input.sessionId);
      const hasErrors = input.scenarioId === 'import-errors';
      const rows: CostImportPreviewRow[] = products.map((product, index) => ({
        id: this.store.createId('cost-row'),
        productId: hasErrors && index === products.length - 1 ? null : product.id,
        sku: hasErrors && index === 1 ? products[0].sku : product.sku,
        asin: product.asin,
        productName: product.name,
        unitCostMinor: hasErrors && index === 2 ? 0 : 315 + index * 87,
        currency: 'GBP',
        effectiveFrom: '2026-08-29',
        matchStatus: hasErrors && index === products.length - 1 ? 'unmatched' : index > 5 ? 'suggested' : 'exact',
        confidence: hasErrors && index === products.length - 1 ? null : index > 5 ? 0.78 : 1,
        anomaly: hasErrors && index === 1 ? 'Duplicate SKU' : hasErrors && index === 2 ? 'Cost must be greater than zero' : null,
      }));
      const preview = {
        id: this.store.createId('cost-import'),
        organisationId,
        fileName: input.file.name.trim(),
        rows,
        // The visible rows are a review sample of the representative 2,480-row
        // onboarding import; aggregate counts remain explicit in the read model.
        exactMatches: 2_124,
        suggestedMatches: 211,
        unmatchedRows: 145,
        suspiciousValues: 7,
        createdAt: this.store.nowIso(),
        appliedAt: null,
      };
      draft.costImports[preview.id] = preview;
      return preview;
    });
    return result;
  }

  async applyImport(input: ApplyCostImportInput, signal?: AbortSignal) {
    await mockDelay(540, signal);
    return this.commitWithCanonical((draft) => {
      const organisationId = requireOrganisationId(draft, input.sessionId);
      const preview = draft.costImports[input.previewId];
      const cogs = draft.cogs[organisationId];
      if (!preview || preview.organisationId !== organisationId || !cogs) throw new OnboardingServiceError('not_found', 'The cost import preview could not be found.');
      if (preview.appliedAt) throw new OnboardingServiceError('conflict', 'This cost import has already been applied.');
      const approvedIds = new Set(input.approvedRowIds);
      const approveAllExactMatches = input.approveAllExactMatches === true;
      const approved = preview.rows.filter((row) => approvedIds.has(row.id)
        || (approveAllExactMatches && row.matchStatus === 'exact' && !row.anomaly));
      if (!approved.length && !approveAllExactMatches) throw new OnboardingServiceError('validation', 'Select at least one valid row to approve.');
      const invalid = approved.find((row) => !row.productId || !row.unitCostMinor || row.unitCostMinor <= 0 || row.anomaly || !normaliseCogsCurrency(row.currency));
      if (invalid) throw new OnboardingServiceError('validation', `Resolve the issue for ${invalid.sku} before applying it.`);
      const now = this.store.nowIso();
      const records = approved.map((row): COGSRecord => {
        const product = cogs.sampleProducts.find((candidate) => candidate.id === row.productId)!;
        return {
          id: this.store.createId('cogs'),
          organisationId,
          companyId: product.ownerCompanyId,
          productId: row.productId!,
          unitCostMinor: row.unitCostMinor!,
          currency: normaliseCogsCurrency(row.currency)!,
          effectiveFrom: row.effectiveFrom,
          effectiveTo: null,
          status: 'active',
          source: 'initial-import',
          sourceReferenceId: preview.id,
          reason: 'Approved during initial onboarding cost import',
          createdByUserId: input.changedByUserId,
          createdByName: 'Onboarding administrator',
          createdAt: now,
          changedByUserId: input.changedByUserId,
          approvedByUserId: input.changedByUserId,
          approvedByName: 'Onboarding administrator',
          approvedAt: now,
          approvalStatus: 'approved',
        };
      });
      const representedByAggregateExactApproval = new Set(
        approveAllExactMatches
          ? approved.filter((row) => row.matchStatus === 'exact').map((row) => row.productId)
          : [],
      );
      let newlyCovered = 0;
      for (const record of records) {
        const existing = cogs.records.filter((candidate) => candidate.productId === record.productId);
        const inserted = insertApprovedCogsRecord(existing, record);
        cogs.records = [...cogs.records.filter((candidate) => candidate.productId !== record.productId), ...inserted.history];
        if (!cogs.costedProductIds.includes(record.productId)) {
          cogs.costedProductIds.push(record.productId);
          if (!representedByAggregateExactApproval.has(record.productId)) newlyCovered += 1;
        }
      }
      const aggregateExactCoverage = approveAllExactMatches
        ? Math.min(cogs.importedProductCount, Math.round(cogs.importedProductCount * (preview.exactMatches / 2_480)))
        : cogs.coveredProductCount;
      cogs.coveredProductCount = Math.min(
        cogs.importedProductCount,
        Math.max(cogs.coveredProductCount, aggregateExactCoverage) + newlyCovered,
      );
      preview.appliedAt = now;
      return { coverage: coverageFor(organisationId, cogs.importedProductCount, cogs.coveredProductCount), records };
    });
  }

  async saveCost(input: SaveInitialCostInput, signal?: AbortSignal) {
    await mockDelay(360, signal);
    if (!Number.isInteger(input.unitCostMinor) || input.unitCostMinor <= 0) throw new OnboardingServiceError('validation', 'Unit cost must be greater than zero.');
    if (!isIsoDate(input.effectiveFrom)) throw new OnboardingServiceError('validation', 'Enter a valid effective date.');
    const currency = normaliseCogsCurrency(input.currency);
    if (!currency) throw new OnboardingServiceError('validation', 'Use a supported currency: GBP, EUR, or USD.');
    return this.commitWithCanonical((draft) => {
      const organisationId = requireOrganisationId(draft, input.sessionId);
      const cogs = draft.cogs[organisationId];
      if (!cogs?.sampleProducts.some((product) => product.id === input.productId)) throw new OnboardingServiceError('not_found', 'The imported product could not be found.');
      const record: COGSRecord = {
        id: this.store.createId('cogs'),
        organisationId,
        companyId: cogs.sampleProducts.find((product) => product.id === input.productId)!.ownerCompanyId,
        productId: input.productId,
        unitCostMinor: input.unitCostMinor,
        currency,
        effectiveFrom: input.effectiveFrom,
        effectiveTo: null,
        status: 'active',
        source: 'single-edit',
        sourceReferenceId: `onboarding:${input.sessionId}`,
        reason: input.reason?.trim() || 'Added during onboarding',
        createdByUserId: input.changedByUserId,
        createdByName: 'Onboarding administrator',
        createdAt: this.store.nowIso(),
        changedByUserId: input.changedByUserId,
        approvedByUserId: input.changedByUserId,
        approvedByName: 'Onboarding administrator',
        approvedAt: this.store.nowIso(),
        approvalStatus: 'approved',
      };
      const history = cogs.records.filter((candidate) => candidate.productId === record.productId);
      const inserted = insertApprovedCogsRecord(history, record);
      cogs.records = [...cogs.records.filter((candidate) => candidate.productId !== record.productId), ...inserted.history];
      if (!cogs.costedProductIds.includes(record.productId)) {
        cogs.costedProductIds.push(record.productId);
        cogs.coveredProductCount = Math.min(cogs.importedProductCount, cogs.coveredProductCount + 1);
      }
      return { coverage: coverageFor(organisationId, cogs.importedProductCount, cogs.coveredProductCount), record };
    });
  }

  async discardImport(sessionId: string, previewId: string, signal?: AbortSignal) {
    await mockDelay(260, signal);
    this.store.transaction((draft) => {
      const organisationId = requireOrganisationId(draft, sessionId);
      const preview = draft.costImports[previewId];
      if (!preview || preview.organisationId !== organisationId) throw new OnboardingServiceError('not_found', 'The cost import preview could not be found.');
      if (preview.appliedAt) throw new OnboardingServiceError('dependency', 'An applied import cannot be discarded.');
      delete draft.costImports[previewId];
    });
  }
}
