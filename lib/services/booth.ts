import "server-only";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { createSupabaseAdminClient } from "@/lib/db/admin";
import { BOOTH_SESSION_DAYS, UNDO_WINDOW_MINUTES, type BoothRow } from "@/lib/domain/booth";

/**
 * The booth zone's session.
 *
 * There is no Supabase account behind the gate. The PIN buys a random token
 * that lives in `lg_booth_session`; the cookie carries that token and nothing
 * else, so a cookie somebody edited simply matches no row. Everything here runs
 * through the service-role client, because the booth functions are granted to
 * `service_role` alone and the browser must not reach them.
 */

export const BOOTH_COOKIE = "lg_booth";

export type Booth = { id: string; name: string };

export async function readBoothToken(): Promise<string> {
  const jar = await cookies();
  return jar.get(BOOTH_COOKIE)?.value ?? "";
}

/** The booth this machine is signed in as, or null. */
export async function currentBooth(): Promise<Booth | null> {
  const token = await readBoothToken();
  if (!token) return null;
  const sb = createSupabaseAdminClient();
  const { data, error } = await sb.rpc("lg_booth_session_booth", { p_token: token });
  if (error) throw new Error(error.message);
  return (data as Booth | null) ?? null;
}

/**
 * Exchanges a PIN for a session. Returns null on a wrong PIN — the caller shows
 * one message either way, so a wrong PIN cannot be told from an unknown booth.
 */
export async function signInBooth(pin: string): Promise<Booth | null> {
  const token = randomBytes(32).toString("hex");
  const sb = createSupabaseAdminClient();
  const { data, error } = await sb.rpc("lg_booth_sign_in", {
    p_pin: pin,
    p_token: token,
    p_days: BOOTH_SESSION_DAYS,
  });
  if (error) throw new Error(error.message);
  const booth = (data as Booth | null) ?? null;
  if (!booth) return null;

  const jar = await cookies();
  jar.set(BOOTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/bao-ve",
    maxAge: BOOTH_SESSION_DAYS * 24 * 60 * 60,
  });
  return booth;
}

export async function signOutBooth(): Promise<void> {
  const token = await readBoothToken();
  const jar = await cookies();
  jar.delete(BOOTH_COOKIE);
  if (!token) return;
  const sb = createSupabaseAdminClient();
  const { error } = await sb.rpc("lg_booth_sign_out", { p_token: token });
  if (error) throw new Error(error.message);
}

/** Today's approved gate passes. Carries no reason — rules 14 and 19. */
export async function boothToday(): Promise<{ booth: Booth; rows: BoothRow[] } | null> {
  const token = await readBoothToken();
  if (!token) return null;
  const sb = createSupabaseAdminClient();
  const { data, error } = await sb.rpc("lg_booth_today", { p_token: token });
  if (error) throw new Error(error.message);
  return (data as { booth: Booth; rows: BoothRow[] } | null) ?? null;
}

export async function stamp(requestId: string, direction: "out" | "in"): Promise<void> {
  const token = await readBoothToken();
  const sb = createSupabaseAdminClient();
  const { error } = await sb.rpc("lg_booth_stamp", {
    p_token: token,
    p_request_id: requestId,
    p_direction: direction,
  });
  if (error) throw new Error(error.message);
}

export async function undoStamp(requestId: string, direction: "out" | "in"): Promise<void> {
  const token = await readBoothToken();
  const sb = createSupabaseAdminClient();
  const { error } = await sb.rpc("lg_booth_undo", {
    p_token: token,
    p_request_id: requestId,
    p_direction: direction,
    p_window_minutes: UNDO_WINDOW_MINUTES,
  });
  if (error) throw new Error(error.message);
}
