/**
 * Working-time arithmetic — PRD section XI.
 *
 * Every rule the company actually uses lives here and nowhere else: the hours a
 * leave request costs, the hours a gate pass costs, and how working minutes
 * elapse (which is what SLA reminders count). Nothing in this file touches the
 * database or the network, so it is fully unit-testable.
 *
 * Company convention, fixed for Phase 1:
 *   08:00–12:00 morning (4h) · 12:00–13:00 lunch, not counted · 13:00–17:00
 *   afternoon (4h) · 8 hours a working day · Sunday is not a working day.
 *   Public holidays are NOT deducted in Phase 1 — C&B edits the final hours.
 *
 * Vietnam has no daylight saving, so a fixed +07:00 offset is exact rather than
 * an approximation. Timestamps arrive as `Date` (an instant); calendar dates
 * arrive as `YYYY-MM-DD` strings, which is what a date picker produces.
 */

export const ICT_OFFSET_MINUTES = 7 * 60;

export const MORNING_START = 8 * 60; // 08:00
export const MORNING_END = 12 * 60; // 12:00
export const AFTERNOON_START = 13 * 60; // 13:00
export const AFTERNOON_END = 17 * 60; // 17:00

/** Minutes counted for one full working day. */
export const WORKING_MINUTES_PER_DAY = 8 * 60;
/** Minutes counted for a half-day leave. */
export const HALF_DAY_MINUTES = 4 * 60;

/** How far a real gate time may drift from the expected one without a reason. */
export const LATE_TOLERANCE_MINUTES = 15;

const MS_PER_DAY = 86_400_000;
const MINUTES_PER_DAY = 1440;

export type HalfDay = "morning" | "afternoon";

/** A calendar day in ICT, counted from 1970-01-01, plus its weekday. */
type IctInstant = {
  /** Days since the ICT epoch day. Used to walk day by day. */
  dayIndex: number;
  /** Minutes since ICT midnight, 0–1439. */
  minuteOfDay: number;
};

function ictInstant(at: Date): IctInstant {
  const shifted = at.getTime() + ICT_OFFSET_MINUTES * 60_000;
  return {
    dayIndex: Math.floor(shifted / MS_PER_DAY),
    minuteOfDay: Math.floor((((shifted % MS_PER_DAY) + MS_PER_DAY) % MS_PER_DAY) / 60_000),
  };
}

function instantFromIct(dayIndex: number, minuteOfDay: number): Date {
  return new Date(
    dayIndex * MS_PER_DAY + minuteOfDay * 60_000 - ICT_OFFSET_MINUTES * 60_000,
  );
}

/** 0 = Sunday … 6 = Saturday. Epoch day 0 (1970-01-01) was a Thursday. */
function weekdayOfDayIndex(dayIndex: number): number {
  return (((dayIndex + 4) % 7) + 7) % 7;
}

function dayIndexOfDateString(date: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error(`Ngày không đúng dạng YYYY-MM-DD: ${date}`);
  const [, y, m, d] = match;
  return Math.floor(Date.UTC(Number(y), Number(m) - 1, Number(d)) / MS_PER_DAY);
}

/** Sunday is the only non-working day in Phase 1. */
export function isWorkingDayIndex(dayIndex: number): boolean {
  return weekdayOfDayIndex(dayIndex) !== 0;
}

/** Whether a `YYYY-MM-DD` calendar date is a working day. */
export function isWorkingDate(date: string): boolean {
  return isWorkingDayIndex(dayIndexOfDateString(date));
}

function overlap(fromA: number, toA: number, fromB: number, toB: number): number {
  return Math.max(0, Math.min(toA, toB) - Math.max(fromA, fromB));
}

/** Working minutes inside one day, between two minute-of-day marks. */
function workingMinutesInDay(dayIndex: number, fromMinute: number, toMinute: number): number {
  if (!isWorkingDayIndex(dayIndex)) return 0;
  return (
    overlap(fromMinute, toMinute, MORNING_START, MORNING_END) +
    overlap(fromMinute, toMinute, AFTERNOON_START, AFTERNOON_END)
  );
}

/**
 * Minutes of company working time between two instants. Time outside working
 * windows, lunch breaks and Sundays simply do not count — which is exactly what
 * both the gate-pass hours and the SLA clock need.
 */
