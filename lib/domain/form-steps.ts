/**
 * The shape of the public form: three steps, each asking two or three things.
 *
 * Every field on the paper form is kept (PRD section X). "Minimal" means fewer
 * questions per screen, not fewer questions. Optional fields sit in the last
 * step so a worker who has nothing to add can move through it quickly.
 */

import { z } from "zod";
import { GATE_REASONS, LEAVE_REASONS } from "./schemas";

export type RequestKind = "leave" | "gate";
export type FormStep = 1 | 2 | 3;

const STEPS: Record<RequestKind, Record<FormStep, string[]>> = {
  leave: {
    1: ["kind", "employeeId"],
    2: ["fromDate", "toDate", "halfDay", "reason", "reasonText", "note"],
    3: ["handoverEmployeeId", "makeupDate", "committed"],
  },
  gate: {
    1: ["kind", "employeeId"],
    2: ["reason", "reasonText", "outAt", "expectedInAt", "note"],
    3: [],
  },
};

export function stepFieldsFor(kind: RequestKind, step: FormStep): string[] {
  return STEPS[kind][step];
}

/** The last step a given kind actually has. */
export function lastStepFor(kind: RequestKind): FormStep {
  return stepFieldsFor(kind, 3).length > 0 ? 3 : 2;
}

const uuid = z.string().uuid();
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

type Values = Record<string, string | undefined>;
export type StepResult = { ok: boolean; errors: Record<string, string> };

function result(errors: Record<string, string>): StepResult {
  return { ok: Object.keys(errors).length === 0, errors };
}

export function validateStep(kind: RequestKind, step: FormStep, values: Values): StepResult {
  const errors: Record<string, string> = {};

  if (step === 1) {
    if (!uuid.safeParse(values.employeeId ?? "").success) {
      errors.employeeId = "Chọn tên của bạn trong danh sách";
    }
    return result(errors);
  }

  if (step === 2 && kind === "leave") {
    if (!dateOnly.safeParse(values.fromDate ?? "").success) errors.fromDate = "Chọn ngày bắt đầu";
    if (!dateOnly.safeParse(values.toDate ?? "").success) errors.toDate = "Chọn ngày kết thúc";
    if (!errors.fromDate && !errors.toDate && (values.toDate ?? "") < (values.fromDate ?? "")) {
      errors.toDate = "Ngày kết thúc phải từ ngày bắt đầu trở đi";
    }
    if (values.halfDay && values.fromDate !== values.toDate) {
      errors.halfDay = "Nghỉ nửa ngày chỉ áp dụng cho một ngày";
    }
    if (!LEAVE_REASONS.includes((values.reason ?? "") as (typeof LEAVE_REASONS)[number])) {
      errors.reason = "Chọn lý do nghỉ";
    }
    if (
      (values.reason === "special" || values.reason === "other") &&
      (values.reasonText ?? "").trim() === ""
    ) {
      errors.reasonText = "Chọn lý do này thì phải ghi rõ";
    }
    if ((values.note ?? "").trim() === "") errors.note = "Ghi rõ lý do nghỉ";
    return result(errors);
  }

  if (step === 2 && kind === "gate") {
    if (!GATE_REASONS.includes((values.reason ?? "") as (typeof GATE_REASONS)[number])) {
      errors.reason = "Chọn lý do xin phép";
    }
    if (values.reason === "other" && (values.reasonText ?? "").trim() === "") {
      errors.reasonText = 'Chọn "Khác" thì phải ghi rõ';
    }
    const out = Date.parse(values.outAt ?? "");
    const back = Date.parse(values.expectedInAt ?? "");
    if (Number.isNaN(out)) errors.outAt = "Chọn giờ ra";
    if (Number.isNaN(back)) errors.expectedInAt = "Chọn giờ vào lại";
    if (!Number.isNaN(out) && !Number.isNaN(back) && back <= out) {
      errors.expectedInAt = "Giờ vào lại phải sau giờ ra";
    }
    if ((values.note ?? "").trim() === "") errors.note = "Ghi rõ nội dung";
    return result(errors);
  }

  if (step === 3 && kind === "leave") {
    if (!uuid.safeParse(values.handoverEmployeeId ?? "").success) {
      errors.handoverEmployeeId = "Chọn người nhận bàn giao";
    }
    if (values.committed !== "on") errors.committed = "Phải tích cam kết trước khi gửi";
    return result(errors);
  }

  return result(errors);
}
