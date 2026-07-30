import { describe, expect, it } from "vitest";
import {
  addWorkingMinutes,
  computeGateMinutes,
  computeLeaveMinutes,
  countLeaveWorkingDays,
  endOfNextWorkingDay,
  isWorkingDate,
  minutesToHours,
  requiresDriftReason,
  returnDriftMinutes,
  workingMinutesBetween,
} from "@/lib/domain/workhours";

/** ICT wall-clock helper, so the tests read like the PRD examples. */
function ict(iso: string): Date {
  return new Date(`${iso}+07:00`);
}

// 2026-07-30 is a Thursday. The week used below:
//   Thu 30/07 · Fri 31/07 · Sat 01/08 · Sun 02/08 · Mon 03/08 · Tue 04/08
describe("working days", () => {
  it("counts every day but Sunday", () => {
    expect(isWorkingDate("2026-07-30")).toBe(true); // Thursday
    expect(isWorkingDate("2026-08-01")).toBe(true); // Saturday
    expect(isWorkingDate("2026-08-02")).toBe(false); // Sunday
    expect(isWorkingDate("2026-08-03")).toBe(true); // Monday
  });
});

describe("leave hours — PRD section XI examples", () => {
  it("Thursday to Saturday with no Sunday costs 24 hours", () => {
    expect(computeLeaveMinutes({ fromDate: "2026-07-30", toDate: "2026-08-01" })).toBe(24 * 60);
    expect(countLeaveWorkingDays({ fromDate: "2026-07-30", toDate: "2026-08-01" })).toBe(3);
  });

  it("Saturday to Tuesday spans four calendar days but still costs 24 hours", () => {
    expect(computeLeaveMinutes({ fromDate: "2026-08-01", toDate: "2026-08-04" })).toBe(24 * 60);
  });

  it("an afternoon half-day costs 4 hours", () => {
    expect(
      computeLeaveMinutes({ fromDate: "2026-07-30", toDate: "2026-07-30", halfDay: "afternoon" }),
    ).toBe(4 * 60);
    expect(
      countLeaveWorkingDays({ fromDate: "2026-07-30", toDate: "2026-07-30", halfDay: "morning" }),
    ).toBe(0.5);
  });

  it("a single Sunday costs nothing", () => {
    expect(computeLeaveMinutes({ fromDate: "2026-08-02", toDate: "2026-08-02" })).toBe(0);
  });

  it("rejects a half-day spread over two dates", () => {
    expect(() =>
      computeLeaveMinutes({ fromDate: "2026-07-30", toDate: "2026-07-31", halfDay: "morning" }),
    ).toThrow(/nửa ngày/);
  });

  it("rejects an end date before the start date", () => {
    expect(() => computeLeaveMinutes({ fromDate: "2026-07-31", toDate: "2026-07-30" })).toThrow();
  });
});

describe("gate-pass hours — PRD section XI examples", () => {
  it("10:00 out, 14:00 back costs 3 hours because lunch does not count", () => {
    expect(computeGateMinutes(ict("2026-07-30T10:00"), ict("2026-07-30T14:00"))).toBe(3 * 60);
  });

  it("16:00 out, 09:00 back next morning costs 2 hours", () => {
    expect(computeGateMinutes(ict("2026-07-30T16:00"), ict("2026-07-31T09:00"))).toBe(2 * 60);
  });

  it("a trip entirely inside the lunch break costs nothing", () => {
    expect(computeGateMinutes(ict("2026-07-30T12:05"), ict("2026-07-30T12:50"))).toBe(0);
  });

  it("a trip after hours costs nothing", () => {
    expect(computeGateMinutes(ict("2026-07-30T17:30"), ict("2026-07-30T19:00"))).toBe(0);
  });

  it("skips Sunday when the trip spans the weekend", () => {
    // Saturday 16:00 → Monday 09:00: 1h Saturday afternoon + 1h Monday morning.
    expect(computeGateMinutes(ict("2026-08-01T16:00"), ict("2026-08-03T09:00"))).toBe(2 * 60);
  });

  it("counts a full working day for a whole day away", () => {
    expect(computeGateMinutes(ict("2026-07-30T07:00"), ict("2026-07-30T18:00"))).toBe(8 * 60);
  });

  it("returns zero when the return is before the exit", () => {
    expect(computeGateMinutes(ict("2026-07-30T14:00"), ict("2026-07-30T10:00"))).toBe(0);
  });
});

describe("late and early returns", () => {
  it("20 minutes late needs a written reason", () => {
    const drift = returnDriftMinutes(ict("2026-07-30T14:00"), ict("2026-07-30T14:20"));
    expect(drift).toBe(20);
    expect(requiresDriftReason(drift)).toBe(true);
  });

  it("15 minutes either way is inside tolerance", () => {
    expect(requiresDriftReason(15)).toBe(false);
    expect(requiresDriftReason(-15)).toBe(false);
  });

  it("more than 15 minutes early also needs a reason", () => {
    const drift = returnDriftMinutes(ict("2026-07-30T14:00"), ict("2026-07-30T13:30"));
    expect(drift).toBe(-30);
    expect(requiresDriftReason(drift)).toBe(true);
  });
});

describe("elapsed working time", () => {
  it("ignores the lunch break", () => {
    expect(workingMinutesBetween(ict("2026-07-30T11:30"), ict("2026-07-30T13:30"))).toBe(60);
  });

  it("ignores nights and Sundays", () => {
    // Saturday 16:30 → Monday 08:00: 30 minutes of Saturday afternoon only.
    expect(workingMinutesBetween(ict("2026-08-01T16:30"), ict("2026-08-03T08:00"))).toBe(30);
  });
});

describe("adding working time", () => {
  it("moves an after-hours start to the next morning", () => {
    expect(addWorkingMinutes(ict("2026-07-30T18:00"), 60).toISOString()).toBe(
      ict("2026-07-31T09:00").toISOString(),
    );
  });

  it("jumps the lunch break", () => {
    expect(addWorkingMinutes(ict("2026-07-30T11:30"), 60).toISOString()).toBe(
      ict("2026-07-30T13:30").toISOString(),
    );
  });

  it("skips Sunday: Saturday 16:30 plus one working hour is Monday 08:30", () => {
    expect(addWorkingMinutes(ict("2026-08-01T16:30"), 60).toISOString()).toBe(
      ict("2026-08-03T08:30").toISOString(),
    );
  });
});

describe("the deadline for a real gate time", () => {
  it("is the end of the next working day", () => {
    expect(endOfNextWorkingDay(ict("2026-07-30T16:00")).toISOString()).toBe(
      ict("2026-07-31T17:00").toISOString(),
    );
  });

  it("jumps Sunday", () => {
    expect(endOfNextWorkingDay(ict("2026-08-01T16:00")).toISOString()).toBe(
      ict("2026-08-03T17:00").toISOString(),
    );
  });
});

describe("hours for display", () => {
  it("rounds to one decimal place", () => {
    expect(minutesToHours(200)).toBe(3.3);
    expect(minutesToHours(180)).toBe(3);
  });
});
