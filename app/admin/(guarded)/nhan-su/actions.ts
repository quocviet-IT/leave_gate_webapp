"use server";

import { revalidatePath } from "next/cache";
import type { ImportState } from "./action-state";
import { requireRole } from "@/lib/auth";
import { parseEmployeeList } from "@/lib/domain/employees";
import { importEmployees } from "@/lib/services/employees";

/**
 * Parse first, then write. Rows that fail parsing are reported by line and
 * skipped rather than failing the whole paste — HR would otherwise have to find
 * one bad row in five hundred by hand.
 */
export async function importEmployeeList(
  _previous: ImportState,
  formData: FormData,
): Promise<ImportState> {
  await requireRole("cnb");

  const text = String(formData.get("list") ?? "");
  const { rows, issues } = parseEmployeeList(text);

  if (rows.length === 0) {
    return {
      ok: false,
      message: "Không có dòng nào hợp lệ để nhập. Kiểm tra lại các dòng bên dưới.",
      issues,
    };
  }

  try {
    const { inserted, updated } = await importEmployees(rows);
    revalidatePath("/admin/nhan-su");
    const skipped = issues.length > 0 ? ` Bỏ qua ${issues.length} dòng.` : "";
    return {
      ok: true,
      message: `Đã nhập ${inserted} người mới, cập nhật ${updated} người.${skipped}`,
      issues,
    };
  } catch (cause) {
    return {
      ok: false,
      message: cause instanceof Error ? cause.message : "Nhập danh sách không thành công.",
      issues,
    };
  }
}
