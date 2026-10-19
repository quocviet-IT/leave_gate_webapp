import "server-only";
import { createSupabaseAdminClient } from "@/lib/db/admin";
import { createSupabaseServerClient } from "@/lib/db/server";
import type { TimesheetRow } from "@/lib/domain/timesheet";

/**
 * The timesheet.
 *
 * Reads go through the signed-in user so the RLS policy decides what is
 * visible; the two writes go through the service-role client, because
 * `lg_set_final_hours` and `lg_mark_timesheet` are granted to `service_role`
 * alone and both re-check the C&B role in the database.
 */

type SheetSelectRow = {
  request_id: string;
  computed_minutes: number;
  final_minutes: number;
  marked_at: string | null;
  marked_by_email: string | null;
  lg_request: {
    code: string;
    kind: "leave" | "gate";
    decided_at: string | null;
    decided_by_email: string | null;
    employee_snapshot: { full_name: string; title: string | null; department: string | null };
    lg_leave_detail: { from_date: string; to_date: string }[] | null;
    lg_gate_detail:
      | {
          out_at: string;
          expected_in_at: string;
          actual_in_at: string | null;
          actual_in_source: "booth" | "employee" | "cnb" | null;
          drift_minutes: number | null;
          drift_reason: string | null;
          booth_out_at: string | null;
          booth_in_at: string | null;
        }[]
      | null;
  } | null;
};

function firstOrNull<T>(value: T[] | T | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/** Every approved request, newest decision first. Filtering by period is the caller's job. */
export async function listTimesheet(limit = 1000): Promise<TimesheetRow[]> {
  const sb = await createSupabaseServerClient();
  const { data, error } = await sb
    .from("lg_timesheet")
    .select(
      `request_id, computed_minutes, final_minutes, marked_at, marked_by_email,
       lg_request!inner (
         code, kind, decided_at, decided_by_email, employee_snapshot,
         lg_leave_detail ( from_date, to_date ),
         lg_gate_detail (
           out_at, expected_in_at, actual_in_at, actual_in_source,
           drift_minutes, drift_reason, booth_out_at, booth_in_at
         )
       )`,
    )
    .order("marked_at", { ascending: true, nullsFirst: true })
    .limit(limit);

  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as SheetSelectRow[])
    .filter((row) => row.lg_request !== null)
    .map((row) => {
      const request = row.lg_request!;
      const leave = firstOrNull(request.lg_leave_detail);
      const gate = firstOrNull(request.lg_gate_detail);
      return {
        request_id: row.request_id,
        code: request.code,
        kind: request.kind,
        full_name: request.employee_snapshot.full_name,
        title: request.employee_snapshot.title,
        department: request.employee_snapshot.department,
        computed_minutes: row.computed_minutes,
        final_minutes: row.final_minutes,
        marked_at: row.marked_at,
        marked_by_email: row.marked_by_email,
        decided_at: request.decided_at,
        decided_by_email: request.decided_by_email,
        from_date: leave?.from_date ?? null,
        to_date: leave?.to_date ?? null,
        out_at: gate?.out_at ?? null,
        expected_in_at: gate?.expected_in_at ?? null,
        actual_in_at: gate?.actual_in_at ?? null,
        actual_in_source: gate?.actual_in_source ?? null,
        drift_minutes: gate?.drift_minutes ?? null,
        drift_reason: gate?.drift_reason ?? null,
        booth_out_at: gate?.booth_out_at ?? null,
        booth_in_at: gate?.booth_in_at ?? null,
      };
    });
}

export async function setFinalHours(input: {
  requestId: string;
  finalMinutes: number;
  reason: string;
  email: string;
}): Promise<void> {
  const sb = createSupabaseAdminClient();
  const { error } = await sb.rpc("lg_set_final_hours", {
    p_request_id: input.requestId,
    p_final_minutes: input.finalMinutes,
    p_reason: input.reason,
    p_email: input.email,
  });
  if (error) throw new Error(error.message);
}

export async function markTimesheet(
  requestId: string,
  email: string,
  done: boolean,
): Promise<void> {
  const sb = createSupabaseAdminClient();
  const { error } = await sb.rpc("lg_mark_timesheet", {
    p_request_id: requestId,
    p_email: email,
    p_done: done,
  });
  if (error) throw new Error(error.message);
}
