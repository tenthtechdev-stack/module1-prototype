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
  const result = deriveDetailedProfitability({
    grossSalesMinor: input.grossRevenuePence,
    discountsMinor: 0,
    refundsMinor: input.refundsPence,
    cogsMinor: input.cogsPence,
    marketplaceFeesMinor: input.marketplaceFeesPence,
    advertisingMinor: input.advertisingPence,
    shippingMinor: input.shippingPence,
    otherDirectCostsMinor: input.otherDirectCostsPence,
    allocatedExpensesMinor: input.allocatedExpensesPence,
  });
  if (!result.complete) {
    return {
      status: 'incomplete',
      netRevenuePence: result.netRevenueMinor,
      netProfitPence: null,
      marginBps: null,
      missing: ['cogs'],
    };
  }
  return {
    status: 'complete',
    netRevenuePence: result.netRevenueMinor,
    netProfitPence: result.netProfitMinor!,
    marginBps: result.marginBps,
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

export function formatMoneyCompact(pence: number | null, currency = 'GBP') {
  if (pence === null) return '—';
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    notation: Math.abs(pence) >= 1_000_000 ? 'compact' : 'standard',
    maximumFractionDigits: Math.abs(pence) >= 1_000_000 ? 1 : 0,
    minimumFractionDigits: 0,
  }).format(pence / 100);
}

export function formatInteger(value: number | null) {
  return value === null ? '—' : new Intl.NumberFormat('en-GB').format(value);
}

/** Normalises basis points to the one-decimal precision used by financial UI. */
export function normaliseDisplayBps(bps: number | null) {
  if (bps === null) return null;
  const rounded = Math.sign(bps) * Math.round(Math.abs(bps) / 10) * 10;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function formatPoints(bps: number | null, options: { signed?: boolean } = {}) {
  const displayBps = normaliseDisplayBps(bps);
  if (displayBps === null) return '—';
  const sign = options.signed && displayBps > 0 ? '+' : '';
  return `${sign}${(displayBps / 100).toFixed(1)} pts`;
}

export function formatPercentage(bps: number | null, options: { signed?: boolean } = {}) {
  const displayBps = normaliseDisplayBps(bps);
  if (displayBps === null) return '—';
  const sign = options.signed && displayBps > 0 ? '+' : '';
  return `${sign}${(displayBps / 100).toFixed(1)}%`;
}

export function formatDate(value: string, options: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' }) {
  return new Intl.DateTimeFormat('en-GB', options).format(new Date(value));
}
import { deriveDetailedProfitability } from '@/src/domain/financial-calculations';
