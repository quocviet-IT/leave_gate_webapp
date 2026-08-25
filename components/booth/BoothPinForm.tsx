"use client";

import { useActionState } from "react";
import { Alert, Button, Card, Input, Space, Typography } from "antd";
import { EMPTY_BOOTH_STATE, type BoothActionState } from "@/app/bao-ve/action-state";
import { boothSignInAction } from "@/app/bao-ve/actions";
import { BOOTH_SESSION_DAYS } from "@/lib/domain/booth";

const { Title, Text } = Typography;

/**
 * The way into the booth zone. One PIN, no account: the session lasts weeks on
 * that machine so a shift change needs no sign-in (PRD section VIII).
 */
export default function BoothPinForm() {
  const [state, submit, pending] = useActionState<BoothActionState, FormData>(
    boothSignInAction,
    EMPTY_BOOTH_STATE,
  );

  return (
    <Card style={{ maxWidth: 420, margin: "10vh auto 0" }}>
      <form action={submit}>
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          <Title level={4} style={{ margin: 0 }}>
            Bốt bảo vệ
          </Title>
          <Text type="secondary">
            Nhập mã PIN của bốt. Máy này sẽ giữ ca trong {BOOTH_SESSION_DAYS} ngày, đổi ca không cần
            nhập lại.
          </Text>

          <Input.Password
            name="pin"
            size="large"
            autoFocus
            inputMode="numeric"
            placeholder="Mã PIN"
            autoComplete="off"
          />

          {state.message ? (
            <Alert type={state.ok ? "success" : "error"} showIcon title={state.message} />
          ) : null}

          <Button type="primary" size="large" htmlType="submit" block loading={pending}>
            Mở ca
          </Button>
        </Space>
      </form>
    </Card>
  );
}
