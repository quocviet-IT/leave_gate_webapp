import "server-only";
import { createSupabaseAdminClient } from "@/lib/db/admin";

export type FileRequestInput = {
  employeeName: string;
  employeeDepartment: string;
  employeeTitle?: string;
  /** Only a supervisor filing on behalf has one; the public form never does. */
  employeeId?: string;
  kind: "leave" | "gate";
  detail: Record<string, unknown>;
  /** Computed by lib/domain/workhours.ts on the server. Never sent by a browser. */
  computedMinutes: number;
  deviceHash: string;
};

export type FiledRequest = { code: string; token: string };

type LookupEmployee = {
  fullName: string;
  title?: string;
  department?: string;
};

type LookupBase = {
  id: string;
  code: string;
  kind: "leave" | "gate";
  status: "pending" | "claimed" | "approved" | "rejected" | "withdrawn";
  employee: LookupEmployee;
  submittedAt: string;
  computedMinutes: number;
  claimedBy?: string;
  claimedAt?: string;
  decidedBy?: string;
  decidedAt?: string;
  decisionNote?: string;
  withdrawnAt?: string;
  withdrawReason?: string;
};

export type LeaveLookupRequest = LookupBase & {
  kind: "leave";
  detail: {
    fromDate: string;
    toDate: string;
    halfDay?: "morning" | "afternoon";
    reason: "unpaid" | "annual" | "sick" | "marriage" | "maternity" | "bereavement" | "special" | "other";
    reasonText?: string;
    note: string;
    handoverName?: string;
    makeupDate?: string;
  };
};

export type GateLookupRequest = LookupBase & {
  kind: "gate";
  detail: {
    reason: "business_trip" | "leave" | "other";
    reasonText?: string;
    note: string;
    outAt: string;
    expectedInAt: string;
    actualInAt?: string;
    actualInSource?: "booth" | "employee" | "cnb";
    driftMinutes?: number;
    driftReason?: string;
    boothOutAt?: string;
    boothInAt?: string;
  };
};

export type LookupRequest = LeaveLookupRequest | GateLookupRequest;

/**
 * Files a request. Uses the service-role client on purpose: `lg_submit_request`
 * is granted to service_role only, so the browser cannot reach it even though it
 * holds the anon key.
 */
export async function fileRequest(input: FileRequestInput): Promise<FiledRequest> {
  const sb = createSupabaseAdminClient();
  const { data, error } = await sb.rpc("lg_submit_request", {
    p_employee_name: input.employeeName,
    p_employee_department: input.employeeDepartment,
    p_employee_title: input.employeeTitle ?? "",
    p_kind: input.kind,
    p_detail: input.detail,
    p_computed_minutes: input.computedMinutes,
    p_device_hash: input.deviceHash,
    p_employee_id: input.employeeId ?? null,
  });
  if (error) throw new Error(error.message);
  const filed = data as FiledRequest | null;
  if (!filed?.code || !filed?.token) throw new Error("Gửi đơn không trả về mã đơn");
  return filed;
}

/** Status of a request by its printed code. Reveals nothing else, by design. */
export async function statusByCode(code: string): Promise<string | null> {
  const sb = createSupabaseAdminClient();
  const { data, error } = await sb.rpc("lg_status_by_code", { p_code: code });
  if (error) throw new Error(error.message);
  return (data as string | null) ?? null;
}

/** Full detail for a valid private lookup token. Never returns the token itself. */
export async function lookupRequest(token: string): Promise<LookupRequest | null> {
  const sb = createSupabaseAdminClient();
  const { data, error } = await sb.rpc("lg_lookup_by_token", { p_token: token });
  if (error) throw new Error(error.message);
  return (data as LookupRequest | null) ?? null;
}

export async function withdrawRequest(token: string, reason: string): Promise<void> {
  const sb = createSupabaseAdminClient();
  const { error } = await sb.rpc("lg_withdraw_request", {
    p_token: token,
    p_reason: reason || null,
  });
  if (error) throw new Error(error.message);
}

export type SetActualReturnInput = {
  token: string;
  actualInAt: string;
  driftMinutes: number;
  driftReason: string;
  deadline: string;
};

export async function setActualReturn(input: SetActualReturnInput): Promise<void> {
  const sb = createSupabaseAdminClient();
  const { error } = await sb.rpc("lg_set_actual_return", {
    p_token: input.token,
    p_actual_in_at: input.actualInAt,
    p_drift_minutes: input.driftMinutes,
    p_drift_reason: input.driftReason,
    p_deadline: input.deadline,
  });
  if (error) throw new Error(error.message);
}
