"use client";

import { useActionState, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Card, Empty, Input, Space, Statistic, Tag, Typography } from "antd";
import {
  EMPTY_TIMESHEET_STATE,
  type TimesheetActionState,
} from "@/app/admin/(guarded)/cham-cong/action-state";
import {
  markTimesheetAction,
  setFinalHoursAction,
} from "@/app/admin/(guarded)/cham-cong/actions";
import {
  ADJUSTMENT_REASON_MIN,
  adjustmentProblem,
  gateTimesDisagree,
  gateTimeVerdict,
  inPeriod,
  isAdjusted,
  isMarked,
  totals,
  type TimesheetRow,
} from "@/lib/domain/timesheet";
import { formatDate, formatDateTime, formatHours, KIND_LABELS } from "@/lib/format";
import { minutesToHours } from "@/lib/domain/workhours";

const { Title, Text } = Typography;

function periodText(row: TimesheetRow): string {
  if (row.kind === "leave") {
    if (!row.from_date) return "—";
    return row.from_date === row.to_date
      ? formatDate(row.from_date)
      : `${formatDate(row.from_date)} → ${formatDate(row.to_date!)}`;
  }
  if (!row.out_at) return "—";
  return `${formatDateTime(row.out_at)} → ${formatDateTime(row.expected_in_at!)}`;
}

/**
 * One row's editor.
 *
 * The computed hours are printed, never rendered into an input: rule 17 locks
 * them, and the way to keep a locked value locked is to give the screen no way
 * to send it.
 */
function TimesheetRowCard({ row }: { row: TimesheetRow }) {
  const [saveState, save, saving] = useActionState<TimesheetActionState, FormData>(
    setFinalHoursAction,
    EMPTY_TIMESHEET_STATE,
  );
  const [markState, mark, marking] = useActionState<TimesheetActionState, FormData>(
    markTimesheetAction,
    EMPTY_TIMESHEET_STATE,
  );

  const [finalHours, setFinalHoursInput] = useState(String(minutesToHours(row.final_minutes)));
  const [reason, setReason] = useState("");

  const parsedHours = Number.parseFloat(finalHours.replace(",", "."));
  const problem = Number.isFinite(parsedHours)
    ? adjustmentProblem(row.computed_minutes, Math.round(parsedHours * 60), reason)
    : "Số giờ chốt không hợp lệ";
  const changed = Math.round((Number.isFinite(parsedHours) ? parsedHours : 0) * 60) !==
    row.final_minutes;

  const verdict = gateTimeVerdict(row);
  const disagree = gateTimesDisagree(row);
  const failure = [saveState, markState].find(
    (state) => state.requestId === row.request_id && !state.ok && state.message,
  );

  return (
    <Card size="small">
      <Space direction="vertical" size={8} style={{ width: "100%" }}>
        <Space size={8} wrap>
          <Text strong>{row.code}</Text>
          <Tag color={row.kind === "leave" ? "blue" : "geekblue"}>{KIND_LABELS[row.kind]}</Tag>
          <Text strong>{row.full_name}</Text>
          <Text type="secondary">
            {[row.title, row.department].filter(Boolean).join(" · ") || "—"}
          </Text>
          {isMarked(row) ? <Tag color="green">Đã chốt</Tag> : null}
          {isAdjusted(row) ? <Tag color="orange">Có điều chỉnh</Tag> : null}
        </Space>

        <Text type="secondary">{periodText(row)}</Text>

        {row.kind === "gate" ? (
          <Text type="secondary" style={{ fontSize: 13 }}>
            Cổng: {row.booth_out_at ? `ra ${formatDateTime(row.booth_out_at)}` : "chưa bấm ra"}
            {" · "}
            {row.booth_in_at ? `vào ${formatDateTime(row.booth_in_at)}` : "chưa bấm vào"}
            {row.actual_in_at ? ` · giờ dùng để tính ${formatDateTime(row.actual_in_at)}` : ""}
          </Text>
        ) : null}

        {verdict.warning ? <Alert type="warning" showIcon title={verdict.warning} /> : null}
        {disagree ? (
          <Alert
            type="warning"
            showIcon
            title="Giờ bảo vệ lệch quá 15 phút so với dự kiến — vẫn dùng giờ bảo vệ, nhờ chị xem lại."
          />
        ) : null}

        <Space size={16} wrap>
          <Statistic
            title="Hệ thống tính"
            value={formatHours(row.computed_minutes)}
            valueStyle={{ fontSize: 16 }}
          />
          <Statistic
            title="Đang chốt"
            value={formatHours(row.final_minutes)}
            valueStyle={{ fontSize: 16 }}
          />
        </Space>

        {failure ? <Alert type="error" showIcon title={failure.message} /> : null}

        <form action={save}>
          <input name="requestId" type="hidden" value={row.request_id} />
          <Space direction="vertical" size={8} style={{ width: "100%" }}>
            <Space size={8} wrap align="start">
              <Input
                name="finalHours"
                addonBefore="Số giờ chốt"
                style={{ width: 220 }}
                value={finalHours}
                onChange={(event) => setFinalHoursInput(event.target.value)}
                inputMode="decimal"
              />
              <Button
                type="primary"
                htmlType="submit"
                loading={saving}
                disabled={!changed || problem !== null}
              >
                Lưu
              </Button>
            </Space>

            <Input.TextArea
              name="reason"
              rows={2}
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={`Lý do điều chỉnh — bắt buộc từ ${ADJUSTMENT_REASON_MIN} ký tự khi khác số giờ hệ thống tính`}
            />
            {changed && problem ? <Text type="danger">{problem}</Text> : null}
          </Space>
        </form>

        <form action={mark}>
          <input name="requestId" type="hidden" value={row.request_id} />
          <input name="done" type="hidden" value={isMarked(row) ? "0" : "1"} />
          <Button htmlType="submit" loading={marking}>
            {isMarked(row) ? "Bỏ đánh dấu" : "Đánh dấu đã chốt"}
          </Button>
        </form>
      </Space>
    </Card>
  );
}

