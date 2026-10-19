import { describe, expect, it } from "vitest";
import {
  ADJUSTMENT_REASON_MIN,
  adjustmentProblem,
  gateTimesDisagree,
  gateTimeVerdict,
  inPeriod,
  isAdjusted,
  monthBounds,
  periodDate,
  totals,
  type TimesheetRow,
} from "@/lib/domain/timesheet";
import { EXPORT_HEADERS, exportFileName, toExportRow } from "@/lib/domain/timesheet-export";

function row(overrides: Partial<TimesheetRow> = {}): TimesheetRow {
  return {
    request_id: "11111111-1111-4111-8111-111111111111",
    code: "NP-2607-0148",
    kind: "leave",
    full_name: "Phạm Văn Công Nhân",
    title: "Công nhân",
    department: "Sản xuất",
    computed_minutes: 480,
    final_minutes: 480,
    marked_at: null,
    marked_by_email: null,
    decided_at: "2026-07-30T02:30:00.000Z",
    decided_by_email: "dieu@ctyhp.vn",
    from_date: "2026-07-30",
    to_date: "2026-07-30",
    out_at: null,
    expected_in_at: null,
    actual_in_at: null,
    actual_in_source: null,
    drift_minutes: null,
    drift_reason: null,
    booth_out_at: null,
    booth_in_at: null,
    ...overrides,
  };
}

function gate(overrides: Partial<TimesheetRow> = {}): TimesheetRow {
  return row({
    code: "RC-2607-0031",
    kind: "gate",
    computed_minutes: 180,
    final_minutes: 180,
    from_date: null,
    to_date: null,
    out_at: "2026-07-30T02:00:00.000Z", // 09:00 ICT
    expected_in_at: "2026-07-30T05:00:00.000Z", // 12:00 ICT
    ...overrides,
  });
}

describe("which day a row counts against", () => {
  it("is the first day off for leave", () => {
    expect(periodDate(row())).toBe("2026-07-30");
  });

  it("is the day of the exit for a gate pass, read in ICT", () => {
    // 2026-07-30T17:30Z is already 31/07 in Ho Chi Minh City.
    expect(periodDate(gate({ out_at: "2026-07-30T17:30:00.000Z" }))).toBe("2026-07-31");
  });
});

