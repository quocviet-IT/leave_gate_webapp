"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { FileState } from "./action-state";
import { deviceHash } from "@/lib/device";
import {
  gateRequestSchema,
  leaveRequestSchema,
  submitterSchema,
} from "@/lib/domain/schemas";
import { computeGateMinutes, computeLeaveMinutes } from "@/lib/domain/workhours";
import { fileRequest } from "@/lib/services/requests";

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

export async function fileRequestAction(
  _previous: FileState,
  formData: FormData,
): Promise<FileState> {
  const kind = value(formData, "kind");
  if (kind !== "leave" && kind !== "gate") {
    return { ok: false, message: "Loại đơn không hợp lệ.", errors: { kind: "Chọn loại đơn" } };
  }

  const submitter = submitterSchema.safeParse({ employeeId: value(formData, "employeeId") });
  if (!submitter.success) {
    return {
      ok: false,
      message: "Kiểm tra lại người gửi.",
      errors: issuesOf(submitter.error.issues),
    };
  }

  let filed: { code: string; token: string };
  try {
    let parsedDetail: Record<string, unknown>;
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
        handoverEmployeeId: value(formData, "handoverEmployeeId"),
        makeupDate: value(formData, "makeupDate") || null,
        committed: formData.get("committed") === "on",
      });
      if (!parsed.success) {
        return {
          ok: false,
          message: "Một số thông tin chưa đúng. Kiểm tra các ô được báo bên dưới.",
          errors: issuesOf(parsed.error.issues),
        };
      }
      parsedDetail = parsed.data;
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
          message: "Một số thông tin chưa đúng. Kiểm tra các ô được báo bên dưới.",
          errors: issuesOf(parsed.error.issues),
        };
      }
      parsedDetail = parsed.data;
      computedMinutes = computeGateMinutes(
        new Date(parsed.data.outAt),
        new Date(parsed.data.expectedInAt),
      );
    }

    const incoming = await headers();
    const throttleHeaders = new Headers({
      "x-forwarded-for": incoming.get("x-forwarded-for") ?? "",
      "user-agent": incoming.get("user-agent") ?? "",
    });
    const throttleKey = await deviceHash(throttleHeaders, todayInIct());
    filed = await fileRequest({
      employeeId: submitter.data.employeeId,
      kind,
      detail: parsedDetail,
      computedMinutes,
      deviceHash: throttleKey,
    });
  } catch (cause) {
    return {
      ok: false,
      message: cause instanceof Error ? cause.message : "Gửi đơn không thành công. Vui lòng thử lại.",
      errors: {},
    };
  }

  const destination = new URLSearchParams({ code: filed.code, token: filed.token });
  redirect(`/don/xong?${destination.toString()}`);
}
