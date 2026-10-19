"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Empty, Input, Space, Tag, Typography } from "antd";
import { EMPTY_BOOTH_STATE, type BoothActionState } from "@/app/bao-ve/action-state";
import { boothStampAction, boothUndoAction } from "@/app/bao-ve/actions";
import {
  BOOTH_STATE_LABELS,
  boothState,
  canStampIn,
  canStampOut,
  countByState,
  matchesSearch,
  undoableDirection,
  UNDO_WINDOW_MINUTES,
  type BoothRow,
} from "@/lib/domain/booth";
import { formatTime } from "@/lib/format";

const { Title, Text } = Typography;

/**
 * One row of the gate board.
 *
 * The two buttons write the server's clock — the guard never types a time. What
 * is deliberately absent is the reason: a booth screen must never show why
 * somebody is going out (PRD rules 14 and 19), so this component is given no
 * field that could carry one.
 */
function BoothRowCard({ row, now }: { row: BoothRow; now: Date }) {
  const [stampState, doStamp, stamping] = useActionState<BoothActionState, FormData>(
    boothStampAction,
    EMPTY_BOOTH_STATE,
  );
  const [undoState, doUndo, undoing] = useActionState<BoothActionState, FormData>(
    boothUndoAction,
    EMPTY_BOOTH_STATE,
  );

  const state = boothState(row);
  const undoDirection = undoableDirection(row, now);
  const problem = [stampState, undoState].find(
    (candidate) => candidate.requestId === row.id && !candidate.ok && candidate.message,
  );

  return (
    <Card size="small">
      <Space direction="vertical" size={8} style={{ width: "100%" }}>
        <Space size={10} wrap>
          <Title level={5} style={{ margin: 0 }}>
            {row.full_name}
          </Title>
          <Text type="secondary">{row.code}</Text>
          {row.department ? <Tag>{row.department}</Tag> : null}
          <Tag
            color={state === "returned" ? "green" : state === "outside" ? "orange" : "default"}
          >
            {BOOTH_STATE_LABELS[state]}
          </Tag>
        </Space>

        <Text type="secondary">
          Dự kiến ra {formatTime(row.out_at)} · về {formatTime(row.expected_in_at)}
          {row.booth_out_at ? ` · đã ra ${formatTime(row.booth_out_at)}` : ""}
          {row.booth_in_at ? ` · đã về ${formatTime(row.booth_in_at)}` : ""}
        </Text>

        {problem ? <Alert type="error" showIcon title={problem.message} /> : null}

        <Space size={8} wrap>
          <form action={doStamp}>
            <input name="requestId" type="hidden" value={row.id} />
            <input name="direction" type="hidden" value="out" />
            <Button
              type="primary"
              size="large"
              htmlType="submit"
              disabled={!canStampOut(row)}
              loading={stamping}
            >
              Cho ra
            </Button>
          </form>

          <form action={doStamp}>
            <input name="requestId" type="hidden" value={row.id} />
            <input name="direction" type="hidden" value="in" />
            <Button
              type="primary"
              size="large"
              htmlType="submit"
              disabled={!canStampIn(row)}
              loading={stamping}
            >
              Cho vào
            </Button>
          </form>

          {undoDirection ? (
            <form action={doUndo}>
              <input name="requestId" type="hidden" value={row.id} />
              <input name="direction" type="hidden" value={undoDirection} />
              <Button htmlType="submit" loading={undoing}>
                Hoàn tác {undoDirection === "out" ? "Cho ra" : "Cho vào"}
              </Button>
            </form>
          ) : null}
        </Space>
      </Space>
    </Card>
  );
}

export default function BoothBoard({
  boothName,
  rows,
  serverNow,
}: {
  boothName: string;
  rows: BoothRow[];
  /** Rendered on the server first, so the first paint matches the markup. */
  serverNow: string;
}) {
  const [term, setTerm] = useState("");
  const [now, setNow] = useState(() => new Date(serverNow));

  // The undo window closes on its own, so the buttons have to re-read the clock.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(timer);
  }, []);

  const counts = useMemo(() => countByState(rows), [rows]);
  const visible = rows.filter((row) => matchesSearch(row, term));

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <div>
        <Title level={3} style={{ marginBottom: 4 }}>
          Ra vào cổng hôm nay
        </Title>
        <Text type="secondary">{boothName}</Text>
      </div>

      <Space size={16} wrap>
        <Badge count={counts.waiting} showZero color="#8c8c8c" />
        <Text>Chưa ra</Text>
        <Badge count={counts.outside} showZero color="#fa8c16" />
        <Text>Đang ở ngoài</Text>
        <Badge count={counts.returned} showZero color="#52c41a" />
        <Text>Đã về</Text>
      </Space>

      <Input
        size="large"
        allowClear
        placeholder="Tìm theo tên hoặc mã đơn"
        value={term}
        onChange={(event) => setTerm(event.target.value)}
      />

      <Text type="secondary" style={{ fontSize: 13 }}>
        Bấm nhầm thì hoàn tác được trong {UNDO_WINDOW_MINUTES} phút. Quá thời gian đó, nhờ C&amp;B
        sửa kèm lý do.
      </Text>

      {visible.length === 0 ? (
        <Empty description="Hôm nay không có giấy ra vào cổng nào" />
      ) : (
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          {visible.map((row) => (
            <BoothRowCard key={row.id} row={row} now={now} />
          ))}
        </Space>
      )}
    </Space>
  );
}
