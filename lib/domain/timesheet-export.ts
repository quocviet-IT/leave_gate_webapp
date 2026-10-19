/**
 * The Excel table — PRD section XI.
 *
 * Kept apart from the screen so the file Chị Khoa downloads can be checked
 * cell by cell in a test rather than by opening it. Every timestamp is written
 * as text already formatted in ICT, because the export is UTC+7 too and a bare
 * date would otherwise be read in whatever locale opens it.
 */

import { formatDate, formatDateTime, KIND_LABELS } from "@/lib/format";
import { minutesToHours } from "./workhours";
import { gateTimeVerdict, gateTimesDisagree, isAdjusted, type TimesheetRow } from "./timesheet";

export const EXPORT_HEADERS = [
  "Mã đơn",
  "Loại đơn",
  "Họ tên",
  "Chức vụ",
  "Phòng ban",
  "Thời gian",
  "Số giờ hệ thống tính",
  "Số giờ chốt",
  "Có điều chỉnh",
  "Giờ ra tại cổng",
  "Giờ vào tại cổng",
  "Giờ vào dùng để tính",
  "Nguồn giờ vào",
  "Chênh lệch (phút)",
  "Lý do chênh lệch",
  "Cần xem lại",
  "Người duyệt",
  "Duyệt lúc",
  "Đã chốt",
] as const;

const SOURCE_LABELS: Record<string, string> = {
  booth: "Bảo vệ bấm",
  employee: "Nhân viên khai",
  cnb: "C&B điều chỉnh",
  none: "Chưa có",
};

function periodText(row: TimesheetRow): string {
  if (row.kind === "leave") {
    if (!row.from_date) return "";
    return row.from_date === row.to_date
      ? formatDate(row.from_date)
      : `${formatDate(row.from_date)} - ${formatDate(row.to_date!)}`;
  }
  if (!row.out_at) return "";
  return `${formatDateTime(row.out_at)} - ${formatDateTime(row.expected_in_at!)}`;
}

function reviewText(row: TimesheetRow): string {
  const verdict = gateTimeVerdict(row);
  const notes: string[] = [];
  if (verdict.warning) notes.push(verdict.warning);
  if (gateTimesDisagree(row)) notes.push("Giờ bảo vệ và giờ nhân viên lệch quá 15 phút");
  return notes.join(" · ");
}

/** One spreadsheet row. Hours go in as numbers so Excel can sum the column. */
export function toExportRow(row: TimesheetRow): (string | number)[] {
  const verdict = gateTimeVerdict(row);
  return [
    row.code,
    KIND_LABELS[row.kind],
    row.full_name,
    row.title ?? "",
    row.department ?? "",
    periodText(row),
    minutesToHours(row.computed_minutes),
    minutesToHours(row.final_minutes),
    isAdjusted(row) ? "Có" : "",
    row.booth_out_at ? formatDateTime(row.booth_out_at) : "",
    row.booth_in_at ? formatDateTime(row.booth_in_at) : "",
    row.actual_in_at ? formatDateTime(row.actual_in_at) : "",
    row.kind === "gate" ? SOURCE_LABELS[verdict.source] : "",
    row.drift_minutes ?? "",
    row.drift_reason ?? "",
    reviewText(row),
    row.decided_by_email ?? "",
    row.decided_at ? formatDateTime(row.decided_at) : "",
    row.marked_at ? formatDateTime(row.marked_at) : "",
  ];
}

export function toExportTable(rows: TimesheetRow[]): (string | number)[][] {
  return [[...EXPORT_HEADERS], ...rows.map(toExportRow)];
}

/** `Cham-cong_2026-07-01_2026-07-31.xlsx` — safe on every filesystem. */
export function exportFileName(from: string, to: string): string {
  const span = [from, to].filter(Boolean).join("_") || "tat-ca";
  return `Cham-cong_${span}.xlsx`;
}
