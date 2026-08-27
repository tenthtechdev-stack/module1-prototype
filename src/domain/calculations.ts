export interface ProfitabilityInput {
  grossRevenuePence: number;
  refundsPence: number;
  cogsPence: number | null;
  marketplaceFeesPence: number;
  advertisingPence: number;
  shippingPence: number;
  otherDirectCostsPence: number;
  allocatedExpensesPence: number;
}

export type ProfitabilityResult =
  | {
      status: 'complete';
      netRevenuePence: number;
      netProfitPence: number;
      marginBps: number | null;
    }
  | {
      status: 'incomplete';
      netRevenuePence: number;
      netProfitPence: null;
      marginBps: null;
      missing: ['cogs'];
    };

export function deriveProfitability(input: ProfitabilityInput): ProfitabilityResult {
  const netRevenuePence = input.grossRevenuePence - input.refundsPence;
  if (input.cogsPence === null) {
    return {
      status: 'incomplete',
      netRevenuePence,
      netProfitPence: null,
      marginBps: null,
      missing: ['cogs'],
    };
  }

  const netProfitPence =
    netRevenuePence -
    input.cogsPence -
    input.marketplaceFeesPence -
    input.advertisingPence -
    input.shippingPence -
    input.otherDirectCostsPence -
    input.allocatedExpensesPence;

  return {
    status: 'complete',
    netRevenuePence,
    netProfitPence,
    marginBps: netRevenuePence > 0 ? Math.round((netProfitPence * 10_000) / netRevenuePence) : null,
  };
}

export function formatMoney(pence: number | null, currency = 'GBP') {
  if (pence === null) return '—';
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(pence / 100);
}

export function formatPercentage(bps: number | null) {
  if (bps === null) return '—';
  const sign = bps > 0 ? '+' : '';
  return `${sign}${(bps / 100).toFixed(1)}%`;
}
