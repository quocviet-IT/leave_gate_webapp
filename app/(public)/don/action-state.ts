/**
 * Form state for the public filing form.
 *
 * Kept out of `actions.ts` because a `"use server"` module may only export
 * async functions — see the note in `../tra-cuu/action-state.ts`.
 */
export type FileState = {
  ok: boolean;
  message: string;
  errors: Record<string, string>;
  filed?: { code: string; token: string };
};

export const EMPTY_FILE_STATE: FileState = { ok: false, message: "", errors: {} };
