"use client";
import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for Client Components. RLS applies. The approval queue also
 * uses this one to subscribe to row changes, which is what keeps four approvers
 * from working off a stale table (PRD section VII).
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
