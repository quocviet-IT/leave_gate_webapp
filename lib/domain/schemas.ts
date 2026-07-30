/**
 * Input validation — every write crosses one of these schemas first.
 *
 * The public zone accepts input from an unauthenticated browser, so treat
 * everything as hostile: shapes here, business rules in `workhours.ts`, and the
 * final say in the database (PRD section XIII).
 */

import { z } from "zod";
import { LATE_TOLERANCE_MINUTES } from "./workhours";

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

/** Reasons that force the person to write what they mean. */
const LEAVE_REASONS_NEEDING_TEXT: readonly string[] = ["special", "other"];

export const halfDaySchema = z.enum(["morning", "afternoon"]);

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày phải theo dạng YYYY-MM-DD");

const isoInstant = z.string().datetime({ offset: true });

/** Who is filing — the public form's whole identity check. */
export const submitterSchema = z.object({
  employeeId: z.string().uuid("Phải chọn tên trong danh sách"),
  employeeCode: z
    .string()
    .trim()
    .min(2, "Nhập mã CBNV của bạn")
    .max(32, "Mã CBNV quá dài"),
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
    handoverEmployeeId: z.string().uuid("Chọn người nhận bàn giao"),
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
  .refine((v) => !LEAVE_REASONS_NEEDING_TEXT.includes(v.reason) || v.reasonText.length > 0, {
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
  .refine((v) => v.reason !== "other" || v.reasonText.length > 0, {
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

/** The employee's own update of a real return time, from the lookup page. */
export const actualReturnSchema = z
  .object({
    lookupToken: z.string().regex(/^[0-9a-f]{32}$/, "Đường dẫn tra cứu không hợp lệ"),
    employeeCode: z.string().trim().min(2).max(32),
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

export const withdrawSchema = z.object({
  lookupToken: z.string().regex(/^[0-9a-f]{32}$/),
  employeeCode: z.string().trim().min(2).max(32),
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

export type SubmitRequestInput = z.infer<typeof submitRequestSchema>;
export type LeaveRequestInput = z.infer<typeof leaveRequestSchema>;
export type GateRequestInput = z.infer<typeof gateRequestSchema>;
export type ActualReturnInput = z.infer<typeof actualReturnSchema>;
export type DecisionInput = z.infer<typeof decisionSchema>;
export type FinalHoursInput = z.infer<typeof finalHoursSchema>;
