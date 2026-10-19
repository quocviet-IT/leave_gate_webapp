import "server-only";
import { CLAIM_TIMEOUT_MINUTES } from "@/lib/domain/approvals";
import { createSupabaseAdminClient } from "@/lib/db/admin";
import { createSupabaseServerClient } from "@/lib/db/server";

/**
 * Reading and writing the approval queue.
 *
 * Reads go through the signed-in user, so the RLS policy decides what an
 * approver may see — the same policy the browser client obeys when it
 * subscribes for realtime, which is what keeps the two views in step.
 *
 * Writes go through the service-role client, because the claim and decision
 * functions are granted to `service_role` alone. That is not a shortcut around
 * the guard: the caller runs `requireRole("approver")` first and passes the
 * session email it verified, so the browser never gets to name the approver.
 */

export type QueueRow = {
  id: string;
  code: string;
  kind: "leave" | "gate";
  status: "pending" | "claimed" | "approved" | "rejected" | "withdrawn";
  version: number;
  submitted_at: string;
  claimed_by_email: string | null;
  claimed_at: string | null;
  decided_by_email: string | null;
  decided_at: string | null;
  decision_note: string | null;
  computed_minutes: number;
  filed_by_email: string | null;
  employee_snapshot: {
    full_name: string;
    title: string | null;
    department: string | null;
  };
  /** The account email of the person the request is about, when there is one. */
  subject_email: string | null;
  leave: {
    from_date: string;
    to_date: string;
    half_day: "morning" | "afternoon" | null;
    reason: string;
    reason_text: string | null;
    note: string;
  } | null;
  gate: {
    reason: string;
    reason_text: string | null;
    note: string;
    out_at: string;
    expected_in_at: string;
  } | null;
};

type QueueSelectRow = Omit<QueueRow, "subject_email" | "leave" | "gate"> & {
  employee: { email: string | null } | null;
  lg_leave_detail: QueueRow["leave"][] | QueueRow["leave"] | null;
  lg_gate_detail: QueueRow["gate"][] | QueueRow["gate"] | null;
};

function firstOrNull<T>(value: T[] | T | null): T | null {
  if (value === null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/**
 * Everything the queue shows: still awaiting a decision, plus this approver's
 * own recent decisions for the "Đơn tôi đã duyệt" tab. Decided requests by
 * other people are left out — the queue is a worklist, not an archive.
 */
export async function listQueue(email: string, decidedLimit = 50): Promise<QueueRow[]> {
  const sb = await createSupabaseServerClient();
  const columns = `
    id, code, kind, status, version, submitted_at,
    claimed_by_email, claimed_at, decided_by_email, decided_at, decision_note,
    computed_minutes, filed_by_email, employee_snapshot,
    employee:lg_employee!lg_request_employee_id_fkey ( email ),
    lg_leave_detail ( from_date, to_date, half_day, reason, reason_text, note ),
    lg_gate_detail ( reason, reason_text, note, out_at, expected_in_at )
  `;

  const [waiting, decided] = await Promise.all([
    sb
      .from("lg_request")
      .select(columns)
      .in("status", ["pending", "claimed"])
      .order("submitted_at", { ascending: true }),
    sb
      .from("lg_request")
      .select(columns)
      .in("status", ["approved", "rejected"])
      .eq("decided_by_email", email.toLowerCase())
      .order("decided_at", { ascending: false })
      .limit(decidedLimit),
  ]);

  if (waiting.error) throw new Error(waiting.error.message);
  if (decided.error) throw new Error(decided.error.message);

  const rows = [...(waiting.data ?? []), ...(decided.data ?? [])] as unknown as QueueSelectRow[];
  return rows.map((row) => {
    const { employee, lg_leave_detail, lg_gate_detail, ...rest } = row;
    return {
      ...rest,
      subject_email: employee?.email ?? row.filed_by_email ?? null,
      leave: firstOrNull(lg_leave_detail),
      gate: firstOrNull(lg_gate_detail),
    };
  });
}

export async function claimRequest(
  requestId: string,
  version: number,
  email: string,
): Promise<void> {
  const sb = createSupabaseAdminClient();
  const { error } = await sb.rpc("lg_claim_request", {
    p_request_id: requestId,
    p_version: version,
    p_email: email,
    p_timeout_minutes: CLAIM_TIMEOUT_MINUTES,
  });
  if (error) throw new Error(error.message);
}

export async function releaseRequest(
  requestId: string,
  version: number,
  email: string,
): Promise<void> {
  const sb = createSupabaseAdminClient();
  const { error } = await sb.rpc("lg_release_request", {
    p_request_id: requestId,
    p_version: version,
    p_email: email,
  });
  if (error) throw new Error(error.message);
}

export async function decideRequest(input: {
  requestId: string;
  version: number;
  email: string;
  decision: "approved" | "rejected";
  note: string;
}): Promise<void> {
  const sb = createSupabaseAdminClient();
  const { error } = await sb.rpc("lg_decide_request", {
    p_request_id: input.requestId,
    p_version: input.version,
    p_email: input.email,
    p_decision: input.decision,
    p_note: input.note || null,
    p_timeout_minutes: CLAIM_TIMEOUT_MINUTES,
  });
  if (error) throw new Error(error.message);
}
