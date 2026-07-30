import "server-only";
import { createSupabaseServerClient } from "@/lib/db/server";
import type { EmployeeImportRow } from "@/lib/domain/employees";

export type ImportOutcome = { inserted: number; updated: number };

export type EmployeeSummary = {
  id: string;
  code: string | null;
  full_name: string;
  title: string | null;
  department: string | null;
  active: boolean;
};

/**
 * Hands the parsed rows to the database function, which is where the C&B check
 * lives. Acting as the signed-in user is deliberate: the service-role client
 * would bypass that check.
 */
export async function importEmployees(rows: EmployeeImportRow[]): Promise<ImportOutcome> {
  const sb = await createSupabaseServerClient();
  const { data, error } = await sb.rpc("lg_import_employees", { p_rows: rows });
  if (error) throw new Error(error.message);
  const outcome = data as ImportOutcome | null;
  if (!outcome) throw new Error("Nhập danh sách không trả về kết quả");
  return outcome;
}

/** The list shown under the import box. Named columns only — never select *. */
export async function listEmployees(limit = 50): Promise<EmployeeSummary[]> {
  const sb = await createSupabaseServerClient();
  const { data, error } = await sb
    .from("lg_employee")
    .select("id, code, full_name, title, department, active")
    .order("full_name")
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as EmployeeSummary[];
}

/** Total headcount, for the "showing N of M" line. */
export async function countEmployees(): Promise<number> {
  const sb = await createSupabaseServerClient();
  const { count, error } = await sb
    .from("lg_employee")
    .select("id", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return count ?? 0;
}
