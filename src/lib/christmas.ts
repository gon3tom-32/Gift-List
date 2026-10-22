import { differenceInCalendarDays } from 'date-fns';

/** Whole days from today until the next Christmas Day (0 on the day itself). */
export function daysUntilChristmas(now: Date = new Date()): number {
  let christmas = new Date(now.getFullYear(), 11, 25);
  if (differenceInCalendarDays(christmas, now) < 0) {
    christmas = new Date(now.getFullYear() + 1, 11, 25);
  }
  return differenceInCalendarDays(christmas, now);
}

export function countdownText(now: Date = new Date()): string {
  const days = daysUntilChristmas(now);
  if (days === 0) return "It's Christmas!";
  if (days === 1) return '1 day to Christmas';
  return `${days} days to Christmas`;
}
