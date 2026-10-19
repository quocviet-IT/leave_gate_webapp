import { requireRole } from "@/lib/auth";
import { inPeriod } from "@/lib/domain/timesheet";
import { exportFileName, toExportTable } from "@/lib/domain/timesheet-export";
import { listTimesheet } from "@/lib/services/timesheet";
import { buildXlsx } from "@/lib/xlsx";

export const dynamic = "force-dynamic";

/**
 * The Excel download — PRD section XI.
 *
 * A route rather than a Server Action because the answer is a file. The period
 * comes from the same query string the screen uses, so the file matches what is
 * on screen rather than being a second, differently-filtered thing.
 */
export async function GET(request: Request) {
  await requireRole("cnb");

  const url = new URL(request.url);
  const from = url.searchParams.get("tu") ?? "";
  const to = url.searchParams.get("den") ?? "";

  const rows = (await listTimesheet()).filter((row) => inPeriod(row, from, to));
  const book = buildXlsx("Chấm công", toExportTable(rows));

  return new Response(new Uint8Array(book), {
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${exportFileName(from, to)}"`,
      "cache-control": "no-store",
    },
  });
}
