/**
 * The approval queue's own rules — PRD section VII, rules 7 to 10.
 *
 * Claiming exists only so four approvers do not collide. It is not an
 * assignment: all four keep equal authority, and a claim nobody acts on returns
 * to the queue by itself. That release is *implicit* — no job runs, the row is
 * simply read as pending again once its claim has aged out, and every write
 * path re-checks the same way.
 *
 * The 30 minutes here are wall-clock, not working time: the point is that a
 * person walked away from their desk, which does not pause at 17:00. The SLA
 * clock in `sla.ts` is the one that counts working minutes.
 */

import { isOverdue } from "./sla";

/** How long a claim survives without a decision. */
export const CLAIM_TIMEOUT_MINUTES = 30;

export type QueueTab = "pending" | "mine" | "decided" | "overdue";

export const QUEUE_TABS: QueueTab[] = ["pending", "mine", "decided", "overdue"];

/** What each tab is called on screen. */
export const QUEUE_TAB_LABELS: Record<QueueTab, string> = {
  pending: "Tất cả đơn chờ",
  mine: "Đơn tôi đã nhận",
  decided: "Đơn tôi đã duyệt",
  overdue: "Quá hạn",
};

export function isQueueTab(value: string): value is QueueTab {
  return (QUEUE_TABS as string[]).includes(value);
}

/** The shape the queue needs. Anything wider is the caller's business. */
export type QueueRequest = {
  id: string;
  status: "pending" | "claimed" | "approved" | "rejected" | "withdrawn";
  submittedAt: string;
  claimedByEmail: string | null;
  claimedAt: string | null;
  decidedByEmail: string | null;
  /** The account email of whoever the request is *about*, when there is one. */
  subjectEmail: string | null;
};

export function claimExpiresAt(claimedAt: Date): Date {
  return new Date(claimedAt.getTime() + CLAIM_TIMEOUT_MINUTES * 60_000);
}

export function isClaimExpired(claimedAt: Date, now: Date): boolean {
  return now.getTime() >= claimExpiresAt(claimedAt).getTime();
}

/** Whole minutes left on a claim, floored at zero. */
export function claimMinutesLeft(claimedAt: Date, now: Date): number {
  const left = claimExpiresAt(claimedAt).getTime() - now.getTime();
  return left <= 0 ? 0 : Math.ceil(left / 60_000);
}

/**
 * The status the queue should act on. A claim that has aged out reads as
 * pending everywhere — on screen, in the tab counts, and in the database
 * functions — so the two can never disagree about who holds what.
 */
export function effectiveStatus(request: QueueRequest, now: Date): QueueRequest["status"] {
  if (request.status !== "claimed") return request.status;
  if (!request.claimedAt) return "pending";
  return isClaimExpired(new Date(request.claimedAt), now) ? "pending" : "claimed";
}

/** Whether this approver is still holding the request. */
export function isHeldBy(request: QueueRequest, email: string, now: Date): boolean {
  return (
    effectiveStatus(request, now) === "claimed" &&
    (request.claimedByEmail ?? "").toLowerCase() === email.toLowerCase()
  );
}

/** Held by somebody else — the row an approver may look at but not act on. */
export function isHeldByOther(request: QueueRequest, email: string, now: Date): boolean {
  return (
    effectiveStatus(request, now) === "claimed" &&
    (request.claimedByEmail ?? "").toLowerCase() !== email.toLowerCase()
  );
}

/**
 * PRD rule 9: nobody decides their own request. Matched on the account email,
 * because that is the one identifier both the session and the request carry.
 */
export function isOwnRequest(request: QueueRequest, email: string): boolean {
  if (!request.subjectEmail) return false;
  return request.subjectEmail.toLowerCase() === email.toLowerCase();
}

/** Still waiting for a decision — the "Tất cả đơn chờ" tab. */
export function isAwaitingDecision(request: QueueRequest, now: Date): boolean {
  const status = effectiveStatus(request, now);
  return status === "pending" || status === "claimed";
}

/** Which tab a request belongs on. A request can appear on more than one. */
export function belongsOnTab(
  tab: QueueTab,
  request: QueueRequest,
  email: string,
  now: Date,
): boolean {
  switch (tab) {
    case "pending":
      return isAwaitingDecision(request, now);
    case "mine":
      return isHeldBy(request, email, now);
    case "decided":
      return (
        (request.status === "approved" || request.status === "rejected") &&
        (request.decidedByEmail ?? "").toLowerCase() === email.toLowerCase()
      );
    case "overdue":
      // Unclaimed past the second SLA reminder — two working hours, not two
      // wall-clock hours, so nothing goes red overnight.
      return (
        effectiveStatus(request, now) === "pending" &&
        isOverdue(new Date(request.submittedAt), now)
      );
  }
}

export function countByTab(
  requests: QueueRequest[],
  email: string,
  now: Date,
): Record<QueueTab, number> {
  const counts = { pending: 0, mine: 0, decided: 0, overdue: 0 } as Record<QueueTab, number>;
  for (const tab of QUEUE_TABS) {
    counts[tab] = requests.filter((request) => belongsOnTab(tab, request, email, now)).length;
  }
  return counts;
}
