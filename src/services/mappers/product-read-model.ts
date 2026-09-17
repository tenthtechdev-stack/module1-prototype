import { deriveProfitability } from '@/src/domain/calculations';
import type { ProductListItem, ProductPerformance } from '@/src/domain/models';

export function materializeProduct(product: ProductPerformance, cogsMissing: boolean): ProductListItem {
  const adjusted = { ...product, cogsPence: cogsMissing ? null : product.cogsPence };
  const profitability = deriveProfitability(adjusted);
  const deltaBps = profitability.netProfitPence === null || product.priorProfitPence === null || product.priorProfitPence === 0
    ? null
    : Math.round(((profitability.netProfitPence - product.priorProfitPence) * 10_000) / product.priorProfitPence);
  return {
    ...adjusted,
    netRevenuePence: profitability.netRevenuePence,
    netProfitPence: profitability.netProfitPence,
    marginBps: profitability.marginBps,
    deltaBps,
    cogsStatus: profitability.status === 'complete' ? 'complete' : 'missing',
  };
}
