"use server";

import { revalidatePath } from "next/cache";
import type { BoothActionState } from "./action-state";
import { signInBooth, signOutBooth, stamp, undoStamp } from "@/lib/services/booth";

function value(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function directionOf(formData: FormData): "out" | "in" | null {
  const raw = value(formData, "direction");
  return raw === "out" || raw === "in" ? raw : null;
}

export async function boothSignInAction(
  _previous: BoothActionState,
  formData: FormData,
): Promise<BoothActionState> {
  const pin = value(formData, "pin");
  if (pin.length < 4) {
    return { ok: false, requestId: "", message: "Mã PIN phải từ 4 ký tự." };
  }

  let booth;
  try {
    booth = await signInBooth(pin);
  } catch {
    return { ok: false, requestId: "", message: "Chưa mở được ca. Thử lại." };
  }
  // One message for a wrong PIN and for a booth that does not exist: the screen
  // at the gate should not help anybody work out which.
  if (!booth) {
    return { ok: false, requestId: "", message: "Mã PIN không đúng." };
  }

  revalidatePath("/bao-ve");
  return { ok: true, requestId: "", message: `Đã mở ca tại ${booth.name}.` };
}

export async function boothSignOutAction(): Promise<void> {
  await signOutBooth();
  revalidatePath("/bao-ve");
}

export async function boothStampAction(
  _previous: BoothActionState,
  formData: FormData,
): Promise<BoothActionState> {
  const requestId = value(formData, "requestId");
  const direction = directionOf(formData);
  if (!direction) {
    return { ok: false, requestId, message: "Chỉ ghi được Cho ra hoặc Cho vào." };
  }

  try {
    await stamp(requestId, direction);
  } catch (cause) {
    return {
      ok: false,
      requestId,
      message: cause instanceof Error ? cause.message : "Chưa ghi được giờ. Thử lại.",
    };
  }

  revalidatePath("/bao-ve");
  return {
    ok: true,
    requestId,
    message: direction === "out" ? "Đã ghi giờ ra." : "Đã ghi giờ vào.",
  };
}

export async function boothUndoAction(
  _previous: BoothActionState,
  formData: FormData,
): Promise<BoothActionState> {
  const requestId = value(formData, "requestId");
  const direction = directionOf(formData);
  if (!direction) {
    return { ok: false, requestId, message: "Chỉ hoàn tác được Cho ra hoặc Cho vào." };
  }

  try {
    await undoStamp(requestId, direction);
  } catch (cause) {
    return {
      ok: false,
      requestId,
      message: cause instanceof Error ? cause.message : "Chưa hoàn tác được. Thử lại.",
    };
  }

  revalidatePath("/bao-ve");
  return { ok: true, requestId, message: "Đã hoàn tác." };
}
