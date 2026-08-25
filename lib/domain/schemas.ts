/**
 * Input validation — every write crosses one of these schemas first.
 *
 * The public zone accepts input from an unauthenticated browser, so treat
 * everything as hostile: shapes here, business rules in `workhours.ts`, and the
 * final say in the database (PRD section XIII).
 */

import { z } from "zod";
import { GATE_REASONS, LEAVE_REASONS, needsReasonText } from "./reasons";
import { LATE_TOLERANCE_MINUTES } from "./workhours";

export { GATE_REASONS, LEAVE_REASONS } from "./reasons";

export const halfDaySchema = z.enum(["morning", "afternoon"]);

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày phải theo dạng YYYY-MM-DD");

const isoInstant = z.string().datetime({ offset: true });

/** A person's name as typed. The message differs by whose name it is. */
const typedName = (missing: string) =>
  z.string().trim().min(2, missing).max(100, "Tên quá dài");

/**
 * Who is filing.
 *
 * This used to require an id chosen from the synced staff list, so a person
 * could only file under a name the company had already registered. The board
 * asked for a typed name instead on 2026-08-25, accepting that the form can
 * now be filed under anybody's name — see CLAUDE.md section 6. Nothing here is
 * a credential either way; the approvers are the control point.
 *
 * The department is not decoration: it is how an approver knows which workshop
 * a request came from, and it used to arrive free with the staff row.
 */
export const submitterSchema = z.object({
  employeeName: typedName("Ghi họ và tên của bạn"),
  employeeDepartment: z
    .string()
    .trim()
    .min(2, "Ghi bộ phận hoặc xưởng của bạn")
    .max(100, "Tên bộ phận quá dài"),
  employeeTitle: z.string().trim().max(100, "Chức vụ quá dài").optional().default(""),
  // Set only when a supervisor filed on behalf and picked from their own
  // department's list. The public form never sends one.
  employeeId: z.string().uuid().optional(),
});

/**
 * Who a supervisor is filing for. A different way in, so a different rule: the
 * person is chosen from the supervisor's own department list, which means an
 * id — and the name, title and department come from that row rather than from
 * anything typed.
 */
export const onBehalfSubmitterSchema = z.object({
  employeeId: z.string().uuid("Chọn người trong xưởng của bạn"),
});

export const leaveRequestSchema = z
  .object({
    kind: z.literal("leave"),
    fromDate: dateOnly,
    toDate: dateOnly,
    halfDay: halfDaySchema.nullish(),
    reason: z.enum(LEAVE_REASONS),
    reasonText: z.string().trim().max(500).optional().default(""),
    note: z.string().trim().min(1, "Ghi rõ lý do nghỉ").max(1000),
    handoverName: typedName("Ghi tên người nhận bàn giao"),
    makeupDate: dateOnly.nullish(),
    committed: z.literal(true, { message: "Phải tích cam kết trước khi gửi" }),
  })
  .refine((v) => v.toDate >= v.fromDate, {
    message: "Ngày kết thúc phải từ ngày bắt đầu trở đi",
    path: ["toDate"],
  })
  .refine((v) => !v.halfDay || v.fromDate === v.toDate, {
    message: "Nghỉ nửa ngày chỉ áp dụng cho một ngày",
    path: ["halfDay"],
  })
  .refine((v) => !needsReasonText("leave", v.reason) || v.reasonText.length > 0, {
    message: "Chọn lý do này thì phải ghi rõ",
    path: ["reasonText"],
  });

export const gateRequestSchema = z
  .object({
    kind: z.literal("gate"),
    reason: z.enum(GATE_REASONS),
    reasonText: z.string().trim().max(500).optional().default(""),
    note: z.string().trim().min(1, "Ghi rõ nội dung").max(1000),
    outAt: isoInstant,
    expectedInAt: isoInstant,
  })
  .refine((v) => new Date(v.expectedInAt) > new Date(v.outAt), {
    message: "Giờ vào lại phải sau giờ ra",
    path: ["expectedInAt"],
  })
  .refine((v) => !needsReasonText("gate", v.reason) || v.reasonText.length > 0, {
    message: 'Chọn "Khác" thì phải ghi rõ',
    path: ["reasonText"],
  });

/** One route, two shapes — the dynamic form in PRD section X. */
export const requestDetailSchema = z.discriminatedUnion("kind", [
  leaveRequestSchema,
  gateRequestSchema,
]);

export const submitRequestSchema = z.object({
  submitter: submitterSchema,
  detail: requestDetailSchema,
  /** Set when a supervisor files for a worker; the account doing the filing. */
  onBehalfOf: z.string().email().nullish(),
});

const lookupToken = z.string().regex(/^[0-9a-f]{32}$/, "Đường dẫn tra cứu không hợp lệ");

/**
 * The employee's own update of a real return time, from the lookup page.
 * Authorised by the token alone — the private link is the only secret the
 * public zone has.
 */
export const actualReturnSchema = z
  .object({
    lookupToken,
    actualInAt: isoInstant,
    driftMinutes: z.number().int(),
    driftReason: z.string().trim().max(500).optional().default(""),
  })
  .refine(
    (v) => Math.abs(v.driftMinutes) <= LATE_TOLERANCE_MINUTES || v.driftReason.length > 0,
    {
      message: `Lệch quá ${LATE_TOLERANCE_MINUTES} phút thì phải ghi lý do`,
      path: ["driftReason"],
    },
  );

export const withdrawSchema = z.object({ lookupToken });

/**
 * Looking a request up by its printed code. The code is sequential and
 * therefore guessable, so this path may only ever answer with a status — never
 * a name, a date or a reason. Full detail requires the token above.
 */
export const statusLookupSchema = z.object({
  requestCode: z
    .string()
    .trim()
    .regex(/^(NP|RC)-\d{4}-\d{4}$/, "Mã đơn có dạng NP-2607-0148"),
});

export const claimSchema = z.object({
  requestId: z.string().uuid(),
  /** The row version the approver was looking at — PRD rule 8. */
  version: z.number().int().nonnegative(),
});

export const decisionSchema = z.object({
  requestId: z.string().uuid(),
  version: z.number().int().nonnegative(),
  decision: z.enum(["approved", "rejected"]),
  note: z.string().trim().max(1000).optional().default(""),
});

export const gateStampSchema = z.object({
  requestId: z.string().uuid(),
  direction: z.enum(["out", "in"]),
  boothId: z.string().uuid(),
});

/** C&B editing the final hours. The reason is not optional — PRD rule 16. */
export const finalHoursSchema = z.object({
  requestId: z.string().uuid(),
  finalMinutes: z.number().int().min(0).max(60 * 24 * 40),
  reason: z.string().trim().min(10, "Lý do điều chỉnh phải từ 10 ký tự"),
});

export type StatusLookupInput = z.infer<typeof statusLookupSchema>;
export type WithdrawInput = z.infer<typeof withdrawSchema>;
export type SubmitRequestInput = z.infer<typeof submitRequestSchema>;
export type LeaveRequestInput = z.infer<typeof leaveRequestSchema>;
export type GateRequestInput = z.infer<typeof gateRequestSchema>;
export type ActualReturnInput = z.infer<typeof actualReturnSchema>;
export type DecisionInput = z.infer<typeof decisionSchema>;
export type FinalHoursInput = z.infer<typeof finalHoursSchema>;
