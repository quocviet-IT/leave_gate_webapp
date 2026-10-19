import type { ImportIssue } from "@/lib/domain/employees";

/**
 * Form state for the staff-list import.
 *
 * Kept out of `actions.ts` because a `"use server"` module may only export
 * async functions — see the note in `app/(public)/tra-cuu/action-state.ts`.
 */
export type ImportState = {
  ok: boolean;
  message: string;
  issues: ImportIssue[];
};

export const EMPTY_IMPORT_STATE: ImportState = { ok: false, message: "", issues: [] };
