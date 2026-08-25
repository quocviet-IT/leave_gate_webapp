"use server";

import { revalidatePath } from "next/cache";
import type { TimesheetActionState } from "./action-state";
import { requireRole } from "@/lib/auth";
import { finalHoursSchema } from "@/lib/domain/schemas";
import { markTimesheet, setFinalHours } from "@/lib/services/timesheet";

function value(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

async function cnbEmail(): Promise<string> {
  const { user } = await requireRole("cnb");
  return (user.email ?? "").toLowerCase();
}

/**
 * Rule 16 lives in three places on purpose, and they say the same thing: the
 * screen disables the button, `finalHoursSchema` refuses the payload, and
 * `lg_set_final_hours` refuses the write. Only the last one is a guarantee.
 */
export async function setFinalHoursAction(
  _previous: TimesheetActionState,
  formData: FormData,
): Promise<TimesheetActionState> {
  const email = await cnbEmail();
  const requestId = value(formData, "requestId");
  const hours = Number.parseFloat(value(formData, "finalHours").replace(",", "."));

  if (!Number.isFinite(hours) || hours < 0) {
    return { ok: false, requestId, message: "Số giờ chốt không hợp lệ." };
  }

  const parsed = finalHoursSchema.safeParse({
    requestId,
    finalMinutes: Math.round(hours * 60),
    reason: value(formData, "reason"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      requestId,
      message: parsed.error.issues[0]?.message ?? "Chưa lưu được số giờ chốt.",
    };
  }

  try {
    await setFinalHours({
      requestId: parsed.data.requestId,
      finalMinutes: parsed.data.finalMinutes,
      reason: parsed.data.reason,
      email,
    });
  } catch (cause) {
    return {
      ok: false,
      requestId,
      message: cause instanceof Error ? cause.message : "Chưa lưu được số giờ chốt.",
    };
  }

  revalidatePath("/admin/cham-cong");
  return { ok: true, requestId, message: "Đã lưu số giờ chốt." };
}

export async function markTimesheetAction(
  _previous: TimesheetActionState,
  formData: FormData,
): Promise<TimesheetActionState> {
  const email = await cnbEmail();
  const requestId = value(formData, "requestId");
  const done = value(formData, "done") === "1";

  try {
    await markTimesheet(requestId, email, done);
  } catch (cause) {
    return {
      ok: false,
      requestId,
      message: cause instanceof Error ? cause.message : "Chưa đánh dấu được.",
    };
  }

  revalidatePath("/admin/cham-cong");
  return { ok: true, requestId, message: done ? "Đã đánh dấu xong." : "Đã bỏ đánh dấu." };
}
