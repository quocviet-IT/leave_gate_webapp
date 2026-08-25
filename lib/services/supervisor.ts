import "server-only";
import { createSupabaseAdminClient } from "@/lib/db/admin";

/**
 * Filing on behalf — PRD rule 6.
 *
 * Both calls take the supervisor's email from the session the server action
 * already verified, never from the form. The database re-checks the role and
 * the department anyway: a supervisor may file for their own workshop and for
 * nobody else, and that is not a rule to leave to the screen.
 */

export type SupervisorEmployee = {
  id: string;
  fullName: string;
  title: string | null;
  department: string | null;
};

export async function supervisorEmployees(email: string): Promise<SupervisorEmployee[]> {
  const sb = createSupabaseAdminClient();
  const { data, error } = await sb.rpc("lg_supervisor_employees", { p_email: email });
  if (error) throw new Error(error.message);
  return (data as SupervisorEmployee[] | null) ?? [];
}

export async function fileOnBehalf(input: {
  employeeId: string;
  kind: "leave" | "gate";
  detail: Record<string, unknown>;
  computedMinutes: number;
  deviceHash: string;
  email: string;
}): Promise<{ code: string; token: string }> {
  const sb = createSupabaseAdminClient();
  const { data, error } = await sb.rpc("lg_submit_on_behalf", {
    p_employee_id: input.employeeId,
    p_kind: input.kind,
    p_detail: input.detail,
    p_computed_minutes: input.computedMinutes,
    p_device_hash: input.deviceHash,
    p_filed_by_email: input.email,
  });
  if (error) throw new Error(error.message);
  const filed = data as { code: string; token: string } | null;
  if (!filed) throw new Error("Gửi đơn hộ không trả về mã đơn");
  return filed;
}
