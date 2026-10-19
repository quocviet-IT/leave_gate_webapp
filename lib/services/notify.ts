import "server-only";
import { createSupabaseAdminClient } from "@/lib/db/admin";
import {
  decisionMessage,
  filedMessage,
  gatePassMessage,
  withdrawnMessage,
  type RequestForChat,
} from "@/lib/domain/chat-messages";
import { postQuietly } from "./chat";

/**
 * Telling the two Chat spaces what happened — PRD section VI.
 *
 * Every function here is best-effort. A request is filed, approved or withdrawn
 * whether or not a room hears about it; a Chat outage must never be the reason
 * somebody's leave did not go through. `postQuietly` logs and returns.
 *
 * Each one re-reads the request rather than taking a shape from its caller, so
 * the message says what the database says.
 */

type Row = {
  code: string;
  kind: "leave" | "gate";
  employee_snapshot: { full_name: string; department: string | null };
  computed_minutes: number;
  lg_leave_detail: { from_date: string; to_date: string }[] | null;
  lg_gate_detail: { out_at: string; expected_in_at: string }[] | null;
};

const COLUMNS = `
  code, kind, employee_snapshot, computed_minutes,
  lg_leave_detail ( from_date, to_date ),
  lg_gate_detail ( out_at, expected_in_at )
`;

function toChatRequest(row: Row): RequestForChat {
  const leave = row.lg_leave_detail?.[0] ?? null;
  const gate = row.lg_gate_detail?.[0] ?? null;
  return {
    code: row.code,
    kind: row.kind,
    fullName: row.employee_snapshot.full_name,
    department: row.employee_snapshot.department,
    computedMinutes: row.computed_minutes,
    fromDate: leave?.from_date ?? null,
    toDate: leave?.to_date ?? null,
    outAt: gate?.out_at ?? null,
    expectedInAt: gate?.expected_in_at ?? null,
  };
}

/** The name the room knows somebody by, falling back to the account email. */
async function displayName(email: string): Promise<string> {
  const sb = createSupabaseAdminClient();
  const { data } = await sb
    .from("lg_app_user")
    .select("full_name")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  return (data?.full_name as string | undefined) || email;
}

async function requestByCode(code: string): Promise<RequestForChat | null> {
  const sb = createSupabaseAdminClient();
  const { data, error } = await sb.from("lg_request").select(COLUMNS).eq("code", code).maybeSingle();
  if (error || !data) return null;
  return toChatRequest(data as unknown as Row);
}

async function requestById(id: string): Promise<RequestForChat | null> {
  const sb = createSupabaseAdminClient();
  const { data, error } = await sb.from("lg_request").select(COLUMNS).eq("id", id).maybeSingle();
  if (error || !data) return null;
  return toChatRequest(data as unknown as Row);
}

export async function notifyFiled(code: string, queueUrl: string): Promise<void> {
  const request = await requestByCode(code);
  if (!request) return;
  await postQuietly(filedMessage(request, queueUrl));
}

/**
 * The decision goes into the request's own thread. An approved gate pass also
 * reaches the guards — they are the ones who have to let the person out.
 */
export async function notifyDecision(
  requestId: string,
  decision: "approved" | "rejected",
  deciderEmail: string,
): Promise<void> {
  const request = await requestById(requestId);
  if (!request) return;
  await postQuietly(decisionMessage(request, decision, await displayName(deciderEmail)));
  if (decision === "approved") {
    await postQuietly(gatePassMessage(request));
  }
}

export async function notifyWithdrawn(code: string): Promise<void> {
  const request = await requestByCode(code);
  if (!request) return;
  await postQuietly(withdrawnMessage(request));
}
