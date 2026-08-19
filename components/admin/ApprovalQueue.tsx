"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Badge, Card, Empty, Space, Tabs, Tag, Typography } from "antd";
import { createSupabaseBrowserClient } from "@/lib/db/client";
import {
  belongsOnTab,
  claimMinutesLeft,
  countByTab,
  effectiveStatus,
  isHeldBy,
  isHeldByOther,
  isOwnRequest,
  isQueueTab,
  QUEUE_TAB_LABELS,
  QUEUE_TABS,
  type QueueRequest,
  type QueueTab,
} from "@/lib/domain/approvals";
import type { QueueRow } from "@/lib/services/approvals";
import {
  formatDate,
  formatDateTime,
  formatDuration,
  GATE_REASON_LABELS,
  KIND_LABELS,
  LEAVE_REASON_LABELS,
  STATUS_LABELS,
} from "@/lib/format";
import { isOverdue } from "@/lib/domain/sla";
import RequestActions from "./RequestActions";

const { Title, Paragraph, Text } = Typography;

/** The queue's own view of a row, without the display columns the rules ignore. */
function toQueueRequest(row: QueueRow): QueueRequest {
  return {
    id: row.id,
    status: row.status,
    submittedAt: row.submitted_at,
    claimedByEmail: row.claimed_by_email,
    claimedAt: row.claimed_at,
    decidedByEmail: row.decided_by_email,
    subjectEmail: row.subject_email,
  };
}

function whenText(row: QueueRow): string {
  if (row.kind === "leave" && row.leave) {
    const span =
      row.leave.from_date === row.leave.to_date
        ? formatDate(row.leave.from_date)
        : `${formatDate(row.leave.from_date)} → ${formatDate(row.leave.to_date)}`;
    const half = row.leave.half_day
      ? `, nửa ngày buổi ${row.leave.half_day === "morning" ? "sáng" : "chiều"}`
      : "";
    return `${span}${half}`;
  }
  if (row.kind === "gate" && row.gate) {
    return `${formatDateTime(row.gate.out_at)} → ${formatDateTime(row.gate.expected_in_at)}`;
  }
  return "—";
}

function reasonText(row: QueueRow): string {
  if (row.kind === "leave" && row.leave) {
    const label =
      LEAVE_REASON_LABELS[row.leave.reason as keyof typeof LEAVE_REASON_LABELS] ?? row.leave.reason;
    return row.leave.reason_text ? `${label} — ${row.leave.reason_text}` : label;
  }
  if (row.kind === "gate" && row.gate) {
    const label =
      GATE_REASON_LABELS[row.gate.reason as keyof typeof GATE_REASON_LABELS] ?? row.gate.reason;
    return row.gate.reason_text ? `${label} — ${row.gate.reason_text}` : label;
  }
  return "—";
}

function noteText(row: QueueRow): string {
  return row.kind === "leave" ? (row.leave?.note ?? "") : (row.gate?.note ?? "");
}

