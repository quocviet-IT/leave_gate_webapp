import { describe, expect, it } from "vitest";
import { stepFieldsFor, validateStep } from "@/lib/domain/form-steps";

describe("which fields belong to which step", () => {
  it("asks only for the form type and the name first", () => {
    expect(stepFieldsFor("leave", 1)).toEqual(["kind", "employeeId"]);
    expect(stepFieldsFor("gate", 1)).toEqual(["kind", "employeeId"]);
  });

  it("asks the leave essentials second", () => {
    expect(stepFieldsFor("leave", 2)).toEqual([
      "fromDate",
      "toDate",
      "halfDay",
      "reason",
      "reasonText",
      "note",
    ]);
  });

  it("asks the gate essentials second", () => {
    expect(stepFieldsFor("gate", 2)).toEqual([
      "reason",
      "reasonText",
      "outAt",
      "expectedInAt",
      "note",
    ]);
  });

  it("leaves handover, make-up day and the undertaking to the last step", () => {
    expect(stepFieldsFor("leave", 3)).toEqual([
      "handoverEmployeeId",
      "makeupDate",
      "committed",
    ]);
  });

  it("has nothing left to ask a gate pass on the last step", () => {
    expect(stepFieldsFor("gate", 3)).toEqual([]);
  });
});

describe("per-step validation", () => {
  it("refuses to leave step 1 without a chosen name", () => {
    const result = validateStep("leave", 1, { kind: "leave", employeeId: "" });
    expect(result.ok).toBe(false);
    expect(result.errors.employeeId).toBe("Chọn tên của bạn trong danh sách");
  });

  it("refuses an end date before the start date", () => {
    const result = validateStep("leave", 2, {
      fromDate: "2026-08-01",
      toDate: "2026-07-30",
      reason: "annual",
      note: "x",
    });
    expect(result.ok).toBe(false);
    expect(result.errors.toDate).toMatch(/từ ngày bắt đầu/);
  });

  it("demands the free-text reason for 'other'", () => {
    const result = validateStep("leave", 2, {
      fromDate: "2026-07-30",
      toDate: "2026-07-30",
      reason: "other",
      reasonText: "",
      note: "x",
    });
    expect(result.ok).toBe(false);
    expect(result.errors.reasonText).toBeTruthy();
  });

  it("refuses a gate return before the exit", () => {
    const result = validateStep("gate", 2, {
      reason: "business_trip",
      outAt: "2026-07-30T14:00:00+07:00",
      expectedInAt: "2026-07-30T10:00:00+07:00",
      note: "x",
    });
    expect(result.ok).toBe(false);
    expect(result.errors.expectedInAt).toBeTruthy();
  });

  it("accepts a complete leave step 2", () => {
    expect(
      validateStep("leave", 2, {
        fromDate: "2026-07-30",
        toDate: "2026-08-01",
        reason: "annual",
        note: "Về quê",
      }).ok,
    ).toBe(true);
  });
});
