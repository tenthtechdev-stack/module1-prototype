'use client';
import { usePathname } from 'next/navigation';
import { LockKeyhole } from 'lucide-react';
import { useAnalysisContext } from '@/src/components/providers/analysis-context-provider';
import { usePrototype } from '@/src/components/providers/prototype-provider';
import { useAccess } from '@/src/components/rbac/access';
import { financialDisclosureAllowed } from '@/src/services/mappers/financial-disclosure';
export function FinancialDisclosureNotice() {
  const path = usePathname().split('/').filter(Boolean);
  const { workspace, authorisedCompanies, authorisedAccounts } = useAnalysisContext();
  const { scenarioId } = usePrototype();
  const sensitive = useAccess('expenses.view_sensitive'), profitability = useAccess('profitability.view');
  const visible = financialDisclosureAllowed({ ...workspace, scenarioId, canViewSensitiveExpenses: sensitive.allowed,
    authorisedCompanyIds: authorisedCompanies.map((company) => company.id), authorisedAccountIds: authorisedAccounts.map((account) => account.id) });
  if (!profitability.allowed || visible || !['dashboard', 'products', 'transactions', 'cogs'].includes(path[2])) return null;
  return <div role="status" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 16, padding: '12px 14px', border: '1px solid #d6dde7', borderRadius: 8, background: '#f4f7fb', fontSize: 13 }}>
    <LockKeyhole size={16} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} /><span><strong>Some financial values are restricted.</strong> Expense totals, Net Profit and Margin are unavailable for your authorised scope to protect sensitive expenses. Revenue, source costs and cost coverage remain available.</span>
  </div>;
}

