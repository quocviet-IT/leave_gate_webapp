import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client. It bypasses RLS, so it exists for exactly two jobs that
 * no anon-key client can do: the nightly Directory sync, and the scheduled SLA
 * reminder run. Never import it from a client component, and never use it to
 * serve a request on behalf of a person — those paths stay under RLS.
 */
export function isAdminClientConfigured(): boolean {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) && key.length > 20 && !/^your-/i.test(key);
}

export function createSupabaseAdminClient(): SupabaseClient {
  if (!isAdminClientConfigured()) {
    throw new Error(
      "Cần SUPABASE_SERVICE_ROLE_KEY thật trong môi trường; hiện đang thiếu hoặc còn là giá trị mẫu",
    );
  }
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