export function workingMinutesBetween(from: Date, to: Date): number {
  const start = ictInstant(from);
  const end = ictInstant(to);
  if (end.dayIndex < start.dayIndex) return 0;
  if (end.dayIndex === start.dayIndex) {
    if (end.minuteOfDay <= start.minuteOfDay) return 0;
    return workingMinutesInDay(start.dayIndex, start.minuteOfDay, end.minuteOfDay);
  }

  let total = workingMinutesInDay(start.dayIndex, start.minuteOfDay, MINUTES_PER_DAY);
  for (let day = start.dayIndex + 1; day < end.dayIndex; day++) {
    total += workingMinutesInDay(day, 0, MINUTES_PER_DAY);
  }
  total += workingMinutesInDay(end.dayIndex, 0, end.minuteOfDay);
  return total;
}

/**
 * The instant at which `minutes` of working time will have elapsed after
 * `from`. Used to know when an SLA reminder is due and when the deadline for
 * editing real gate times falls.
 */
export function addWorkingMinutes(from: Date, minutes: number): Date {
  if (minutes <= 0) return new Date(from.getTime());
  const start = ictInstant(from);
  let remaining = minutes;
  let day = start.dayIndex;
  let cursor = start.minuteOfDay;

  // A year of days is far more than any real reminder or deadline needs; the
  // bound only exists so a bad argument cannot spin forever.
  for (let guard = 0; guard < 366; guard++) {
    if (isWorkingDayIndex(day)) {
      for (const [windowStart, windowEnd] of [
        [MORNING_START, MORNING_END],
        [AFTERNOON_START, AFTERNOON_END],
      ]) {
        const available = overlap(cursor, MINUTES_PER_DAY, windowStart, windowEnd);
        if (available === 0) continue;
        if (available >= remaining) {
          return instantFromIct(day, Math.max(cursor, windowStart) + remaining);
        }
        remaining -= available;
      }
    }
    day += 1;
    cursor = 0;
  }
  throw new Error("addWorkingMinutes: quá 366 ngày làm việc, kiểm lại tham số");
}

/** End of the next working day after `from` — the deadline in PRD rule 15. */
export function endOfNextWorkingDay(from: Date): Date {
  let day = ictInstant(from).dayIndex + 1;
  for (let guard = 0; guard < 14; guard++) {
    if (isWorkingDayIndex(day)) return instantFromIct(day, AFTERNOON_END);
    day += 1;
  }
  throw new Error("endOfNextWorkingDay: không tìm được ngày làm việc kế tiếp");
}

export type LeaveSpan = {
  /** First day off, `YYYY-MM-DD`. */
  fromDate: string;
  /** Last day off, inclusive, `YYYY-MM-DD`. */
  toDate: string;
  /** Set only for a single-day half-day request. */
  halfDay?: HalfDay | null;
};

/**
 * Minutes a leave request costs: full working days times 8 hours, Sundays
 * skipped. A half-day request covers one date and costs 4 hours.
 */
export function computeLeaveMinutes(span: LeaveSpan): number {
  const from = dayIndexOfDateString(span.fromDate);
  const to = dayIndexOfDateString(span.toDate);
  if (to < from) throw new Error("Ngày kết thúc phải từ ngày bắt đầu trở đi");

  if (span.halfDay) {
    if (to !== from) throw new Error("Nghỉ nửa ngày chỉ áp dụng cho một ngày");
    return isWorkingDayIndex(from) ? HALF_DAY_MINUTES : 0;
  }

  let minutes = 0;
  for (let day = from; day <= to; day++) {
    if (isWorkingDayIndex(day)) minutes += WORKING_MINUTES_PER_DAY;
  }
  return minutes;
}

/** Whole working days a leave request covers, for display next to the hours. */
export function countLeaveWorkingDays(span: LeaveSpan): number {
  if (span.halfDay) return 0.5;
  return computeLeaveMinutes(span) / WORKING_MINUTES_PER_DAY;
}

/**
 * Minutes of working time a gate pass costs — the time the person is away
 * during working hours, lunch and Sundays excluded.
 */
export function computeGateMinutes(outAt: Date, inAt: Date): number {
  return workingMinutesBetween(outAt, inAt);
}

/**
 * How far the real return differs from the expected one. Positive means late,
 * negative means early — both are on the paper form, both matter.
 */
export function returnDriftMinutes(expectedInAt: Date, actualInAt: Date): number {
  return Math.round((actualInAt.getTime() - expectedInAt.getTime()) / 60_000);
}

/** PRD: a drift beyond 15 minutes in either direction needs a written reason. */
export function requiresDriftReason(driftMinutes: number): boolean {
  return Math.abs(driftMinutes) > LATE_TOLERANCE_MINUTES;
}

/** Minutes to hours, at the one decimal place the timesheet screen shows. */
export function minutesToHours(minutes: number): number {
  return Math.round((minutes / 60) * 10) / 10;
}
