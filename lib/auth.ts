import "server-only";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "./db/server";
import type { AppRole } from "./db/types";

/** Only company accounts reach the admin zone — PRD rule 4. */
export const ALLOWED_DOMAIN = process.env.GOOGLE_WORKSPACE_DOMAIN ?? "ctyhp.vn";

export function isCompanyEmail(email: string | null | undefined): boolean {
  return typeof email === "string" && email.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`);
}

export async function getSessionUser(): Promise<User | null> {
  const sb = await createSupabaseServerClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  return user;
}

/**
 * The signed-in person's role, or null when they are not signed in or hold no
 * role. The domain check runs here too: a Google account outside the company
 * counts as no role at all, whatever the session says.
 */
export async function getUserRole(): Promise<AppRole | null> {
  const sb = await createSupabaseServerClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user || !isCompanyEmail(user.email)) return null;
  const { data } = await sb
    .from("lg_app_user")
    .select("role")
    .eq("email", user.email!.toLowerCase())
    .maybeSingle();
  return (data?.role as AppRole | undefined) ?? null;
}

export async function requireUser(): Promise<User> {
  const user = await getSessionUser();
  if (!user || !isCompanyEmail(user.email)) redirect("/admin/dang-nhap");
  return user;
}

/** Guards a page or action to one of the admin-zone roles. */
export async function requireRole(...allowed: AppRole[]): Promise<{ user: User; role: AppRole }> {
  const user = await requireUser();
  const role = await getUserRole();
  if (!role || !allowed.includes(role)) redirect("/admin/khong-du-quyen");
  return { user, role };
}

export function isApprover(role: AppRole | null): boolean {
  return role === "approver";
}

/** Compensation & benefits — the only role that may edit final hours. */
export function isCnb(role: AppRole | null): boolean {
  return role === "cnb";
}

export function isSupervisor(role: AppRole | null): boolean {
  return role === "supervisor";
}

/**
 * PRD rule 9: nobody approves their own request. The comparison is on the
 * account email, because that is the one identifier both the approver session
 * and the request row carry.
 */
export function canDecide(role: AppRole | null, approverEmail: string, subjectEmail: string | null): boolean {
  if (!isApprover(role)) return false;
  if (!subjectEmail) return true;
  return approverEmail.toLowerCase() !== subjectEmail.toLowerCase();
}
