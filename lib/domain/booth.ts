/**
 * The gate booth's own rules — PRD section VIII.
 *
 * The booth records two taps per gate pass and nothing else. It never shows why
 * anybody is going out: a leave reason on a screen at the gate is the thing
 * rules 14 and 19 exist to prevent, so nothing here carries one.
 */

/** How long a mis-tap stays undoable on its own row. */
export const UNDO_WINDOW_MINUTES = 5;

/** How long a booth machine keeps its session after the PIN is entered. */
export const BOOTH_SESSION_DAYS = 30;

/** A booth session token: 64 hex characters, generated server-side. */
export const BOOTH_TOKEN_PATTERN = /^[0-9a-f]{64}$/;

export type BoothRow = {
  id: string;
  code: string;
  full_name: string;
  department: string | null;
  out_at: string;
  expected_in_at: string;
  booth_out_at: string | null;
  booth_in_at: string | null;
};

/** Where a person is right now, as far as the gate knows. */
export type BoothState = "waiting" | "outside" | "returned";

export function boothState(row: BoothRow): BoothState {
  if (row.booth_in_at) return "returned";
  if (row.booth_out_at) return "outside";
  return "waiting";
}

export const BOOTH_STATE_LABELS: Record<BoothState, string> = {
  waiting: "Chưa ra",
  outside: "Đang ở ngoài",
  returned: "Đã về",
};

/** Cho vào only makes sense after Cho ra — PRD section VIII. */
export function canStampOut(row: BoothRow): boolean {
  return row.booth_out_at === null;
}

export function canStampIn(row: BoothRow): boolean {
  return row.booth_out_at !== null && row.booth_in_at === null;
}

export function undoExpiresAt(stampedAt: Date): Date {
  return new Date(stampedAt.getTime() + UNDO_WINDOW_MINUTES * 60_000);
}

export function canUndo(stampedAt: Date, now: Date): boolean {
  return now.getTime() <= undoExpiresAt(stampedAt).getTime();
}

/**
 * Which tap a row would undo: the later one, since undoing the exit while the
 * return stands would leave a return with nothing before it.
 */
export function undoableDirection(row: BoothRow, now: Date): "out" | "in" | null {
  if (row.booth_in_at && canUndo(new Date(row.booth_in_at), now)) return "in";
  if (row.booth_out_at && !row.booth_in_at && canUndo(new Date(row.booth_out_at), now)) {
    return "out";
  }
  return null;
}

export function countByState(rows: BoothRow[]): Record<BoothState, number> {
  const counts: Record<BoothState, number> = { waiting: 0, outside: 0, returned: 0 };
  for (const row of rows) counts[boothState(row)] += 1;
  return counts;
}

/** The name search above the table. Accent-insensitive, because the guard types fast. */
export function matchesSearch(row: BoothRow, term: string): boolean {
  const needle = normalise(term);
  if (!needle) return true;
  return normalise(`${row.full_name} ${row.code}`).includes(needle);
}

function normalise(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}
