/**
 * The timesheet's own rules — PRD section XI, rules 16 and 17.
 *
 * Two hours columns sit side by side. The computed one is what
 * `lib/domain/workhours.ts` worked out at filing and is locked for good; the
 * final one is what payroll uses, and moving it away from the computed figure
 * costs a written reason. Nothing here recomputes hours — that would be a
 * second home for a rule that already has one.
 */

import { LATE_TOLERANCE_MINUTES } from "./workhours";

/** Rule 16: an adjustment reason is this long or it is not a reason. */
export const ADJUSTMENT_REASON_MIN = 10;

export type TimesheetRow = {
  request_id: string;
  code: string;
  kind: "leave" | "gate";
  full_name: string;
  title: string | null;
  department: string | null;
  computed_minutes: number;
  final_minutes: number;
  marked_at: string | null;
  marked_by_email: string | null;
  decided_at: string | null;
  decided_by_email: string | null;
  /** Leave requests only. */
  from_date: string | null;
  to_date: string | null;
  /** Gate passes only. */
  out_at: string | null;
  expected_in_at: string | null;
  actual_in_at: string | null;
  actual_in_source: "booth" | "employee" | "cnb" | null;
  drift_minutes: number | null;
  drift_reason: string | null;
  booth_out_at: string | null;
  booth_in_at: string | null;
};

/**
 * The calendar day a row counts against: the first day off for leave, the day
 * of the exit for a gate pass. `YYYY-MM-DD` in ICT.
 */
export function periodDate(row: TimesheetRow): string {
  if (row.kind === "leave") return row.from_date ?? "";
  return row.out_at ? ictDateString(new Date(row.out_at)) : "";
}

function ictDateString(at: Date): string {
  const shifted = new Date(at.getTime() + 7 * 60 * 60_000);
  return shifted.toISOString().slice(0, 10);
}

/** Inclusive on both ends. An empty bound means "no bound". */
export function inPeriod(row: TimesheetRow, from: string, to: string): boolean {
  const day = periodDate(row);
  if (!day) return false;
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

/** The first and last day of a `YYYY-MM` month, for the month picker. */
export function monthBounds(month: string): { from: string; to: string } {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return { from: "", to: "" };
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const last = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

export type GateTimeVerdict = {
  /** Where the return time used for pay came from. */
  source: "booth" | "employee" | "none";
  /** Set when C&B should look at the row. */
  warning: string | null;
};

/**
 * Which gate time counts, and whether C&B should look — the table in PRD
 * section VIII. The guard's tap always wins when there is one; what changes is
 * how much of the row was measured rather than declared.
 */
export function gateTimeVerdict(row: TimesheetRow): GateTimeVerdict {
  if (row.kind !== "gate") return { source: "none", warning: null };

  if (row.booth_out_at && row.booth_in_at) {
    return { source: "booth", warning: null };
  }

  if (row.booth_out_at && !row.booth_in_at) {
    return {
      source: row.actual_in_at ? "employee" : "none",
      warning: "Giờ vào chưa được xác nhận tại cổng",
    };
  }

  if (row.actual_in_at) {
    return { source: "employee", warning: "Bảo vệ không bấm; giờ do nhân viên tự khai" };
  }

  return { source: "none", warning: "Chưa có giờ vào lại" };
}

/**
 * A gate pass whose guard and employee times disagree by more than the
 * tolerance. The guard's figure still stands — this only asks C&B to look.
 */
export function gateTimesDisagree(row: TimesheetRow): boolean {
  if (row.kind !== "gate" || !row.booth_in_at || row.actual_in_source !== "booth") return false;
  if (row.drift_minutes === null) return false;
  return Math.abs(row.drift_minutes) > LATE_TOLERANCE_MINUTES;
}

export function isAdjusted(row: TimesheetRow): boolean {
  return row.final_minutes !== row.computed_minutes;
}

export function isMarked(row: TimesheetRow): boolean {
  return row.marked_at !== null;
}

/** Rule 16, on the way in: the message the screen shows before it saves. */
export function adjustmentProblem(
  computedMinutes: number,
  finalMinutes: number,
  reason: string,
): string | null {
  if (!Number.isInteger(finalMinutes) || finalMinutes < 0) {
    return "Số giờ chốt không hợp lệ";
  }
  if (finalMinutes === computedMinutes) return null;
  if (reason.trim().length < ADJUSTMENT_REASON_MIN) {
    return `Lý do điều chỉnh phải từ ${ADJUSTMENT_REASON_MIN} ký tự`;
  }
  return null;
}

export type Totals = {
  rows: number;
  computedMinutes: number;
  finalMinutes: number;
  adjusted: number;
  marked: number;
};

export function totals(rows: TimesheetRow[]): Totals {
  return rows.reduce<Totals>(
    (running, row) => ({
      rows: running.rows + 1,
      computedMinutes: running.computedMinutes + row.computed_minutes,
      finalMinutes: running.finalMinutes + row.final_minutes,
      adjusted: running.adjusted + (isAdjusted(row) ? 1 : 0),
      marked: running.marked + (isMarked(row) ? 1 : 0),
    }),
    { rows: 0, computedMinutes: 0, finalMinutes: 0, adjusted: 0, marked: 0 },
  );
}
