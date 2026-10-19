import TimesheetTable from "@/components/admin/TimesheetTable";
import { requireRole } from "@/lib/auth";
import { listTimesheet } from "@/lib/services/timesheet";

export const metadata = { title: "Chấm công — Quản trị CTYHP" };

type SearchParams = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function TimesheetPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireRole("cnb");
  const params = await searchParams;
  const rows = await listTimesheet();

  return <TimesheetTable rows={rows} from={one(params.tu)} to={one(params.den)} />;
}
