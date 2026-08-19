import { cronAuthorisation } from "@/lib/cron-auth";
import { serverNow } from "@/lib/server-time";
import { runReminders } from "@/lib/services/reminders";

export const dynamic = "force-dynamic";

/**
 * The scheduled SLA run — PRD sections VI and VII.
 *
 * Authorised by `CRON_SECRET` and nothing else: this route has no session, so
 * a missing or wrong secret must be a flat 401 rather than a partial answer.
 * Vercel Cron sends the secret as a bearer token; the same call works by hand
 * for a dry run.
 *
 * Safe to call more often than needed. Each nudge is claimed in the database
 * before it is posted, so a second run inside the same window sends nothing.
 */
export async function GET(request: Request) {
  const authorisation = cronAuthorisation(
    process.env.CRON_SECRET,
    request.headers.get("authorization"),
  );
  if (authorisation === "unconfigured") {
    return Response.json({ error: "CRON_SECRET chưa cấu hình" }, { status: 503 });
  }
  if (authorisation === "denied") {
    return Response.json({ error: "Không có quyền" }, { status: 401 });
  }

  const origin = new URL(request.url).origin;
  const run = await runReminders(serverNow(), `${origin}/admin/duyet-don`);

  return Response.json(run, { headers: { "cache-control": "no-store" } });
}
