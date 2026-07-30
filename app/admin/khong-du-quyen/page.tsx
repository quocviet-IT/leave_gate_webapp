import Link from "next/link";

export const metadata = { title: "Không đủ quyền — Quản trị CTYHP" };

/**
 * Reached when a company account signs in but holds no admin role. Says who to
 * ask rather than just refusing.
 */
export default function NoAccessPage() {
  return (
    <main
      style={{
        maxWidth: "30rem",
        margin: "clamp(1.5rem, 8vh, 5rem) auto",
        padding: "1.5rem",
        background: "#fff",
        border: "1px solid #dbe1ea",
        borderTop: "3px solid #9e3128",
      }}
    >
      <h1 style={{ marginTop: 0, fontSize: "1.15rem" }}>Tài khoản này chưa được cấp quyền</h1>
      <p style={{ color: "#45516a" }}>
        Bạn đã đăng nhập bằng email công ty, nhưng chưa có vai trò nào trong vùng quản trị. Người
        duyệt, C&amp;B và quản xưởng do Phòng Nhân sự chỉ định.
      </p>
      <p style={{ color: "#45516a" }}>
        Nếu bạn chỉ cần gửi đơn thì không phải đăng nhập — mở <Link href="/don">form gửi đơn</Link>.
      </p>
    </main>
  );
}
