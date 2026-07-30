import { describe, expect, it } from "vitest";
import { isOverdue, isReminderDue, slaDueAt, slaStage } from "@/lib/domain/sla";

function ict(iso: string): Date {
  return new Date(`${iso}+07:00`);
}

describe("SLA reminders", () => {
  const submitted = ict("2026-07-30T09:12"); // Thursday morning

  it("says nothing for the first hour", () => {
    expect(slaStage(submitted, ict("2026-07-30T10:11"))).toBe(0);
  });

  it("nudges once at one working hour", () => {
    expect(slaStage(submitted, ict("2026-07-30T10:12"))).toBe(1);
  });

  it("names all four approvers at two working hours", () => {
    expect(slaStage(submitted, ict("2026-07-30T11:12"))).toBe(2);
    expect(isOverdue(submitted, ict("2026-07-30T11:12"))).toBe(true);
  });

  it("stops the clock outside working hours", () => {
    // Filed 16:30 Saturday: 30 minutes left that day, so the first hour is only
    // reached at 08:30 Monday — not at 17:30 on Saturday evening.
    const saturday = ict("2026-08-01T16:30");
    expect(slaStage(saturday, ict("2026-08-01T23:00"))).toBe(0);
    expect(slaStage(saturday, ict("2026-08-03T08:29"))).toBe(0);
    expect(slaStage(saturday, ict("2026-08-03T08:30"))).toBe(1);
    expect(slaDueAt(saturday, 1).toISOString()).toBe(ict("2026-08-03T08:30").toISOString());
  });

  it("does not repeat a reminder that already went out", () => {
    const now = ict("2026-07-30T10:30");
    expect(isReminderDue(submitted, now, 0)).toEqual({ due: true, stage: 1 });
    expect(isReminderDue(submitted, now, 1)).toEqual({ due: false, stage: 1 });
  });

  it("escalates to the second reminder even if the first was sent", () => {
    expect(isReminderDue(submitted, ict("2026-07-30T11:30"), 1)).toEqual({ due: true, stage: 2 });
  });

  it("the lunch break does not count toward the deadline", () => {
    // Filed 11:30, so one working hour lands at 13:30, not 12:30.
    expect(slaDueAt(ict("2026-07-30T11:30"), 1).toISOString()).toBe(
      ict("2026-07-30T13:30").toISOString(),
    );
  });
});
