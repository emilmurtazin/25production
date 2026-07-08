import type { ShopCalendarFields } from '../api/types';

const BASE_WEEKDAY = 1; // 0 часов графика = условный понедельник, 00:00
export const WEEKDAY_LABELS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

export function weekdayOfCalHour(calHour: number): number {
  const dayIndex = Math.floor(calHour / 24);
  return (((BASE_WEEKDAY + dayIndex) % 7) + 7) % 7;
}

export function isWorkingHour(calHour: number, alwaysOn: boolean, calendar: ShopCalendarFields): boolean {
  if (alwaysOn) return true;
  const hourOfDay = ((calHour % 24) + 24) % 24;
  if (!calendar.workDays.includes(weekdayOfCalHour(calHour))) return false;
  return hourOfDay >= calendar.workStart && hourOfDay < calendar.workEnd;
}

export function fmtHour(h: number): string {
  const wd = WEEKDAY_LABELS[weekdayOfCalHour(h)];
  const hh = ((h % 24) + 24) % 24;
  return `${wd} ${String(Math.floor(hh)).padStart(2, '0')}:00`;
}

export function fmtElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(totalSec / 60);
  const ss = totalSec % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}
