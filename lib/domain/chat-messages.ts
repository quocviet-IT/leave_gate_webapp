/**
 * What goes into the two Google Chat spaces — PRD section VI.
 *
 * Two spaces, two audiences, and the difference between them is the whole
 * point of this module:
 *
 *   approvers — every request, so somebody picks it up
 *   guards    — approved gate passes only, so the gate knows who may leave
 *
 * The guards' space must never carry a reason (rules 14 and 19): a guard needs
 * a name, a time and a code, and nothing else. A rejection reason stays out of
 * both spaces — the employee is told on their own lookup page, not in front of
 * the room.
 *
 * Composition lives here, apart from the posting, so the rules can be tested
 * without a webhook.
 */

import { formatDate, formatDateTime, formatDuration, KIND_LABELS } from "@/lib/format";

export type ChatSpace = "approvers" | "guards";

export type ChatMessage = {
  space: ChatSpace;
  /** Groups every message about one request into a single Chat thread. */
  threadKey: string;
  text: string;
};

export type RequestForChat = {
  code: string;
  kind: "leave" | "gate";
  fullName: string;
  department: string | null;
  computedMinutes: number;
  /** Leave only. */
  fromDate?: string | null;
  toDate?: string | null;
  /** Gate only. */
  outAt?: string | null;
  expectedInAt?: string | null;
};

function whenText(request: RequestForChat): string {
  if (request.kind === "leave") {
    if (!request.fromDate) return "";
    return request.fromDate === request.toDate
      ? formatDate(request.fromDate)
      : `${formatDate(request.fromDate)} → ${formatDate(request.toDate!)}`;
  }
  if (!request.outAt) return "";
  return `${formatDateTime(request.outAt)} → ${formatDateTime(request.expectedInAt!)}`;
}

function who(request: RequestForChat): string {
  return request.department ? `${request.fullName} (${request.department})` : request.fullName;
}

/** A new request, for the approvers. Carries no reason — the queue has it. */
export function filedMessage(request: RequestForChat, queueUrl: string): ChatMessage {
  return {
    space: "approvers",
    threadKey: request.code,
    text: [
      `*Đơn mới ${request.code}* — ${KIND_LABELS[request.kind]}`,
      `${who(request)} · ${whenText(request)} · ${formatDuration(request.computedMinutes, request.kind)}`,
      `Mở hàng chờ: ${queueUrl}`,
    ].join("\n"),
  };
}

/**
 * The SLA nudge. Stage 1 is a gentle one; stage 2 names all four approvers, so
 * it takes the list rather than assuming it.
 */
export function reminderMessage(
  request: RequestForChat,
  stage: 1 | 2,
  approverNames: string[],
  queueUrl: string,
): ChatMessage {
  const head =
    stage === 1
      ? `*${request.code} đã chờ 1 giờ làm việc*`
      : `*${request.code} đã chờ 2 giờ làm việc mà chưa ai nhận*`;
  const tail =
    stage === 2 && approverNames.length > 0
      ? `\nNhờ ${approverNames.join(" · ")} xem giúp.`
      : "";
  return {
    space: "approvers",
    threadKey: request.code,
    text: `${head}\n${who(request)} · ${KIND_LABELS[request.kind]} · ${whenText(request)}${tail}\n${queueUrl}`,
  };
}

/** The decision, back into the request's own thread. */
export function decisionMessage(
  request: RequestForChat,
  decision: "approved" | "rejected",
  deciderName: string,
): ChatMessage {
  return {
    space: "approvers",
    threadKey: request.code,
    // Rule 10: a rejection may carry a reason, and it stays out of the room.
    text:
      decision === "approved"
        ? `✅ ${request.code} — ${deciderName} đã duyệt.`
        : `❌ ${request.code} — ${deciderName} đã từ chối. Lý do (nếu có) hiện trên đường dẫn theo dõi của người gửi.`,
  };
}

export function withdrawnMessage(request: RequestForChat): ChatMessage {
  return {
    space: "approvers",
    threadKey: request.code,
    text: `↩️ ${request.code} — người gửi đã rút đơn. Không cần xử lý nữa.`,
  };
}

/**
 * An approved gate pass, for the guards.
 *
 * Name, time, code. No reason, no note, no leave request ever — the same rule
 * the booth screen follows, because this message is read at the same gate.
 */
export function gatePassMessage(request: RequestForChat): ChatMessage | null {
  if (request.kind !== "gate") return null;
  return {
    space: "guards",
    threadKey: request.code,
    text: [
      `*Được ra cổng — ${request.code}*`,
      `${who(request)}`,
      `Ra ${formatDateTime(request.outAt!)} · dự kiến vào ${formatDateTime(request.expectedInAt!)}`,
    ].join("\n"),
  };
}

/** An approved gate pass that was cancelled: the guards must know. */
export function gatePassCancelledMessage(request: RequestForChat): ChatMessage | null {
  if (request.kind !== "gate") return null;
  return {
    space: "guards",
    threadKey: request.code,
    text: `⛔ ${request.code} — ${who(request)}: đơn đã bị huỷ, không cho ra cổng.`,
  };
}
