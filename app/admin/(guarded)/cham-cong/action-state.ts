/**
 * Form state for the timesheet's two actions.
 *
 * Kept out of `actions.ts` because a `"use server"` module may only export
 * async functions — see the note in `app/(public)/tra-cuu/action-state.ts`.
 */
export type TimesheetActionState = {
  ok: boolean;
  message: string;
  /** Which row the message belongs to, so it stays attached to that row. */
  requestId: string;
};

export const EMPTY_TIMESHEET_STATE: TimesheetActionState = {
  ok: false,
  message: "",
  requestId: "",
};
