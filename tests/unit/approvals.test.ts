import { describe, expect, it } from "vitest";
import {
  belongsOnTab,
  CLAIM_TIMEOUT_MINUTES,
  claimMinutesLeft,
  countByTab,
  effectiveStatus,
  isClaimExpired,
  isHeldBy,
  isHeldByOther,
  isOwnRequest,
  type QueueRequest,
} from "@/lib/domain/approvals";

function ict(iso: string): Date {
  return new Date(`${iso}+07:00`);
}

const DIEU = "dieu@ctyhp.vn";
const TRAN = "tran@ctyhp.vn";

function request(overrides: Partial<QueueRequest> = {}): QueueRequest {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    status: "pending",
    submittedAt: ict("2026-07-30T09:00").toISOString(),
    claimedByEmail: null,
    claimedAt: null,
    decidedByEmail: null,
    subjectEmail: null,
    ...overrides,
  };
}

describe("claim timeout", () => {
  const claimedAt = ict("2026-07-30T09:00");

  it("is the 30 minutes the PRD promises", () => {
    expect(CLAIM_TIMEOUT_MINUTES).toBe(30);
  });

  it("holds for the first 29 minutes", () => {
    expect(isClaimExpired(claimedAt, ict("2026-07-30T09:29"))).toBe(false);
    expect(claimMinutesLeft(claimedAt, ict("2026-07-30T09:29"))).toBe(1);
  });

  it("releases exactly on the thirtieth minute", () => {
    expect(isClaimExpired(claimedAt, ict("2026-07-30T09:30"))).toBe(true);
    expect(claimMinutesLeft(claimedAt, ict("2026-07-30T09:30"))).toBe(0);
  });

  it("counts wall-clock minutes, not working ones", () => {
    // 16:50 on Saturday to 17:20 the same evening: outside working hours, but a
    // person who walked away is still away.
    expect(isClaimExpired(ict("2026-08-01T16:50"), ict("2026-08-01T17:20"))).toBe(true);
  });
});

describe("effective status", () => {
  it("reads an aged-out claim as pending again", () => {
    const held = request({
      status: "claimed",
      claimedByEmail: DIEU,
      claimedAt: ict("2026-07-30T09:00").toISOString(),
    });
    expect(effectiveStatus(held, ict("2026-07-30T09:29"))).toBe("claimed");
    expect(effectiveStatus(held, ict("2026-07-30T09:31"))).toBe("pending");
  });

  it("leaves a decided request alone", () => {
    const decided = request({ status: "approved", decidedByEmail: TRAN });
    expect(effectiveStatus(decided, ict("2026-08-30T09:00"))).toBe("approved");
  });
});

describe("who holds a request", () => {
  const held = request({
    status: "claimed",
    claimedByEmail: DIEU,
    claimedAt: ict("2026-07-30T09:00").toISOString(),
  });
  const now = ict("2026-07-30T09:10");

  it("names the holder", () => {
    expect(isHeldBy(held, DIEU, now)).toBe(true);
    expect(isHeldByOther(held, DIEU, now)).toBe(false);
  });

  it("greys the row out for everybody else", () => {
    expect(isHeldBy(held, TRAN, now)).toBe(false);
    expect(isHeldByOther(held, TRAN, now)).toBe(true);
  });

  it("is case-insensitive about the account email", () => {
    expect(isHeldBy(held, "Dieu@CTYHP.vn", now)).toBe(true);
  });

  it("releases to nobody once the claim ages out", () => {
    const later = ict("2026-07-30T09:31");
    expect(isHeldBy(held, DIEU, later)).toBe(false);
    expect(isHeldByOther(held, TRAN, later)).toBe(false);
  });
});

describe("rule 9 — nobody decides their own request", () => {
  it("recognises the approver's own request", () => {
    expect(isOwnRequest(request({ subjectEmail: DIEU }), DIEU)).toBe(true);
    expect(isOwnRequest(request({ subjectEmail: DIEU }), TRAN)).toBe(false);
  });

  it("says no when the request carries no account email at all", () => {
    expect(isOwnRequest(request(), DIEU)).toBe(false);
  });
});

describe("the four tabs", () => {
  const now = ict("2026-07-30T11:30");
  const waiting = request({ id: "a", submittedAt: ict("2026-07-30T11:00").toISOString() });
  const mine = request({
    id: "b",
    status: "claimed",
    claimedByEmail: DIEU,
    claimedAt: ict("2026-07-30T11:20").toISOString(),
  });
  const theirs = request({
    id: "c",
    status: "claimed",
    claimedByEmail: TRAN,
    claimedAt: ict("2026-07-30T11:20").toISOString(),
  });
  const decided = request({ id: "d", status: "approved", decidedByEmail: DIEU });
  // Filed at 09:00, unclaimed at 11:30 — two working hours have passed.
  const stale = request({ id: "e", submittedAt: ict("2026-07-30T09:00").toISOString() });

  const all = [waiting, mine, theirs, decided, stale];

  it("lists everything still awaiting a decision under Tất cả đơn chờ", () => {
    expect(all.filter((r) => belongsOnTab("pending", r, DIEU, now)).map((r) => r.id)).toEqual([
      "a",
      "b",
      "c",
      "e",
    ]);
  });

  it("lists only what this approver holds under Đơn tôi đã nhận", () => {
    expect(all.filter((r) => belongsOnTab("mine", r, DIEU, now)).map((r) => r.id)).toEqual(["b"]);
  });

  it("lists only this approver's own decisions under Đơn tôi đã duyệt", () => {
    expect(all.filter((r) => belongsOnTab("decided", r, DIEU, now)).map((r) => r.id)).toEqual(["d"]);
    expect(all.filter((r) => belongsOnTab("decided", r, TRAN, now))).toEqual([]);
  });

  it("counts two working hours, not two wall-clock hours, as overdue", () => {
    expect(all.filter((r) => belongsOnTab("overdue", r, DIEU, now)).map((r) => r.id)).toEqual(["e"]);
  });

  it("keeps a claimed request off the overdue tab — the clock stops on a claim", () => {
    const claimedButOld = request({
      id: "f",
      status: "claimed",
      claimedByEmail: TRAN,
      claimedAt: ict("2026-07-30T11:20").toISOString(),
      submittedAt: ict("2026-07-30T09:00").toISOString(),
    });
    expect(belongsOnTab("overdue", claimedButOld, DIEU, now)).toBe(false);
  });

  it("puts an aged-out claim back on the overdue tab", () => {
    const abandoned = request({
      id: "g",
      status: "claimed",
      claimedByEmail: TRAN,
      claimedAt: ict("2026-07-30T10:00").toISOString(),
      submittedAt: ict("2026-07-30T09:00").toISOString(),
    });
    expect(belongsOnTab("overdue", abandoned, DIEU, now)).toBe(true);
  });

  it("counts each tab for the menu badge", () => {
    expect(countByTab(all, DIEU, now)).toEqual({
      pending: 4,
      mine: 1,
      decided: 1,
      overdue: 1,
    });
  });
});
