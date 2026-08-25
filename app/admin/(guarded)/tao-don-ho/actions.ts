"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import type { OnBehalfState } from "./action-state";
import { requireRole } from "@/lib/auth";
import { deviceHash } from "@/lib/device";
import {
  gateRequestSchema,
  leaveRequestSchema,
  onBehalfSubmitterSchema,
} from "@/lib/domain/schemas";
import { computeGateMinutes, computeLeaveMinutes } from "@/lib/domain/workhours";
import { fileOnBehalf, supervisorEmployees } from "@/lib/services/supervisor";

function value(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function ictTimestamp(local: string): string {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return `${local}:00+07:00`;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(local)) return `${local}+07:00`;
  return local;
}

function issuesOf(issues: { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const field = String(issue.path[0] ?? "form");
    errors[field] ??= issue.message;
  }
  return errors;
}

function todayInIct(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/**
 * The hours are recomputed here from the dates, exactly as the public form does
 * — a supervisor's browser is no more trusted with a figure than a worker's
 * (CLAUDE.md section 5).
 */
export async function fileOnBehalfAction(
  _previous: OnBehalfState,
  formData: FormData,
): Promise<OnBehalfState> {
  const { user } = await requireRole("supervisor");
  const email = (user.email ?? "").toLowerCase();

  const kind = value(formData, "kind");
  if (kind !== "leave" && kind !== "gate") {
    return { ok: false, message: "Loại đơn không hợp lệ.", errors: { kind: "Chọn loại đơn" } };
  }

  const submitter = onBehalfSubmitterSchema.safeParse({
    employeeId: value(formData, "employeeId"),
  });
  if (!submitter.success) {
    return {
      ok: false,
      message: "Chọn người bạn gửi hộ.",
      errors: issuesOf(submitter.error.issues),
    };
  }

  let detail: Record<string, unknown>;
  let computedMinutes: number;

  if (kind === "leave") {
    const parsed = leaveRequestSchema.safeParse({
      kind,
      fromDate: value(formData, "fromDate"),
      toDate: value(formData, "toDate"),
      halfDay: value(formData, "halfDay") || null,
      reason: value(formData, "reason"),
      reasonText: value(formData, "reasonText"),
      note: value(formData, "note"),
      handoverName: value(formData, "handoverName"),
      makeupDate: value(formData, "makeupDate") || null,
      committed: formData.get("committed") === "on",
    });
    if (!parsed.success) {
      return {
        ok: false,
        message: "Một số thông tin chưa đúng.",
        errors: issuesOf(parsed.error.issues),
      };
    }
    detail = parsed.data;
    computedMinutes = computeLeaveMinutes({
      fromDate: parsed.data.fromDate,
      toDate: parsed.data.toDate,
      halfDay: parsed.data.halfDay,
    });
  } else {
    const parsed = gateRequestSchema.safeParse({
      kind,
      reason: value(formData, "reason"),
      reasonText: value(formData, "reasonText"),
      note: value(formData, "note"),
      outAt: ictTimestamp(value(formData, "outAt")),
      expectedInAt: ictTimestamp(value(formData, "expectedInAt")),
    });
    if (!parsed.success) {
      return {
        ok: false,
        message: "Một số thông tin chưa đúng.",
        errors: issuesOf(parsed.error.issues),
      };
    }
    detail = parsed.data;
    computedMinutes = computeGateMinutes(
      new Date(parsed.data.outAt),
      new Date(parsed.data.expectedInAt),
    );
  }

  let filed: { code: string; token: string };
  try {
    const incoming = await headers();
    const throttleKey = await deviceHash(
      new Headers({
        "x-forwarded-for": incoming.get("x-forwarded-for") ?? "",
        "user-agent": incoming.get("user-agent") ?? "",
      }),
      todayInIct(),
    );
    filed = await fileOnBehalf({
      employeeId: submitter.data.employeeId,
      kind,
      detail,
      computedMinutes,
      deviceHash: throttleKey,
      email,
    });
  } catch (cause) {
    return {
      ok: false,
      message: cause instanceof Error ? cause.message : "Gửi đơn hộ không thành công.",
      errors: {},
    };
  }

  const people = await supervisorEmployees(email);
  const person = people.find((candidate) => candidate.id === submitter.data.employeeId);

  revalidatePath("/admin/tao-don-ho");
  return {
    ok: true,
    message: `Đã gửi đơn ${filed.code}.`,
    errors: {},
    filed: { ...filed, employeeName: person?.fullName ?? "" },
  };
}
