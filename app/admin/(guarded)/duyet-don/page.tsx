import ApprovalQueue from "@/components/admin/ApprovalQueue";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/db/server";
import { serverNow } from "@/lib/server-time";
import { listQueue } from "@/lib/services/approvals";

export const metadata = { title: "Duyệt đơn — Quản trị CTYHP" };

/** Account email → display name, so a row can say "Chị Diệu đang xử lý". */
async function approverNames(): Promise<Record<string, string>> {
  const sb = await createSupabaseServerClient();
  const { data, error } = await sb.from("lg_app_user").select("email, full_name");
  if (error) throw new Error(error.message);
  const names: Record<string, string> = {};
  for (const person of data ?? []) names[person.email] = person.full_name;
  return names;
}

export default async function ApprovalQueuePage() {
  const { user } = await requireRole("approver");
  const email = (user.email ?? "").toLowerCase();
  const [rows, holderNames] = await Promise.all([listQueue(email), approverNames()]);

  return (
    <ApprovalQueue
      rows={rows}
      email={email}
      serverNow={serverNow().toISOString()}
      holderNames={holderNames}
    />
  );
}
