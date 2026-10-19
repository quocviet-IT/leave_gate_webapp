/**
 * Form state for the booth's PIN box and its two buttons.
 *
 * Kept out of `actions.ts` because a `"use server"` module may only export
 * async functions — see the note in `app/(public)/tra-cuu/action-state.ts`.
 */
export type BoothActionState = {
  ok: boolean;
  message: string;
  /** Which row the message belongs to, so it stays attached to that row. */
  requestId: string;
};

export const EMPTY_BOOTH_STATE: BoothActionState = { ok: false, message: "", requestId: "" };
