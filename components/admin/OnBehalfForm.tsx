"use client";

import { useActionState, useState } from "react";
import { Alert, Button, Card, Input, Radio, Select, Space, Typography } from "antd";
import {
  EMPTY_ON_BEHALF_STATE,
  type OnBehalfState,
} from "@/app/admin/(guarded)/tao-don-ho/action-state";
import { fileOnBehalfAction } from "@/app/admin/(guarded)/tao-don-ho/actions";
import type { SupervisorEmployee } from "@/lib/services/supervisor";
import { GATE_REASON_LABELS, LEAVE_REASON_LABELS } from "@/lib/format";

const { Title, Paragraph, Text } = Typography;

/**
 * A supervisor filing for a worker who has no phone on them — PRD rule 6.
 *
 * The list of people is whatever the database says is in this supervisor's own
 * department; the screen never asks which department, because that would be a
 * choice, and it is not one.
 */
export default function OnBehalfForm({ employees }: { employees: SupervisorEmployee[] }) {
  const [state, submit, pending] = useActionState<OnBehalfState, FormData>(
    fileOnBehalfAction,
    EMPTY_ON_BEHALF_STATE,
  );
  const [kind, setKind] = useState<"leave" | "gate">("leave");
  const [reason, setReason] = useState("");

  const reasons = kind === "leave" ? LEAVE_REASON_LABELS : GATE_REASON_LABELS;
  const needsReasonText = kind === "leave" ? reason === "special" || reason === "other" : reason === "other";

  if (employees.length === 0) {
    return (
      <Card>
        <Title level={4}>Tạo đơn hộ</Title>
        <Alert
          type="info"
          showIcon
          title="Chưa có ai trong danh sách"
          description="Tài khoản của bạn chưa được gán xưởng, hoặc xưởng chưa có nhân sự nào trong danh sách. Nhờ Phòng Nhân sự cập nhật."
        />
      </Card>
    );
  }

  return (
    <Card>
      <form action={submit}>
        <Space direction="vertical" size={14} style={{ width: "100%" }}>
          <div>
            <Title level={4} style={{ marginBottom: 4 }}>
              Tạo đơn hộ
            </Title>
            <Text type="secondary">
              Chỉ gửi được cho người trong xưởng của bạn. Đơn sẽ ghi rõ là bạn gửi hộ.
            </Text>
          </div>

          {state.filed ? (
            <Alert
              type="success"
              showIcon
              title={state.message}
              description={
                <Paragraph style={{ margin: 0 }}>
                  Đưa đường dẫn theo dõi này cho {state.filed.employeeName || "người gửi"}:{" "}
                  <code>/tra-cuu/{state.filed.token}</code>
                </Paragraph>
              }
            />
          ) : state.message ? (
            <Alert type="error" showIcon title={state.message} />
          ) : null}

          <div>
            <Text strong>Loại đơn</Text>
            <div>
              <Radio.Group
                value={kind}
                onChange={(event) => {
                  setKind(event.target.value);
                  setReason("");
                }}
                options={[
                  { label: "Xin nghỉ phép", value: "leave" },
                  { label: "Ra vào cổng", value: "gate" },
                ]}
                optionType="button"
              />
            </div>
            <input name="kind" type="hidden" value={kind} />
          </div>

          <div>
            <Text strong>Gửi hộ cho</Text>
            <Select
              showSearch
              optionFilterProp="label"
              style={{ width: "100%" }}
              placeholder="Chọn người trong xưởng"
              options={employees.map((person) => ({
                value: person.id,
                label: `${person.fullName}${person.title ? ` — ${person.title}` : ""}`,
              }))}
              onChange={(id: string) => {
                const field = document.querySelector<HTMLInputElement>('input[name="employeeId"]');
                if (field) field.value = id;
              }}
            />
            <input name="employeeId" type="hidden" defaultValue="" />
            {state.errors.employeeId ? <Text type="danger">{state.errors.employeeId}</Text> : null}
          </div>

          {kind === "leave" ? (
            <>
              <Space size={8} wrap>
                <Input name="fromDate" type="date" addonBefore="Từ ngày" />
                <Input name="toDate" type="date" addonBefore="Đến ngày" />
              </Space>
              {state.errors.fromDate ? <Text type="danger">{state.errors.fromDate}</Text> : null}
              {state.errors.toDate ? <Text type="danger">{state.errors.toDate}</Text> : null}
              <Input name="handoverName" placeholder="Bàn giao công việc cho (ghi tên)" />
              {state.errors.handoverName ? (
                <Text type="danger">{state.errors.handoverName}</Text>
              ) : null}
            </>
          ) : (
            <>
              <Space size={8} wrap>
                <Input name="outAt" type="datetime-local" addonBefore="Giờ ra" />
                <Input name="expectedInAt" type="datetime-local" addonBefore="Dự kiến vào" />
              </Space>
              {state.errors.outAt ? <Text type="danger">{state.errors.outAt}</Text> : null}
              {state.errors.expectedInAt ? (
                <Text type="danger">{state.errors.expectedInAt}</Text>
              ) : null}
            </>
          )}

          <div>
            <Text strong>Lý do</Text>
            <Select
              style={{ width: "100%" }}
              placeholder="Chọn lý do"
              value={reason || undefined}
              onChange={(next: string) => setReason(next)}
              options={Object.entries(reasons).map(([value, label]) => ({ value, label }))}
            />
            <input name="reason" type="hidden" value={reason} />
            {state.errors.reason ? <Text type="danger">{state.errors.reason}</Text> : null}
          </div>

          {needsReasonText ? (
            <Input name="reasonText" placeholder="Ghi rõ lý do" maxLength={200} />
          ) : (
            <input name="reasonText" type="hidden" value="" />
          )}

          <Input.TextArea name="note" rows={3} maxLength={500} placeholder="Diễn giải" />
          {state.errors.note ? <Text type="danger">{state.errors.note}</Text> : null}

          {kind === "leave" ? <input name="committed" type="hidden" value="on" /> : null}

          <Button type="primary" htmlType="submit" loading={pending}>
            Gửi đơn hộ
          </Button>
        </Space>
      </form>
    </Card>
  );
}
