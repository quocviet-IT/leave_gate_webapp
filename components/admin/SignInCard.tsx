"use client";
import { useState } from "react";
import { Alert, Button, Card, Space, Typography } from "antd";
import { createSupabaseBrowserClient } from "@/lib/db/client";

const { Title, Paragraph, Text } = Typography;

/**
 * One button, no email field, no password — PRD screen 5. The `hd` parameter
 * asks Google to show only company accounts; the domain is enforced again on the
 * server and in the database, because a query parameter is a hint, not a rule.
 */
export default function SignInCard({ domain }: { domain: string }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setBusy(true);
    setError(null);
    try {
      const sb = createSupabaseBrowserClient();
      const { error: signInError } = await sb.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/admin`,
          queryParams: { hd: domain, prompt: "select_account" },
        },
      });
      if (signInError) throw signInError;
    } catch (cause) {
      setBusy(false);
      setError(
        cause instanceof Error
          ? cause.message
          : "Không mở được trang đăng nhập Google. Thử lại sau ít phút.",
      );
    }
  }

  return (
    <Card style={{ maxWidth: 420, margin: "clamp(1.5rem, 8vh, 5rem) auto" }}>
      <Space direction="vertical" size="middle" style={{ display: "flex" }}>
        <div>
          <Title level={4} style={{ marginBottom: 4 }}>
            Vùng quản trị
          </Title>
          <Text type="secondary">Duyệt đơn · chấm công · tạo đơn hộ</Text>
        </div>

        <Button type="primary" size="large" block loading={busy} onClick={signIn}>
          Đăng nhập bằng email công ty
        </Button>

        <Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 13 }}>
          Chọn tài khoản <Text code>@{domain}</Text> của bạn. Không cần nhập email, không cần mật
          khẩu. Tài khoản ngoài công ty sẽ bị từ chối.
        </Paragraph>

        {error ? <Alert type="error" showIcon message="Chưa đăng nhập được" description={error} /> : null}

        <Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 13 }}>
          Bạn là CBNV muốn gửi đơn? Không cần đăng nhập — mở <a href="/don">form gửi đơn</a>.
        </Paragraph>
      </Space>
    </Card>
  );
}
