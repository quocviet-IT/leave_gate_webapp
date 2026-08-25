"use client";
import { useState, type FormEvent } from "react";
import { Alert, Button, Card, Input, Space, Typography } from "antd";
import { createSupabaseBrowserClient } from "@/lib/db/client";
import { accountEmail } from "@/lib/domain/admin-accounts";

const { Title, Paragraph, Text } = Typography;

/**
 * Username and password — PRD screen 5, rewritten on 2026-08-25.
 *
 * This was one Google button. The provider was never enabled on the Supabase
 * project, so the button had never signed anybody in; the board chose issued
 * accounts instead. A person types `duyet`, not an address: `accountEmail`
 * turns it into the one Supabase knows, and refuses anything outside the
 * company before a request is made, so an outside address gets a clear answer
 * rather than a generic failure.
 */
export default function SignInCard({ domain }: { domain: string }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const email = accountEmail(username);
    if (!email) {
      setError(`Tên đăng nhập không hợp lệ. Dùng tài khoản @${domain} công ty cấp.`);
      return;
    }
    if (password === "") {
      setError("Nhập mật khẩu.");
      return;
    }

    setBusy(true);
    try {
      const sb = createSupabaseBrowserClient();
      const { error: signInError } = await sb.auth.signInWithPassword({ email, password });
      if (signInError) {
        // Supabase says "Invalid login credentials" for a wrong username and a
        // wrong password alike, and that is the right amount to say.
        setError("Tên đăng nhập hoặc mật khẩu không đúng.");
        setBusy(false);
        return;
      }
      // A full load, not a client-side push: the session cookie has just been
      // set and the admin pages read it on the server.
      window.location.assign("/admin");
    } catch {
      setBusy(false);
      setError("Không đăng nhập được. Kiểm tra mạng rồi thử lại.");
    }
  }

  return (
    <Card style={{ maxWidth: 420, margin: "clamp(1.5rem, 8vh, 5rem) auto" }}>
      <form onSubmit={signIn}>
        <Space direction="vertical" size="middle" style={{ display: "flex" }}>
          <div>
            <Title level={4} style={{ marginBottom: 4 }}>
              Vùng quản trị
            </Title>
            <Text type="secondary">Duyệt đơn · chấm công · nhân sự</Text>
          </div>

          <label>
            <Text strong>Tên đăng nhập</Text>
            <Input
              size="large"
              autoComplete="username"
              autoCapitalize="off"
              autoCorrect="off"
              placeholder="Ví dụ: duyet"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>

          <label>
            <Text strong>Mật khẩu</Text>
            <Input.Password
              size="large"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          <Button type="primary" size="large" block loading={busy} htmlType="submit">
            Đăng nhập
          </Button>

          {error ? <Alert type="error" showIcon message="Chưa đăng nhập được" description={error} /> : null}

          <Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 13 }}>
            Tài khoản do công ty cấp. Quên mật khẩu thì báo Phòng Nhân sự đặt lại.
          </Paragraph>

          <Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 13 }}>
            Bạn là CBNV muốn gửi đơn? Không cần đăng nhập — mở <a href="/don">form gửi đơn</a>.
          </Paragraph>
        </Space>
      </form>
    </Card>
  );
}
