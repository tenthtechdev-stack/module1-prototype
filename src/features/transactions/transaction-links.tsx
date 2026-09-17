'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useAnalysisContext } from '@/src/components/providers/analysis-context-provider';
import { useAccess } from '@/src/components/rbac/access';

/** Shared drill-down link: carry the resolved dates, including exact custom ranges. */
export function TransactionsLink({ children = 'View transactions', productId, productGroupId, profitability, className, costRecordId }: {
  children?: React.ReactNode;
  productId?: string;
  productGroupId?: string;
  profitability?: string;
  className?: string;
  costRecordId?: string;
}) {
  const { context, workspace } = useAnalysisContext();
  const pathname = usePathname();
  const search = useSearchParams();
  const access = useAccess('transactions.view');
  if (!access.allowed) return null;
  const params = new URLSearchParams();
  params.set('company', context.companyId);
  params.set('marketplace', context.marketplace);
  params.set('from', context.dateRange.from);
  params.set('to', context.dateRange.to);
  if (context.marketplaceAccountIds.length) params.set('accounts', context.marketplaceAccountIds.join(','));
  const segments = pathname.split('/');
  const productIndex = segments.indexOf('products');
  const currentProduct = productId ?? (productIndex >= 0 ? segments[productIndex + 1] : undefined) ?? search.get('productId');
  if (currentProduct) params.set('productId', decodeURIComponent(currentProduct));
  if (productGroupId) params.set('productGroupId', productGroupId);
  if (profitability) params.set('profitability', profitability);
  if (costRecordId) params.set('costRecordId', costRecordId);
  return <Link className={className} href={`/o/${workspace.organisation.slug}/transactions?${params}`}>{children}</Link>;
}