export default function ApprovalQueue({
  rows,
  email,
  serverNow,
  holderNames,
}: {
  rows: QueueRow[];
  email: string;
  /** Rendered on the server first, so the first paint matches the markup. */
  serverNow: string;
  /** Account email → display name, for "Chị Diệu đang xử lý". */
  holderNames: Record<string, string>;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<QueueTab>("pending");
  const [now, setNow] = useState(() => new Date(serverNow));

  // The claim countdown and the overdue flag both move on their own, so the
  // screen has to re-read the clock even when no row changed.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  // PRD section VII: a request claimed or decided elsewhere shows up here at
  // once, so nobody works off a table that has already moved on.
  useEffect(() => {
    const sb = createSupabaseBrowserClient();
    const channel = sb
      .channel("lg_request_queue")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lg_request" },
        () => router.refresh(),
      )
      .subscribe();
    return () => {
      void sb.removeChannel(channel);
    };
  }, [router]);

  const requests = useMemo(() => rows.map(toQueueRequest), [rows]);
  const counts = useMemo(() => countByTab(requests, email, now), [requests, email, now]);

  const visible = rows.filter((row) => belongsOnTab(tab, toQueueRequest(row), email, now));

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <div>
        <Title level={3} style={{ marginBottom: 4 }}>
          Hàng chờ duyệt
        </Title>
        <Text type="secondary">
          {counts.pending} đơn đang chờ · toàn công ty. Một người duyệt là đủ.
        </Text>
      </div>

      <Tabs
        activeKey={tab}
        onChange={(key) => setTab(isQueueTab(key) ? key : "pending")}
        items={QUEUE_TABS.map((key) => ({
          key,
          label: (
            <Space size={8}>
              {QUEUE_TAB_LABELS[key]}
              <Badge
                count={counts[key]}
                showZero={false}
                color={key === "overdue" ? "#cf1322" : undefined}
              />
            </Space>
          ),
        }))}
      />

      {visible.length === 0 ? (
        <Empty description="Không có đơn nào trong tab này" />
      ) : (
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          {visible.map((row) => {
            const request = toQueueRequest(row);
            const status = effectiveStatus(request, now);
            const heldByMe = isHeldBy(request, email, now);
            const heldByOther = isHeldByOther(request, email, now);
            const own = isOwnRequest(request, email);
            const overdue = status === "pending" && isOverdue(new Date(row.submitted_at), now);
            const holder = row.claimed_by_email
              ? (holderNames[row.claimed_by_email] ?? row.claimed_by_email)
              : "";

            return (
              <Card
                key={row.id}
                size="small"
                style={heldByOther ? { opacity: 0.6 } : undefined}
                title={
                  <Space size={8} wrap>
                    <Text strong>{row.code}</Text>
                    <Tag color={row.kind === "leave" ? "blue" : "geekblue"}>
                      {KIND_LABELS[row.kind]}
                    </Tag>
                    <Tag>{STATUS_LABELS[status]}</Tag>
                    {overdue ? <Tag color="red">Quá hạn</Tag> : null}
                    {heldByMe ? (
                      <Tag color="green">
                        Bạn đang giữ · còn {claimMinutesLeft(new Date(row.claimed_at!), now)} phút
                      </Tag>
                    ) : null}
                    {heldByOther ? <Tag color="orange">{holder} đang xử lý</Tag> : null}
                  </Space>
                }
              >
                <Space direction="vertical" size={6} style={{ width: "100%" }}>
                  <Text strong>{row.employee_snapshot.full_name}</Text>
                  <Text type="secondary">
                    {[row.employee_snapshot.title, row.employee_snapshot.department]
                      .filter(Boolean)
                      .join(" · ") || "Chưa có chức vụ và phòng ban"}
                  </Text>
                  <Paragraph style={{ margin: 0 }}>
                    <Text type="secondary">Thời gian: </Text>
                    {whenText(row)}
                    <Text type="secondary"> · Số giờ: </Text>
                    {formatDuration(row.computed_minutes, row.kind)}
                  </Paragraph>
                  <Paragraph style={{ margin: 0 }}>
                    <Text type="secondary">Lý do: </Text>
                    {reasonText(row)}
                  </Paragraph>
                  {noteText(row) ? (
                    <Paragraph style={{ margin: 0 }}>
                      <Text type="secondary">Diễn giải: </Text>
                      {noteText(row)}
                    </Paragraph>
                  ) : null}
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Gửi lúc {formatDateTime(row.submitted_at)}
                    {row.filed_by_email ? ` · quản xưởng ${row.filed_by_email} gửi hộ` : ""}
                  </Text>

                  {row.decided_by_email ? (
                    <Alert
                      type={row.status === "approved" ? "success" : "warning"}
                      showIcon
                      title={`${holderNames[row.decided_by_email] ?? row.decided_by_email} ${
                        row.status === "approved" ? "đã duyệt" : "đã từ chối"
                      }${row.decided_at ? ` lúc ${formatDateTime(row.decided_at)}` : ""}`}
                      description={row.decision_note ?? undefined}
                    />
                  ) : own ? (
                    <Alert
                      type="info"
                      showIcon
                      title="Đơn của chính bạn — ba người duyệt còn lại sẽ xử lý."
                    />
                  ) : (
                    <RequestActions
                      requestId={row.id}
                      version={row.version}
                      canClaim={!heldByOther && !heldByMe}
                      canDecide={!heldByOther}
                      canRelease={heldByMe}
                    />
                  )}
                </Space>
              </Card>
            );
          })}
        </Space>
      )}
    </Space>
  );
}