export default function TimesheetTable({
  rows,
  from,
  to,
}: {
  rows: TimesheetRow[];
  from: string;
  to: string;
}) {
  const router = useRouter();
  const [fromInput, setFromInput] = useState(from);
  const [toInput, setToInput] = useState(to);

  const visible = useMemo(() => rows.filter((row) => inPeriod(row, from, to)), [rows, from, to]);
  const summary = useMemo(() => totals(visible), [visible]);

  const query = new URLSearchParams();
  if (from) query.set("tu", from);
  if (to) query.set("den", to);

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Title level={3} style={{ marginBottom: 0 }}>
        Chấm công
      </Title>

      <Space size={8} wrap align="end">
        <Input
          type="date"
          addonBefore="Từ ngày"
          value={fromInput}
          onChange={(event) => setFromInput(event.target.value)}
        />
        <Input
          type="date"
          addonBefore="Đến ngày"
          value={toInput}
          onChange={(event) => setToInput(event.target.value)}
        />
        <Button
          type="primary"
          onClick={() => {
            const next = new URLSearchParams();
            if (fromInput) next.set("tu", fromInput);
            if (toInput) next.set("den", toInput);
            router.push(`/admin/cham-cong?${next.toString()}`);
          }}
        >
          Lọc
        </Button>
        <Button href={`/admin/cham-cong/excel?${query.toString()}`}>Tải Excel</Button>
      </Space>

      <Space size={24} wrap>
        <Statistic title="Số đơn" value={summary.rows} valueStyle={{ fontSize: 18 }} />
        <Statistic
          title="Tổng giờ hệ thống tính"
          value={formatHours(summary.computedMinutes)}
          valueStyle={{ fontSize: 18 }}
        />
        <Statistic
          title="Tổng giờ chốt"
          value={formatHours(summary.finalMinutes)}
          valueStyle={{ fontSize: 18 }}
        />
        <Statistic title="Có điều chỉnh" value={summary.adjusted} valueStyle={{ fontSize: 18 }} />
        <Statistic title="Đã chốt" value={summary.marked} valueStyle={{ fontSize: 18 }} />
      </Space>

      {visible.length === 0 ? (
        <Empty description="Không có đơn đã duyệt nào trong khoảng này" />
      ) : (
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          {visible.map((row) => (
            <TimesheetRowCard key={row.request_id} row={row} />
          ))}
        </Space>
      )}
    </Space>
  );
}
