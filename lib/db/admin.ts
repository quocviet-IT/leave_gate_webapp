import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client. It bypasses RLS, so it is limited to server-owned jobs:
 * Directory sync, scheduled reminders, and the public filing Server Action.
 * The filing RPC is deliberately not granted to anon because the browser must
 * never be allowed to supply its own computed minutes. Never import this client
 * from a Client Component or use it for an authenticated person's read path.
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
