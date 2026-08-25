import { describe, expect, it } from "vitest";
import { leaveRequestSchema, submitterSchema } from "@/lib/domain/schemas";

/**
 * The public form takes a typed name rather than a choice from the staff list
 * (board decision, 2026-08-25). Nothing downstream can assume an employee id
 * any more, so the schemas are what hold the line on the fields that remain:
 * a name and a department the approver can route on.
 */

const typed = {
  employeeName: "Tạ Quốc Việt",
  employeeDepartment: "Xưởng A",
  employeeTitle: "Công nhân",
};

describe("who is filing, typed", () => {
  it("accepts a name and a department", () => {
    expect(submitterSchema.safeParse(typed).success).toBe(true);
  });

  it("needs a job title as well — see the block at the end of this file", () => {
    const withoutTitle: Record<string, unknown> = { ...typed };
    delete withoutTitle.employeeTitle;
    expect(submitterSchema.safeParse(withoutTitle).success).toBe(false);
  });

  it("refuses a blank name", () => {
    expect(submitterSchema.safeParse({ ...typed, employeeName: "   " }).success).toBe(false);
  });

  it("refuses a one-letter name, which is a slip rather than a name", () => {
    expect(submitterSchema.safeParse({ ...typed, employeeName: "A" }).success).toBe(false);
  });

  it("refuses a missing department, because the approver routes on it", () => {
    expect(submitterSchema.safeParse({ ...typed, employeeDepartment: "" }).success).toBe(false);
  });

  it("trims what it keeps", () => {
    const parsed = submitterSchema.parse({ ...typed, employeeName: "  Tạ Quốc Việt  " });
    expect(parsed.employeeName).toBe("Tạ Quốc Việt");
  });

  it("still carries an employee id when a supervisor picked one", () => {
    const parsed = submitterSchema.parse({
      ...typed,
      employeeId: "11111111-1111-4111-8111-111111111111",
    });
    expect(parsed.employeeId).toBe("11111111-1111-4111-8111-111111111111");
  });
});

describe("the handover is a typed name too", () => {
  const leave = {
    kind: "leave" as const,
    fromDate: "2026-07-30",
    toDate: "2026-07-30",
    halfDay: null,
    reason: "annual" as const,
    reasonText: "",
    note: "Về quê thăm gia đình",
    handoverName: "Nguyễn Văn Bình",
    committed: true as const,
  };

  it("accepts a complete application", () => {
    expect(leaveRequestSchema.safeParse(leave).success).toBe(true);
  });

  it("keeps what was typed", () => {
    const parsed = leaveRequestSchema.parse({ ...leave, handoverName: "  Nguyễn Văn Bình  " });
    expect(parsed.handoverName).toBe("Nguyễn Văn Bình");
  });

  it("treats whitespace as nothing typed rather than as a name", () => {
    const parsed = leaveRequestSchema.parse({ ...leave, handoverName: "  " });
    expect(parsed.handoverName).toBe("");
  });
});

describe("a supervisor filing on behalf picks from a list, so the rules differ", () => {
  it("needs an employee id and nothing typed", async () => {
    const { onBehalfSubmitterSchema } = await import("@/lib/domain/schemas");
    expect(
      onBehalfSubmitterSchema.safeParse({
        employeeId: "11111111-1111-4111-8111-111111111111",
      }).success,
    ).toBe(true);
  });

  it("refuses a request with nobody chosen", async () => {
    const { onBehalfSubmitterSchema } = await import("@/lib/domain/schemas");
    const parsed = onBehalfSubmitterSchema.safeParse({ employeeId: "" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toBe("Chọn người trong xưởng của bạn");
    }
  });
});

describe("what the form insists on, and what it lets go", () => {
  it("insists on a job title — it is on the paper form and the approver reads it", () => {
    const withoutTitle: Record<string, unknown> = { ...typed };
    delete withoutTitle.employeeTitle;
    expect(submitterSchema.safeParse(withoutTitle).success).toBe(false);
    expect(submitterSchema.safeParse({ ...typed, employeeTitle: "  " }).success).toBe(false);
  });

  it("lets the handover go — the paper form leaves that line blank too", () => {
    const leave = {
      kind: "leave" as const,
      fromDate: "2026-07-30",
      toDate: "2026-07-30",
      halfDay: null,
      reason: "annual" as const,
      reasonText: "",
      note: "Về quê thăm gia đình",
      committed: true as const,
    };
    expect(leaveRequestSchema.safeParse(leave).success).toBe(true);
    expect(leaveRequestSchema.safeParse({ ...leave, handoverName: "" }).success).toBe(true);
    expect(leaveRequestSchema.safeParse({ ...leave, handoverName: "Nguyễn Văn Bình" }).success).toBe(
      true,
    );
  });

  it("but a handover that is typed still has to be a name, not a stray keystroke", () => {
    const leave = {
      kind: "leave" as const,
      fromDate: "2026-07-30",
      toDate: "2026-07-30",
      halfDay: null,
      reason: "annual" as const,
      reasonText: "",
      note: "Về quê thăm gia đình",
      handoverName: "x",
      committed: true as const,
    };
    expect(leaveRequestSchema.safeParse(leave).success).toBe(false);
  });
});
