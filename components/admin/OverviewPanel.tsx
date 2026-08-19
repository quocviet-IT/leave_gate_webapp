"use client";

import Link from "next/link";
import { Alert, Card, Col, Row, Space, Statistic, Typography } from "antd";
import type { AppRole } from "@/lib/db/types";
import type { Overview } from "@/lib/services/overview";
import { formatDate, formatHours } from "@/lib/format";

const { Title, Text } = Typography;

/**
 * What is stuck, at a glance — PRD section XII.
 *
 * Counts only: no name, no reason, no request. Everybody in the admin zone
 * lands here, including supervisors, and a supervisor has no business reading
 * another department's leave reasons off the front page.
 */
export default function OverviewPanel({
  counts,
  role,
  from,
  to,
}: {
  counts: Overview;
  role: AppRole;
  from: string;
  to: string;
}) {
  const tiles: { title: string; value: string | number; href?: string; danger?: boolean }[] = [
    { title: "Đang chờ quyết định", value: counts.pending, href: role === "approver" ? "/admin/duyet-don" : undefined },
    { title: "Quá 2 giờ làm việc chưa ai nhận", value: counts.overdue, danger: counts.overdue > 0, href: role === "approver" ? "/admin/duyet-don" : undefined },
    { title: "Chưa có ai nhận xử lý", value: counts.unclaimed },
    { title: "Ra cổng hôm nay", value: counts.gatePassesToday },
    { title: "Đang ở ngoài, chưa vào lại", value: counts.awaitingGateReturn, danger: counts.awaitingGateReturn > 0 },
    { title: "Chưa chốt chấm công", value: counts.unmarked, href: role === "cnb" ? "/admin/cham-cong" : undefined },
    { title: "Giờ nghỉ phép trong kỳ", value: formatHours(counts.leaveMinutes) },
    { title: "Giờ ra cổng trong kỳ", value: formatHours(counts.gateMinutes) },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <div>
        <Title level={3} style={{ marginBottom: 4 }}>
          Tổng quan
        </Title>
        <Text type="secondary">
          Kỳ {formatDate(from)} → {formatDate(to)}
        </Text>
      </div>

      {counts.overdue > 0 ? (
        <Alert
          type="warning"
          showIcon
          title={`${counts.overdue} đơn đã quá 2 giờ làm việc mà chưa ai nhận xử lý.`}
          description="Nhóm Chat của người duyệt đã được nhắc. Mở màn hình Duyệt đơn, tab Quá hạn."
        />
      ) : null}

      <Row gutter={[12, 12]}>
        {tiles.map((tile) => (
          <Col key={tile.title} xs={12} md={8} xl={6}>
            <Card size="small">
              <Statistic
                title={tile.title}
                value={tile.value}
                valueStyle={{ fontSize: 22, color: tile.danger ? "#cf1322" : undefined }}
              />
              {tile.href ? (
                <Link href={tile.href} style={{ fontSize: 13 }}>
                  Mở màn hình
                </Link>
              ) : null}
            </Card>
          </Col>
        ))}
      </Row>
    </Space>
  );
}
