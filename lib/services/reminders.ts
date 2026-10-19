import "server-only";
import { createSupabaseAdminClient } from "@/lib/db/admin";
import { reminderMessage, type RequestForChat } from "@/lib/domain/chat-messages";
import { slaStage } from "@/lib/domain/sla";
import { postQuietly } from "./chat";

/**
 * The SLA reminder run — PRD sections VI and VII.
 *
 * Which requests are due is decided here, by `slaStage`, because the clock
 * counts working minutes and that rule lives in `lib/domain/sla.ts`. The
 * database only says what is still waiting and how many nudges each has had,
 * and hands out the right to send one so two overlapping runs cannot both post.
 */

export type ReminderRun = {
  considered: number;
  sent: number;
  skipped: number;
  failed: number;
  details: string[];
};

type AwaitingRow = {
  id: string;
  code: string;
  kind: "leave" | "gate";
  submittedAt: string;
  remindersSent: number;
  fullName: string;
  department: string | null;
  computedMinutes: number;
  fromDate: string | null;
  toDate: string | null;
  outAt: string | null;
  expectedInAt: string | null;
};

function toChatRequest(row: AwaitingRow): RequestForChat {
  return {
    code: row.code,
    kind: row.kind,
    fullName: row.fullName,
    department: row.department,
    computedMinutes: row.computedMinutes,
    fromDate: row.fromDate,
    toDate: row.toDate,
    outAt: row.outAt,
    expectedInAt: row.expectedInAt,
  };
}

export async function runReminders(now: Date, queueUrl: string): Promise<ReminderRun> {
  const sb = createSupabaseAdminClient();

  const [waiting, approvers] = await Promise.all([
    sb.rpc("lg_requests_awaiting_decision"),
    sb.rpc("lg_approver_names"),
  ]);
  if (waiting.error) throw new Error(waiting.error.message);
  if (approvers.error) throw new Error(approvers.error.message);

  const rows = (waiting.data as AwaitingRow[] | null) ?? [];
  const names = (approvers.data as string[] | null) ?? [];

  const run: ReminderRun = { considered: rows.length, sent: 0, skipped: 0, failed: 0, details: [] };

  for (const row of rows) {
    const stage = slaStage(new Date(row.submittedAt), now);
    if (stage === 0 || stage <= row.remindersSent) continue;

    // Take the right to send before sending. If another run got there first
    // this returns false and nothing is posted twice.
    const claimed = await sb.rpc("lg_claim_reminder", {
      p_request_id: row.id,
      p_stage: stage,
    });
    if (claimed.error) throw new Error(claimed.error.message);
    if (claimed.data !== true) {
      run.skipped += 1;
      continue;
    }

    const outcome = await postQuietly(
      reminderMessage(toChatRequest(row), stage as 1 | 2, names, queueUrl),
    );
    if (outcome.ok) {
      run.sent += 1;
      run.details.push(`${row.code} mốc ${stage}`);
    } else if (outcome.skipped) {
      run.skipped += 1;
      run.details.push(`${row.code} mốc ${stage}: ${outcome.detail}`);
    } else {
      run.failed += 1;
      run.details.push(`${row.code} mốc ${stage}: ${outcome.detail}`);
    }
  }

  return run;
}
