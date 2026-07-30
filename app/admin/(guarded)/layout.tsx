import AdminShell from "@/components/AdminShell";
import { requireRole } from "@/lib/auth";

/** Every admin screen reads the session, so none of them can be prerendered. */
export const dynamic = "force-dynamic";

/**
 * The guarded half of the admin zone. `/admin/dang-nhap` and
 * `/admin/khong-du-quyen` sit outside this route group on purpose — a sign-in
 * page behind a sign-in guard would loop.
 */
export default async function GuardedAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, role } = await requireRole("approver", "cnb", "supervisor");
  return (
    <AdminShell role={role} email={user.email ?? ""}>
      {children}
    </AdminShell>
  );
}
