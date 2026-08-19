import OnBehalfForm from "@/components/admin/OnBehalfForm";
import { requireRole } from "@/lib/auth";
import { supervisorEmployees } from "@/lib/services/supervisor";

export const metadata = { title: "Tạo đơn hộ — Quản trị CTYHP" };

export default async function OnBehalfPage() {
  const { user } = await requireRole("supervisor");
  const employees = await supervisorEmployees((user.email ?? "").toLowerCase());
  return <OnBehalfForm employees={employees} />;
}
