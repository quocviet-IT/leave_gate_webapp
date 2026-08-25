"use server";

import { revalidatePath } from "next/cache";
import type { ApprovalActionState } from "./action-state";
import { requireRole } from "@/lib/auth";
import { claimSchema, decisionSchema } from "@/lib/domain/schemas";
import { claimRequest, decideRequest, releaseRequest } from "@/lib/services/approvals";
import { notifyDecision } from "@/lib/services/notify";

function value(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function versionOf(formData: FormData): number {
  return Number.parseInt(value(formData, "version"), 10);
}

/**
 * Every action here re-reads the session rather than trusting anything the form
 * carries. The request id and the row version come from the screen; the
 * approver does not.
 */
async function approverEmail(): Promise<string> {
  const { user } = await requireRole("approver");
  return (user.email ?? "").toLowerCase();
}

function refused(requestId: string, cause: unknown, fallback: string): ApprovalActionState {
  return {
    ok: false,
    requestId,
    message: cause instanceof Error ? cause.message : fallback,
  };
}

export async function claimRequestAction(
  _previous: ApprovalActionState,
  formData: FormData,
): Promise<ApprovalActionState> {
  const email = await approverEmail();
  const parsed = claimSchema.safeParse({
    requestId: value(formData, "requestId"),
    version: versionOf(formData),
  });
  if (!parsed.success) {
    return { ok: false, requestId: value(formData, "requestId"), message: "Đơn không hợp lệ." };
  }

  try {
    await claimRequest(parsed.data.requestId, parsed.data.version, email);
  } catch (cause) {
    return refused(parsed.data.requestId, cause, "Chưa nhận được đơn. Thử lại.");
  }

  revalidatePath("/admin/duyet-don");
  return { ok: true, requestId: parsed.data.requestId, message: "Bạn đang xử lý đơn này." };
}

export async function releaseRequestAction(
  _previous: ApprovalActionState,
  formData: FormData,
): Promise<ApprovalActionState> {
  const email = await approverEmail();
  const parsed = claimSchema.safeParse({
    requestId: value(formData, "requestId"),
    version: versionOf(formData),
  });
  if (!parsed.success) {
    return { ok: false, requestId: value(formData, "requestId"), message: "Đơn không hợp lệ." };
  }

  try {
    await releaseRequest(parsed.data.requestId, parsed.data.version, email);
  } catch (cause) {
    return refused(parsed.data.requestId, cause, "Chưa trả lại được đơn. Thử lại.");
  }

  revalidatePath("/admin/duyet-don");
  return { ok: true, requestId: parsed.data.requestId, message: "Đã trả đơn về hàng chờ." };
}

export async function decideRequestAction(
  _previous: ApprovalActionState,
  formData: FormData,
): Promise<ApprovalActionState> {
  const email = await approverEmail();
  const requestId = value(formData, "requestId");
  const parsed = decisionSchema.safeParse({
    requestId,
    version: versionOf(formData),
    decision: value(formData, "decision"),
    note: value(formData, "note"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      requestId,
      message: parsed.error.issues[0]?.message ?? "Quyết định không hợp lệ.",
    };
  }

  try {
    await decideRequest({
      requestId: parsed.data.requestId,
      version: parsed.data.version,
      email,
      decision: parsed.data.decision,
      note: parsed.data.note,
    });
  } catch (cause) {
    return refused(parsed.data.requestId, cause, "Chưa lưu được quyết định. Thử lại.");
  }

  await notifyDecision(parsed.data.requestId, parsed.data.decision, email);

  revalidatePath("/admin/duyet-don");
  return {
    ok: true,
    requestId: parsed.data.requestId,
    message: parsed.data.decision === "approved" ? "Đã duyệt đơn." : "Đã từ chối đơn.",
  };
}
