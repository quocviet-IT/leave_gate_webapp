/**
 * Form state for the lookup page's two actions.
 *
 * This lives outside `actions.ts` on purpose. A `"use server"` module may only
 * export async functions: anything else is turned into a server reference, so
 * importing a plain constant from one hands the client a function instead of
 * the object, and the first `state.errors.x` read throws at render time.
 */
export type PublicActionState = {
  ok: boolean;
  message: string;
  errors: Record<string, string>;
};

export const EMPTY_PUBLIC_ACTION_STATE: PublicActionState = {
  ok: false,
  message: "",
  errors: {},
};
