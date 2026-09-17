import type { DateRange } from '@/src/domain/models';

export type DatePresetKey = '30d' | 'month' | 'quarter';
export type DatePreset = DatePresetKey | 'custom';

export const DATE_PRESET_RANGES = {
  '30d': { from: '2026-07-29', to: '2026-08-27' },
  month: { from: '2026-08-01', to: '2026-08-27' },
  quarter: { from: '2026-06-01', to: '2026-08-27' },
} as const satisfies Record<DatePresetKey, DateRange>;

interface DateRangeQuery {
  range: string | null;
  from: string | null;
  to: string | null;
}

export interface ResolvedDateRange {
  datePreset: DatePreset;
  dateRange: DateRange;
}

const PRESET_KEYS = Object.keys(DATE_PRESET_RANGES) as DatePresetKey[];

function isPresetKey(value: string | null): value is DatePresetKey {
  return value !== null && PRESET_KEYS.includes(value as DatePresetKey);
}

function isIsoDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function presetFor(range: DateRange): DatePresetKey | undefined {
  return PRESET_KEYS.find((key) => {
    const preset = DATE_PRESET_RANGES[key];
    return preset.from === range.from && preset.to === range.to;
  });
}

export function resolveDateRange({ range, from, to }: DateRangeQuery): ResolvedDateRange {
  if (isIsoDate(from) && isIsoDate(to) && from <= to) {
    const dateRange = { from, to };
    return { datePreset: presetFor(dateRange) ?? 'custom', dateRange };
  }

  const datePreset = isPresetKey(range) ? range : '30d';
  return { datePreset, dateRange: { ...DATE_PRESET_RANGES[datePreset] } };
}
