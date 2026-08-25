import OverviewPanel from "@/components/admin/OverviewPanel";
import { requireRole } from "@/lib/auth";
import { monthBounds } from "@/lib/domain/timesheet";
import { serverNow } from "@/lib/server-time";
import { overview } from "@/lib/services/overview";

export const metadata = { title: "Tổng quan — Quản trị CTYHP" };

type SearchParams = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

/** `YYYY-MM` in ICT — the month the period defaults to. */
function currentMonth(now: Date): string {
  return new Date(now.getTime() + 7 * 60 * 60_000).toISOString().slice(0, 7);
}

export default async function AdminOverviewPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { role } = await requireRole("approver", "cnb", "supervisor");
  const params = await searchParams;
  const now = serverNow();
  const month = /^\d{4}-\d{2}$/.test(one(params.thang)) ? one(params.thang) : currentMonth(now);
  const { from, to } = monthBounds(month);

  const counts = await overview(from, to, now);

  return <OverviewPanel counts={counts} role={role} from={from} to={to} />;
}
