import { describe, expect, it } from "vitest";
import {
  actualReturnSchema,
  finalHoursSchema,
  gateRequestSchema,
  leaveRequestSchema,
  statusLookupSchema,
  submitRequestSchema,
  withdrawSchema,
} from "@/lib/domain/schemas";

const employeeId = "11111111-1111-4111-8111-111111111111";
const handoverId = "22222222-2222-4222-8222-222222222222";
const token = "a".repeat(32);

const leave = {
  kind: "leave" as const,
  fromDate: "2026-07-30",
  toDate: "2026-08-01",
  reason: "annual" as const,
  reasonText: "",
  note: "Về quê thăm gia đình",
  handoverEmployeeId: handoverId,
  committed: true as const,
};

const gate = {
  kind: "gate" as const,
  reason: "other" as const,
  reasonText: "Đi khám sức khoẻ định kỳ",
  note: "Khám định kỳ tại bệnh viện tỉnh",
  outAt: "2026-07-30T10:00:00+07:00",
  expectedInAt: "2026-07-30T14:00:00+07:00",
};

describe("leave form", () => {
  it("accepts a complete request", () => {
    expect(leaveRequestSchema.safeParse(leave).success).toBe(true);
  });

  it("rejects an end date before the start date", () => {
    const result = leaveRequestSchema.safeParse({ ...leave, toDate: "2026-07-29" });
    expect(result.success).toBe(false);
  });

  it("rejects a half-day over two dates", () => {
    const result = leaveRequestSchema.safeParse({ ...leave, halfDay: "morning" });
    expect(result.success).toBe(false);
  });

  it('demands the free-text reason for "special" and "other"', () => {
    expect(leaveRequestSchema.safeParse({ ...leave, reason: "special" }).success).toBe(false);
    expect(
      leaveRequestSchema.safeParse({ ...leave, reason: "special", reasonText: "Việc gia đình" })
        .success,
    ).toBe(true);
  });

  it("will not take a request without the commitment ticked", () => {
    expect(leaveRequestSchema.safeParse({ ...leave, committed: false }).success).toBe(false);
  });

  it("requires a handover person", () => {
    const withoutHandover: Record<string, unknown> = { ...leave };
    delete withoutHandover.handoverEmployeeId;
    expect(leaveRequestSchema.safeParse(withoutHandover).success).toBe(false);
  });
});

describe("gate-pass form", () => {
  it("accepts a complete request", () => {
    expect(gateRequestSchema.safeParse(gate).success).toBe(true);
  });

  it("rejects a return before the exit", () => {
    const result = gateRequestSchema.safeParse({
      ...gate,
      expectedInAt: "2026-07-30T09:00:00+07:00",
    });
    expect(result.success).toBe(false);
  });

  it('demands the free-text reason for "other"', () => {
    expect(gateRequestSchema.safeParse({ ...gate, reasonText: "" }).success).toBe(false);
  });

  it("accepts a timestamp only with an offset, so ICT is never assumed", () => {
    expect(gateRequestSchema.safeParse({ ...gate, outAt: "2026-07-30T10:00:00" }).success).toBe(
      false,
    );
  });
});

describe("who is filing", () => {
  it("needs only a name chosen from the list", () => {
    expect(
      submitRequestSchema.safeParse({
        submitter: { employeeId },
        detail: leave,
      }).success,
    ).toBe(true);
  });

  it("refuses a typed name instead of a chosen one", () => {
    expect(
      submitRequestSchema.safeParse({
        submitter: { employeeId: "Nguyễn Văn Bình" },
        detail: leave,
      }).success,
    ).toBe(false);
  });

  it("asks for no credential, because filing is public", () => {
    const parsed = submitRequestSchema.parse({ submitter: { employeeId }, detail: leave });
    expect(Object.keys(parsed.submitter)).toEqual(["employeeId"]);
  });
});

describe("looking a request up by its printed code", () => {
  it("accepts a well-formed request code", () => {
    expect(statusLookupSchema.safeParse({ requestCode: "NP-2607-0148" }).success).toBe(true);
  });

  it("rejects anything that is not a request code", () => {
    expect(statusLookupSchema.safeParse({ requestCode: "0148" }).success).toBe(false);
    expect(statusLookupSchema.safeParse({ requestCode: "XX-2607-0148" }).success).toBe(false);
  });
});

describe("employee updating a real return time", () => {
  const base = {
    lookupToken: token,
    actualInAt: "2026-07-30T14:20:00+07:00",
  };

  it("needs a reason once the drift passes 15 minutes", () => {
    expect(actualReturnSchema.safeParse({ ...base, driftMinutes: 20 }).success).toBe(false);
    expect(
      actualReturnSchema.safeParse({ ...base, driftMinutes: 20, driftReason: "Chờ kết quả" })
        .success,
    ).toBe(true);
  });

  it("takes a small drift without a reason", () => {
    expect(actualReturnSchema.safeParse({ ...base, driftMinutes: 10 }).success).toBe(true);
  });

  it("rejects a malformed lookup link", () => {
    expect(
      actualReturnSchema.safeParse({ ...base, lookupToken: "nope", driftMinutes: 0 }).success,
    ).toBe(false);
  });
});

describe("withdrawing a request", () => {
  it("is authorised by the private link alone", () => {
    expect(withdrawSchema.safeParse({ lookupToken: token }).success).toBe(true);
  });

  it("cannot be done with a request code", () => {
    expect(withdrawSchema.safeParse({ lookupToken: "NP-2607-0148" }).success).toBe(false);
  });
});

describe("C&B editing the final hours", () => {
  const requestId = "33333333-3333-4333-8333-333333333333";

  it("will not save a short reason", () => {
    expect(
      finalHoursSchema.safeParse({ requestId, finalMinutes: 180, reason: "sai" }).success,
    ).toBe(false);
  });

  it("saves with a real reason", () => {
    expect(
      finalHoursSchema.safeParse({
        requestId,
        finalMinutes: 180,
        reason: "Trễ 20 phút do chờ kết quả xét nghiệm, đã xác minh với bộ phận",
      }).success,
    ).toBe(true);
  });
});
