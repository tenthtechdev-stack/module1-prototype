import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readSheet } from 'read-excel-file/node';
const readXlsxFile = (buffer, { sheet }) => readSheet(buffer, sheet);
import { load, cleanup, root } from './lib/validation-runtime.mjs';

try {
  const data = await load('src/fixtures/data.ts');
  const { ROLE_PRESETS, PREVIEW_ASSIGNMENTS } = await load('src/domain/permissions.ts');
  const { MockReportsRepository } = await load('src/services/mock/reports-repository.ts');
  const { serializeReportExport } = await load('src/services/report-export.ts');
  const { reportCopilotSnapshot, explainReport } = await load('src/services/analytics/report-copilot.ts');
  const { csvBytes, xlsxBytes } = await load('src/services/export-formats.ts');
  const input = {
    context: { organisationId: data.organisation.id, companyId: 'all', marketplace: 'amazon', marketplaceAccountIds: [], dateRange: { from: '2026-08-04', to: '2026-08-19' } },
    organisation: data.organisation, companies: data.companies, marketplaceAccounts: data.marketplaceAccounts,
    scenarioId: 'healthy', authorisedCompanyIds: data.companies.map((company) => company.id), authorisedAccountIds: data.marketplaceAccounts.map((account) => account.id),
    reportingCurrency: 'GBP', canViewSensitiveExpenses: true, cogsReadiness: null,
    principal: { role: ROLE_PRESETS.find((role) => role.id === 'admin'), assignment: PREVIEW_ASSIGNMENTS.admin, subscriptionStatus: 'active', entitlements: ['marketplace-profitability'] },
    kind: 'p-and-l', comparePreviousPeriod: true,
  };
  const repository = new MockReportsRepository();
  const output = join(root, 'artifacts/phase-7-reports-expenses/exports'); mkdirSync(output, { recursive: true });
  const results = [];
  for (const kind of ['p-and-l', 'product-profitability', 'marketplace-profitability', 'fees', 'refunds', 'expenses', 'transactions']) {
    const query = { ...input, kind, page: 0, pageSize: 10 };
    const screen = await repository.getReport(query);
    const full = await repository.exportReport(query);
    assert.deepEqual(screen.totals, full.totals, kind + ': export/screen totals');
    assert.equal(full.rows.length, full.total, kind + ': exports every matching row');
    assert.deepEqual(full.rows.slice(0, screen.rows.length), screen.rows, kind + ': export/screen rows');
    for (const format of kind === 'p-and-l' ? ['csv', 'xlsx', 'pdf'] : ['csv', 'xlsx']) {
      const file = serializeReportExport(full, format, undefined, '2026-09-09T09:00:00.000Z');
      assert.deepEqual(file.bytes, serializeReportExport(full, format, undefined, '2026-09-09T09:00:00.000Z').bytes, kind + ': deterministic ' + format);
      assert.equal(file.recordCount, full.total);
      assert(file.fileName.includes('2026-08-04-to-2026-08-19'));
      writeFileSync(join(output, file.fileName), file.bytes);
      if (format === 'xlsx') {
        const summary = await readXlsxFile(Buffer.from(file.bytes), { sheet: 'Summary' });
        assert.equal(summary.find((row) => row[0] === 'From')[1], input.context.dateRange.from);
        const sheet = await readXlsxFile(Buffer.from(file.bytes), { sheet: kind === 'p-and-l' ? 'P&L' : 'Report Data' });
        if (kind === 'p-and-l') assert.equal(sheet.find((row) => row[0] === 'Revenue')[1], full.totals.revenueMinor / 100);
        else {
          assert.equal(sheet.length - 1, full.total);
          full.columns.forEach((column, index) => {
            if (!full.rows.length) return;
            const value = full.rows[0].values[column.key] ?? null;
            assert.equal(sheet[1][index] ?? null, typeof value === 'number' && column.format === 'money' ? value / 100 : typeof value === 'number' && column.format === 'percent' ? value / 10000 : value, kind + ': Excel cell ' + column.key);
          });
        }
      }
      if (format === 'pdf') assert(Buffer.from(file.bytes).toString('latin1').startsWith('%PDF-1.4'));
      results.push({ kind, format, records: file.recordCount, bytes: file.bytes.length });
    }
    const snap = reportCopilotSnapshot(full, '/reports/' + kind);
    assert.equal(snap.totals.revenueMinor, full.totals.revenueMinor, 'Copilot repository grounding');
    assert(!explainReport('Summarise this report', snap).includes('NaN'));
  }
  const restricted = await repository.exportReport({ ...input, principal: { ...input.principal, role: ROLE_PRESETS.find((role) => role.id === 'auditor') } });
  assert.equal(restricted.totals.knownNetProfitMinor, null);
  assert.equal(restricted.totals.allocatedExpensesMinor, null);
  for (const format of ['csv', 'xlsx', 'pdf']) {
    const file = serializeReportExport(restricted, format, undefined, '2026-09-09T09:00:00.000Z');
    if (format === 'xlsx') {
      const rows = await readXlsxFile(Buffer.from(file.bytes), { sheet: 'P&L' });
      const expense = rows.find((row) => /Allocated Expenses|Restricted.*cost/i.test(String(row[0])));
      assert(!expense || expense[1] === null, 'Sensitive expense value absent from XLSX');
    }
  }
  const attack = csvBytes([['=HYPERLINK("evil")', '-formula', '@SUM(A1)', '+1', -12]]);
  assert(Buffer.from(attack).toString().includes('"\'=HYPERLINK'));
  const formulaSheet = await readXlsxFile(Buffer.from(xlsxBytes([{ name: 'Safe', rows: [['Text'], ['=1+1']] }])), { sheet: 'Safe' });
  assert.equal(formulaSheet[1][0], '=1+1', 'XLSX source strings remain literal text');
  writeFileSync(join(root, 'artifacts/phase-7-reports-expenses/export-validation.json'), JSON.stringify({ passed: true, results }, null, 2));
  console.log('PASS: CSV/XLSX/PDF, independent Excel reader, exact date/scope, full filtered rows, deterministic bytes, sensitive redaction, formula safety, repository-grounded Copilot.');
} finally { cleanup(); }

