import { requireRole } from "@/lib/auth";
import { countEmployees, listEmployees } from "@/lib/services/employees";
import EmployeeImportPanel from "@/components/admin/EmployeeImportPanel";

export const metadata = { title: "Nhân sự — Quản trị CTYHP" };

export default async function EmployeesPage() {
  await requireRole("cnb");
  const [employees, total] = await Promise.all([listEmployees(), countEmployees()]);
  return <EmployeeImportPanel employees={employees} total={total} />;
}