describe("the period filter", () => {
  it("includes both ends of the range", () => {
    expect(inPeriod(row(), "2026-07-30", "2026-07-30")).toBe(true);
    expect(inPeriod(row(), "2026-07-31", "2026-08-31")).toBe(false);
    expect(inPeriod(row(), "2026-06-01", "2026-07-29")).toBe(false);
  });

  it("treats an empty bound as no bound", () => {
    expect(inPeriod(row(), "", "")).toBe(true);
    expect(inPeriod(row(), "2026-01-01", "")).toBe(true);
    expect(inPeriod(row(), "", "2026-07-01")).toBe(false);
  });

  it("works out a month's first and last day, February included", () => {
    expect(monthBounds("2026-07")).toEqual({ from: "2026-07-01", to: "2026-07-31" });
    expect(monthBounds("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(monthBounds("2028-02")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(monthBounds("rác")).toEqual({ from: "", to: "" });
  });
});

describe("which gate time counts — PRD section VIII", () => {
  it("the guard's, when the guard tapped both", () => {
    expect(
      gateTimeVerdict(
        gate({
          booth_out_at: "2026-07-30T02:01:00.000Z",
          booth_in_at: "2026-07-30T05:02:00.000Z",
          actual_in_at: "2026-07-30T05:02:00.000Z",
          actual_in_source: "booth",
        }),
      ),
    ).toEqual({ source: "booth", warning: null });
  });

  it("the employee's return, flagged, when the guard tapped only Cho ra", () => {
    const verdict = gateTimeVerdict(
      gate({
        booth_out_at: "2026-07-30T02:01:00.000Z",
        actual_in_at: "2026-07-30T05:10:00.000Z",
        actual_in_source: "employee",
      }),
    );
    expect(verdict.source).toBe("employee");
    expect(verdict.warning).toContain("chưa được xác nhận tại cổng");
  });

  it("the employee's own times, with a warning, when the guard tapped nothing", () => {
    const verdict = gateTimeVerdict(
      gate({ actual_in_at: "2026-07-30T05:10:00.000Z", actual_in_source: "employee" }),
    );
    expect(verdict.source).toBe("employee");
    expect(verdict.warning).toContain("Bảo vệ không bấm");
  });

  it("nothing at all, when neither side supplied a return", () => {
    expect(gateTimeVerdict(gate()).source).toBe("none");
    expect(gateTimeVerdict(gate()).warning).toContain("Chưa có giờ vào");
  });

  it("says nothing about a leave request", () => {
    expect(gateTimeVerdict(row())).toEqual({ source: "none", warning: null });
  });
});

describe("times that disagree by more than the tolerance", () => {
  const booth = {
    booth_out_at: "2026-07-30T02:01:00.000Z",
    booth_in_at: "2026-07-30T05:20:00.000Z",
    actual_in_at: "2026-07-30T05:20:00.000Z",
    actual_in_source: "booth" as const,
  };

  it("are flagged for C&B once past fifteen minutes", () => {
    expect(gateTimesDisagree(gate({ ...booth, drift_minutes: 20 }))).toBe(true);
    expect(gateTimesDisagree(gate({ ...booth, drift_minutes: -20 }))).toBe(true);
  });

  it("are left alone at exactly fifteen", () => {
    expect(gateTimesDisagree(gate({ ...booth, drift_minutes: 15 }))).toBe(false);
  });

  it("never flag a time the booth did not record", () => {
    expect(
      gateTimesDisagree(gate({ actual_in_source: "employee", drift_minutes: 40 })),
    ).toBe(false);
  });
});

describe("rule 16 — a reason for every adjustment", () => {
  it("is the ten characters the PRD asks for", () => {
    expect(ADJUSTMENT_REASON_MIN).toBe(10);
  });

  it("asks for nothing when the hours are left alone", () => {
    expect(adjustmentProblem(480, 480, "")).toBe(null);
  });

  it("refuses a change with no reason", () => {
    expect(adjustmentProblem(480, 240, "")).toContain("10 ký tự");
  });

  it("refuses a change with a token reason", () => {
    expect(adjustmentProblem(480, 240, "sai")).toContain("10 ký tự");
  });

  it("accepts a change that explains itself", () => {
    expect(adjustmentProblem(480, 240, "Nghỉ nửa ngày theo xác nhận quản đốc")).toBe(null);
  });

  it("refuses hours that are not a number of minutes", () => {
    expect(adjustmentProblem(480, -1, "Lý do đủ dài để qua")).toContain("không hợp lệ");
    expect(adjustmentProblem(480, 1.5, "Lý do đủ dài để qua")).toContain("không hợp lệ");
  });
});

describe("the totals strip", () => {
  it("adds the two hours columns separately", () => {
    const summary = totals([
      row(),
      row({ request_id: "b", final_minutes: 240, marked_at: "2026-07-31T02:00:00.000Z" }),
      gate({ request_id: "c" }),
    ]);
    expect(summary).toEqual({
      rows: 3,
      computedMinutes: 480 + 480 + 180,
      finalMinutes: 480 + 240 + 180,
      adjusted: 1,
      marked: 1,
    });
  });

  it("calls a row adjusted only when the two columns differ", () => {
    expect(isAdjusted(row())).toBe(false);
    expect(isAdjusted(row({ final_minutes: 240 }))).toBe(true);
  });
});

describe("the Excel table", () => {
  it("puts hours in as numbers so the column can be summed", () => {
    const cells = toExportRow(row({ final_minutes: 240 }));
    expect(cells[EXPORT_HEADERS.indexOf("Số giờ hệ thống tính")]).toBe(8);
    expect(cells[EXPORT_HEADERS.indexOf("Số giờ chốt")]).toBe(4);
  });

  it("writes every timestamp in ICT, never as a bare date", () => {
    const cells = toExportRow(
      gate({
        booth_out_at: "2026-07-30T02:01:00.000Z",
        booth_in_at: "2026-07-30T05:02:00.000Z",
      }),
    );
    expect(cells[EXPORT_HEADERS.indexOf("Giờ ra tại cổng")]).toBe("30/07/2026 · 09:01");
    expect(cells[EXPORT_HEADERS.indexOf("Giờ vào tại cổng")]).toBe("30/07/2026 · 12:02");
  });

  it("carries the review note into its own column", () => {
    const cells = toExportRow(
      gate({ actual_in_at: "2026-07-30T05:10:00.000Z", actual_in_source: "employee" }),
    );
    expect(String(cells[EXPORT_HEADERS.indexOf("Cần xem lại")])).toContain("Bảo vệ không bấm");
  });

  it("has one cell per header, on every row", () => {
    for (const sample of [row(), gate(), row({ title: null, department: null })]) {
      expect(toExportRow(sample)).toHaveLength(EXPORT_HEADERS.length);
    }
  });

  it("names the file after the period", () => {
    expect(exportFileName("2026-07-01", "2026-07-31")).toBe(
      "Cham-cong_2026-07-01_2026-07-31.xlsx",
    );
    expect(exportFileName("", "")).toBe("Cham-cong_tat-ca.xlsx");
  });
});
