"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Layout, Menu, Typography } from "antd";
import type { AppRole } from "@/lib/db/types";

const { Sider, Header, Content } = Layout;
const { Text } = Typography;

const ROLE_LABELS: Record<AppRole, string> = {
  approver: "Người duyệt",
  cnb: "C&B Nhân sự",
  supervisor: "Quản xưởng",
};

type NavItem = { key: string; label: string; roles: AppRole[] };

/** Menu follows the roles in PRD section V: each person sees only their own work. */
const NAV: NavItem[] = [
  { key: "/admin", label: "Tổng quan", roles: ["approver", "cnb", "supervisor"] },
  { key: "/admin/duyet-don", label: "Duyệt đơn", roles: ["approver"] },
  { key: "/admin/cham-cong", label: "Chấm công", roles: ["cnb"] },
  { key: "/admin/tao-don-ho", label: "Tạo đơn hộ", roles: ["supervisor"] },
];

export default function AdminShell({
  role,
  email,
  children,
}: {
  role: AppRole;
  email: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const items = NAV.filter((item) => item.roles.includes(role)).map((item) => ({
    key: item.key,
    label: <Link href={item.key}>{item.label}</Link>,
  }));

  // Longest matching prefix, so /admin/duyet-don does not also light up /admin.
  const selected = items
    .map((item) => item.key)
    .filter((key) => pathname === key || pathname.startsWith(`${key}/`))
    .sort((a, b) => b.length - a.length)
    .slice(0, 1);

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider breakpoint="lg" collapsedWidth={0} width={210}>
        <div style={{ padding: "16px 16px 8px", color: "#fff", lineHeight: 1.3 }}>
          <div style={{ fontWeight: 700 }}>Quản trị CTYHP</div>
          <Text style={{ color: "#8f9bb3", fontSize: 12 }}>Nghỉ phép &amp; ra vào cổng</Text>
        </div>
        <Menu theme="dark" mode="inline" selectedKeys={selected} items={items} />
      </Sider>
      <Layout>
        <Header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            paddingInline: 20,
            borderBottom: "1px solid #dbe1ea",
          }}
        >
          <Text strong>{ROLE_LABELS[role]}</Text>
          <Text type="secondary" style={{ fontSize: 13 }}>
            {email}
          </Text>
        </Header>
        <Content style={{ padding: 20, maxWidth: 1200 }}>{children}</Content>
      </Layout>
    </Layout>
  );
}
