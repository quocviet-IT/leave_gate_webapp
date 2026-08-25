/**
 * Reason codes, the labels the public form offers for them, and the rule about
 * which ones oblige a written explanation.
 *
 * This module imports nothing, and must keep importing nothing. `ReasonField`
 * is a client component, so whatever it reads is shipped to the browser: when
 * this rule lived in `schemas.ts` the import pulled zod into the public bundle
 * and `/don` went 55 KB over its budget. The validation library belongs on the
 * server; the rule belongs to both.
 */

export type RequestKind = "leave" | "gate";

export const LEAVE_REASONS = [
  "unpaid",
  "annual",
  "sick",
  "marriage",
  "maternity",
  "bereavement",
  "special",
  "other",
] as const;

export const GATE_REASONS = ["business_trip", "leave", "other"] as const;

/**
 * What the form shows for each code. The order is the paper form's own, and a
 * test holds these to exactly the codes above — a label list and an accepted
 * list that drift apart is an option a person can pick and the server refuses.
 */
export const LEAVE_REASON_OPTIONS: readonly (readonly [string, string])[] = [
  ["unpaid", "Nghỉ không lương"],
  ["annual", "Phép năm"],
  ["sick", "Ốm đau"],
  ["marriage", "Kết hôn"],
  ["maternity", "Thai sản"],
  ["bereavement", "Tang chế"],
  ["special", "Trường hợp đặc biệt"],
  ["other", "Khác"],
];

export const GATE_REASON_OPTIONS: readonly (readonly [string, string])[] = [
  ["business_trip", "Đi công tác"],
  ["leave", "Nghỉ phép"],
  ["other", "Khác"],
];

/** Reasons that force the person to write what they mean. */
const REASONS_NEEDING_TEXT: Record<RequestKind, readonly string[]> = {
  leave: ["special", "other"],
  gate: ["other"],
};

/**
 * Whether this reason obliges the person to say more.
 *
 * The form reveals the text box from this, and the schemas refuse an empty one
 * from this — so what a person is asked for and what the server insists on
 * cannot drift apart.
 */
export function needsReasonText(kind: RequestKind, reason: string): boolean {
  return REASONS_NEEDING_TEXT[kind].includes(reason);
}
