import type { WorkHoursConfig } from './types';

const DEFAULT_CONFIG: WorkHoursConfig = {
  display_unit: 'day',
  hours_per_day: 8,
};

/** Format stored hours to display string, e.g. "3.0d" or "24h" */
export function formatHours(hours: number | undefined | null, config?: WorkHoursConfig): string {
  if (hours == null) return '';
  const c = config || DEFAULT_CONFIG;
  if (c.display_unit === 'hour') {
    return `${hours}h`;
  }
  const days = hours / c.hours_per_day;
  return `${days % 1 === 0 ? days : days.toFixed(1)}d`;
}

/** Convert user input value (in display unit) to stored hours */
export function inputToHours(inputValue: number, config?: WorkHoursConfig): number {
  const c = config || DEFAULT_CONFIG;
  if (c.display_unit === 'hour') return inputValue;
  return inputValue * c.hours_per_day;
}

/** Convert stored hours to display unit value (for editing) */
export function hoursToDisplayValue(hours: number | undefined | null, config?: WorkHoursConfig): number | undefined {
  if (hours == null) return undefined;
  const c = config || DEFAULT_CONFIG;
  if (c.display_unit === 'hour') return hours;
  return parseFloat((hours / c.hours_per_day).toFixed(2));
}

/** Get the unit suffix string */
export function getUnitSuffix(config?: WorkHoursConfig): string {
  const c = config || DEFAULT_CONFIG;
  return c.display_unit === 'hour' ? 'h' : 'd';
}
