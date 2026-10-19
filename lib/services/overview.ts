import "server-only";
import { createSupabaseAdminClient } from "@/lib/db/admin";
import { createSupabaseServerClient } from "@/lib/db/server";
import { isOverdue } from "@/lib/domain/sla";

/**
 * The overview strip — PRD section XII.
 *
 * The counts come from one database function so every screen quotes the same
 * numbers. The overdue count is worked out here instead, because "overdue"
 * means two *working* hours and that clock lives in `lib/domain/sla.ts`. Asking
 * SQL the same question would put the rule in a second place.
 */

export type OverviewCounts = {
  pending: number;
  unclaimed: number;
  leaveMinutes: number;
  gateMinutes: number;
  unmarked: number;
  gatePassesToday: number;
  awaitingGateReturn: number;
};

export type Overview = OverviewCounts & { overdue: number };

export async function overview(from: string, to: string, now: Date): Promise<Overview> {
  const admin = createSupabaseAdminClient();
  const sb = await createSupabaseServerClient();

  const [counts, waiting] = await Promise.all([
    admin.rpc("lg_overview", { p_from: from, p_to: to }),
    sb.from("lg_request").select("submitted_at").eq("status", "pending"),
  ]);

  if (counts.error) throw new Error(counts.error.message);
  if (waiting.error) throw new Error(waiting.error.message);

  const overdue = (waiting.data ?? []).filter((row) =>
    isOverdue(new Date(row.submitted_at as string), now),
  ).length;

  return { ...(counts.data as OverviewCounts), overdue };
}
