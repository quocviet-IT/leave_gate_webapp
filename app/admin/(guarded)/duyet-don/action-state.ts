/**
 * Form state for the approval queue's three actions.
 *
 * Kept out of `actions.ts` because a `"use server"` module may only export
 * async functions — see the note in `app/(public)/tra-cuu/action-state.ts`.
 */
export type ApprovalActionState = {
  ok: boolean;
  message: string;
  /** Which request the message is about, so only that row shows it. */
  requestId: string;
};

export const EMPTY_APPROVAL_STATE: ApprovalActionState = {
  ok: false,
  message: "",
  requestId: "",
};
