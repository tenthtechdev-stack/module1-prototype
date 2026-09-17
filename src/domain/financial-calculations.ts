import type { DateRange } from '@/src/domain/models';
import type { HistoricalCogsRate, MarketplaceFeeComponents } from '@/src/domain/analytics';

const DAY_MS = 86_400_000;

export interface FinancialComponents {
  grossSalesMinor: number;
  discountsMinor: number;
  refundsMinor: number;
  cogsMinor: number | null;
  marketplaceFeesMinor: number;
  advertisingMinor: number | null;
  shippingMinor: number;
  otherDirectCostsMinor: number;
  allocatedExpensesMinor: number;
}

export interface DetailedProfitability {
  revenueMinor: number;
  netRevenueMinor: number;
  cogsKnownMinor: number | null;
  advertisingKnownMinor: number | null;
  grossProfitKnownMinor: number | null;
  knownNetProfitMinor: number | null;
  netProfitMinor: number | null;
  marginBps: number | null;
  knownMarginBps: number | null;
  complete: boolean;
  missing: Array<'cogs' | 'advertising'>;
}

function utcDay(value: string) {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`).valueOf();
}

export function inclusiveDayCount(range: DateRange) {
  return Math.floor((utcDay(range.to) - utcDay(range.from)) / DAY_MS) + 1;
}

export function shiftIsoDate(value: string, days: number) {
  return new Date(utcDay(value) + days * DAY_MS).toISOString().slice(0, 10);
}

export function previousEquivalentPeriod(range: DateRange): DateRange {
  const days = inclusiveDayCount(range);
  return {
    from: shiftIsoDate(range.from, -days),
    to: shiftIsoDate(range.from, -1),
  };
}

export function trendGranularity(range: DateRange): 'day' | 'week' | 'month' {
  const days = inclusiveDayCount(range);
  if (days <= 45) return 'day';
  if (days <= 120) return 'week';
  return 'month';
}

export function normaliseMinor(sourceMinor: number, sourceToReportingRateBps: number) {
  return Math.round((sourceMinor * sourceToReportingRateBps) / 10_000);
}

export function sumFeeComponents(components: MarketplaceFeeComponents) {
  return components.referralMinor
    + components.fulfilmentMinor
    + components.storageMinor
    + components.promotedListingMinor
    + components.otherMinor;
}

export function deriveDetailedProfitability(input: FinancialComponents): DetailedProfitability {
  const revenueMinor = input.grossSalesMinor - input.discountsMinor;
  const netRevenueMinor = revenueMinor - input.refundsMinor;
  const missing: DetailedProfitability['missing'] = [];
  if (input.cogsMinor === null) missing.push('cogs');
  if (input.advertisingMinor === null) missing.push('advertising');
  const complete = missing.length === 0;
  const grossProfitKnownMinor = input.cogsMinor === null ? null : netRevenueMinor - input.cogsMinor;
  const knownNetProfitMinor = complete && grossProfitKnownMinor !== null && input.advertisingMinor !== null
    ? grossProfitKnownMinor
      - input.marketplaceFeesMinor
      - input.advertisingMinor
      - input.shippingMinor
      - input.otherDirectCostsMinor
      - input.allocatedExpensesMinor
    : null;
  const margin = knownNetProfitMinor !== null && netRevenueMinor > 0
    ? Math.round((knownNetProfitMinor * 10_000) / netRevenueMinor)
    : null;
  return {
    revenueMinor,
    netRevenueMinor,
    cogsKnownMinor: input.cogsMinor,
    advertisingKnownMinor: input.advertisingMinor,
    grossProfitKnownMinor,
    knownNetProfitMinor,
    netProfitMinor: knownNetProfitMinor,
    marginBps: margin,
    knownMarginBps: margin,
    complete,
    missing,
  };
}

export function percentageDeltaBps(current: number | null, previous: number | null) {
  if (current === null || previous === null || previous === 0) return null;
  return Math.round(((current - previous) * 10_000) / Math.abs(previous));
}

export function marginPointDeltaBps(current: number | null, previous: number | null) {
  if (current === null || previous === null) return null;
  return current - previous;
}

export function safeRatioBps(numerator: number, denominator: number) {
  if (denominator <= 0) return null;
  return Math.round((numerator * 10_000) / denominator);
}

export function resolveHistoricalUnitCogs(
  history: HistoricalCogsRate[],
  productId: string,
  occurredOn: string,
) {
  const date = occurredOn.slice(0, 10);
  const match = history
    .filter((rate) => rate.productId === productId)
    .filter((rate) => rate.effectiveFrom <= date && (rate.effectiveTo === null || date < rate.effectiveTo))
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
  return match?.unitCostMinor ?? null;
}

export function bucketKey(value: string, granularity: 'day' | 'week' | 'month') {
  const day = value.slice(0, 10);
  if (granularity === 'day') return day;
  if (granularity === 'month') return day.slice(0, 7);
  const date = new Date(`${day}T00:00:00.000Z`);
  const weekday = (date.getUTCDay() + 6) % 7;
  return new Date(date.valueOf() - weekday * DAY_MS).toISOString().slice(0, 10);
}

export function bucketLabel(key: string, granularity: 'day' | 'week' | 'month') {
  const value = granularity === 'month' ? `${key}-01` : key;
  return new Intl.DateTimeFormat('en-GB', granularity === 'month'
    ? { month: 'short', year: '2-digit', timeZone: 'UTC' }
    : { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00.000Z`));
}
