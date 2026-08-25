/**
 * The admin zone's accounts: what a person types, and what Supabase is asked.
 *
 * Google SSO was replaced on 2026-08-25 with two issued accounts — one shared
 * by the approvers, one for C&B. People are given a username, not an address,
 * because `duyet` is what they will remember and write down. Supabase Auth keys
 * an account on an email, so the two have to be reconciled somewhere; doing it
 * here rather than inline in the form keeps it testable, and a mistake here is
 * a right password against a wrong address, which looks exactly like a typo.
 *
 * This module imports nothing: the sign-in form is a client component, and the
 * public bundle must not gain a validation library through it (see the note in
 * CLAUDE.md section 4).
 */

export const COMPANY_DOMAIN = "ctyhp.vn";

/** The roles the admin zone has. The supervisor was removed on 2026-08-25. */
export const ADMIN_ROLES = ["approver", "cnb"] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];

export function isAdminRole(value: string): value is AdminRole {
  return (ADMIN_ROLES as readonly string[]).includes(value);
}

/**
 * The address behind a typed username, or null when it is not one of ours.
 *
 * A full company address is accepted as well, because somebody will type one;
 * anything outside the domain is refused here rather than sent to Supabase, so
 * the answer is "tài khoản không thuộc công ty" instead of a generic failure.
 */
export function accountEmail(typed: string): string | null {
  const value = typed.trim().toLowerCase();
  if (value === "") return null;

  const parts = value.split("@");
  if (parts.length === 1) {
    return `${parts[0]}@${COMPANY_DOMAIN}`;
  }
  if (parts.length === 2 && parts[0] !== "" && parts[1] === COMPANY_DOMAIN) {
    return value;
  }
  return null;
}
