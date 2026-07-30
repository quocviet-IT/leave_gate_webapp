import "server-only";
import { createSupabaseAdminClient } from "@/lib/db/admin";

export type FileRequestInput = {
  employeeId: string;
  kind: "leave" | "gate";
  detail: Record<string, unknown>;
  /** Computed by lib/domain/workhours.ts on the server. Never sent by a browser. */
  computedMinutes: number;
  deviceHash: string;
};

export type FiledRequest = { code: string; token: string };

/**
 * Files a request. Uses the service-role client on purpose: `lg_submit_request`
 * is granted to service_role only, so the browser cannot reach it even though it
 * holds the anon key.
 */
export async function fileRequest(input: FileRequestInput): Promise<FiledRequest> {
  const sb = createSupabaseAdminClient();
  const { data, error } = await sb.rpc("lg_submit_request", {
    p_employee_id: input.employeeId,
    p_kind: input.kind,
    p_detail: input.detail,
    p_computed_minutes: input.computedMinutes,
    p_device_hash: input.deviceHash,
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
