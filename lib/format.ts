/** Display helpers. Everything the user reads is Vietnamese, in ICT. */

import { ICT_OFFSET_MINUTES, minutesToHours } from "./domain/workhours";

const WEEKDAY_NAMES = [
  "Chủ nhật",
  "Thứ Hai",
  "Thứ Ba",
  "Thứ Tư",
  "Thứ Năm",
  "Thứ Sáu",
  "Thứ Bảy",
] as const;

function ictDate(at: Date | string): Date {
  const d = typeof at === "string" ? new Date(at) : at;
  return new Date(d.getTime() + ICT_OFFSET_MINUTES * 60_000);
}

/** `30/07/2026` */
export function formatDate(at: Date | string): string {
  const d = ictDate(at);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

/** `30/07` — for tables where the year is obvious from the filter. */
export function formatDayMonth(at: Date | string): string {
  const d = ictDate(at);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** `14:20` */
export function formatTime(at: Date | string): string {
  const d = ictDate(at);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

/** `30/07/2026 · 14:20` */
export function formatDateTime(at: Date | string): string {
  return `${formatDate(at)} · ${formatTime(at)}`;
}

export function formatWeekday(at: Date | string): string {
  return WEEKDAY_NAMES[ictDate(at).getUTCDay()];
}

/** `3,3 giờ` — Vietnamese decimal comma, one place, as the timesheet shows. */
export function formatHours(minutes: number): string {
  return `${minutesToHours(minutes).toString().replace(".", ",")} giờ`;
}

/** `3 ngày · 24 giờ` for leave, plain hours for a gate pass. */
export function formatDuration(minutes: number, kind: "leave" | "gate"): string {
  if (kind === "gate") return formatHours(minutes);
  const days = minutes / (8 * 60);
  const dayText = Number.isInteger(days) ? `${days} ngày` : `${days.toString().replace(".", ",")} ngày`;
  return `${dayText} · ${formatHours(minutes)}`;
}

/** `Trễ 20 phút` / `Sớm 5 phút` / `Đúng giờ` */
export function formatDrift(driftMinutes: number): string {
  if (driftMinutes === 0) return "Đúng giờ";
  return driftMinutes > 0 ? `Trễ ${driftMinutes} phút` : `Sớm ${Math.abs(driftMinutes)} phút`;
}

export const STATUS_LABELS = {
  pending: "Chờ duyệt",
  claimed: "Đang xử lý",
  approved: "Đã duyệt",
  rejected: "Bị từ chối",
  withdrawn: "Đã rút",
} as const;

export const KIND_LABELS = {
  leave: "Xin nghỉ phép",
  gate: "Ra vào cổng",
} as const;

export const LEAVE_REASON_LABELS = {
  unpaid: "Không lương",
  annual: "Phép năm",
  sick: "Ốm đau",
  marriage: "Kết hôn",
  maternity: "Thai sản",
  bereavement: "Tang chế",
  special: "Trường hợp đặc biệt",
  other: "Khác (bù giờ)",
} as const;

export const GATE_REASON_LABELS = {
  business_trip: "Đi công tác",
  leave: "Nghỉ phép",
  other: "Khác",
} as const;
