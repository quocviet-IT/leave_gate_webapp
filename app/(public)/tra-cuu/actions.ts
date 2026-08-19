"use server";

import { redirect } from "next/navigation";
import type { PublicActionState } from "./action-state";
import { actualReturnSchema, withdrawSchema } from "@/lib/domain/schemas";
import {
  endOfNextWorkingDay,
  returnDriftMinutes,
} from "@/lib/domain/workhours";
import {
  lookupRequest,
  setActualReturn,
  withdrawRequest,
} from "@/lib/services/requests";

function value(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function ictTimestamp(local: string): string {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return `${local}:00+07:00`;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(local)) return `${local}+07:00`;
  return local;
}

function firstErrors(issues: { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const field = String(issue.path[0] ?? "form");
    errors[field] ??= issue.message;
  }
  return errors;
}

export async function withdrawRequestAction(
  _previous: PublicActionState,
  formData: FormData,
): Promise<PublicActionState> {
  const token = value(formData, "lookupToken");
  const reason = value(formData, "reason");
  const parsed = withdrawSchema.safeParse({ lookupToken: token });
  if (!parsed.success) {
    return {
      ok: false,
      message: "Đường dẫn theo dõi không hợp lệ.",
      errors: firstErrors(parsed.error.issues),
    };
  }
  if (reason.length > 500) {
    return {
      ok: false,
      message: "Lý do rút đơn quá dài.",
      errors: { reason: "Lý do tối đa 500 ký tự" },
    };
  }

  try {
    await withdrawRequest(parsed.data.lookupToken, reason);
  } catch (cause) {
    return {
      ok: false,
      message: cause instanceof Error ? cause.message : "Chưa rút được đơn. Vui lòng thử lại.",
      errors: {},
    };
  }

  redirect(`/tra-cuu/${parsed.data.lookupToken}?cap-nhat=da-rut`);
}

export async function setActualReturnAction(
  _previous: PublicActionState,
  formData: FormData,
): Promise<PublicActionState> {
  const token = value(formData, "lookupToken");
  const actualInAt = ictTimestamp(value(formData, "actualInAt"));
  const driftReason = value(formData, "driftReason");

  let request: Awaited<ReturnType<typeof lookupRequest>>;
  try {
    request = await lookupRequest(token);
  } catch (cause) {
    return {
      ok: false,
      message:
        cause instanceof Error
          ? cause.message
          : "Chưa kiểm tra được đơn. Vui lòng thử lại.",
      errors: {},
    };
  }
  if (!request || request.kind !== "gate") {
    return {
      ok: false,
      message: "Không tìm thấy giấy ra vào cổng từ đường dẫn này.",
      errors: { lookupToken: "Đường dẫn theo dõi không hợp lệ" },
    };
  }

  const deadline = endOfNextWorkingDay(new Date(request.detail.expectedInAt));
  if (Date.now() > deadline.getTime()) {
    return {
      ok: false,
      message: "Đã hết hạn nhập giờ vào lại. Liên hệ C&B để điều chỉnh.",
      errors: { actualInAt: "Đã hết hạn nhập" },
    };
  }

  const actualDate = new Date(actualInAt);
  // A return time cannot have happened yet if it is still ahead of us. Five
  // minutes of slack covers a phone clock running fast; the same bound is
  // enforced again in `lg_set_actual_return`.
  if (Number.isNaN(actualDate.getTime())) {
    return {
      ok: false,
      message: "Kiểm tra lại giờ vào lại thực tế.",
      errors: { actualInAt: "Chưa nhập giờ vào lại hợp lệ" },
    };
  }
  if (actualDate.getTime() > Date.now() + 5 * 60_000) {
    return {
      ok: false,
      message: "Giờ vào lại thực tế không được ở tương lai.",
      errors: { actualInAt: "Chỉ nhập giờ bạn đã thực sự quay lại" },
    };
  }
  const driftMinutes = returnDriftMinutes(
    new Date(request.detail.expectedInAt),
    actualDate,
  );
  const parsed = actualReturnSchema.safeParse({
    lookupToken: token,
    actualInAt,
    driftMinutes,
    driftReason,
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: "Kiểm tra lại giờ vào và lý do chênh lệch.",
      errors: firstErrors(parsed.error.issues),
    };
  }

  try {
    await setActualReturn({
      token: parsed.data.lookupToken,
      actualInAt: parsed.data.actualInAt,
      driftMinutes: parsed.data.driftMinutes,
      driftReason: parsed.data.driftReason,
      deadline: deadline.toISOString(),
    });
  } catch (cause) {
    return {
      ok: false,
      message:
        cause instanceof Error
          ? cause.message
          : "Chưa lưu được giờ vào lại. Vui lòng thử lại.",
      errors: {},
    };
  }

  redirect(`/tra-cuu/${parsed.data.lookupToken}?cap-nhat=gio-vao`);
}
