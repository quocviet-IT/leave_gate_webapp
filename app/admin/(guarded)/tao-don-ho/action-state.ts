/**
 * Form state for filing on behalf.
 *
 * Kept out of `actions.ts` because a `"use server"` module may only export
 * async functions — see the note in `app/(public)/tra-cuu/action-state.ts`.
 */
export type OnBehalfState = {
  ok: boolean;
  message: string;
  errors: Record<string, string>;
  /** Set once a request is filed, so the screen can show the code and the link. */
  filed?: { code: string; token: string; employeeName: string };
};

export const EMPTY_ON_BEHALF_STATE: OnBehalfState = { ok: false, message: "", errors: {} };
