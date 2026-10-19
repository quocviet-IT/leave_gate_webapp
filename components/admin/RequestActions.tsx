"use client";

import { useActionState, useState } from "react";
import { Alert, Button, Input, Space } from "antd";
import {
  EMPTY_APPROVAL_STATE,
  type ApprovalActionState,
} from "@/app/admin/(guarded)/duyet-don/action-state";
import {
  claimRequestAction,
  decideRequestAction,
  releaseRequestAction,
} from "@/app/admin/(guarded)/duyet-don/actions";

/**
 * The buttons on one queue row.
 *
 * Each form carries the row version the approver is looking at. If the row has
 * moved on since the page rendered, the database refuses the action and names
 * who got there first — the message lands back here rather than in a toast, so
 * it stays attached to the row it is about (PRD rule 8).
 */
export default function RequestActions({
  requestId,
  version,
  canClaim,
  canDecide,
  canRelease,
}: {
  requestId: string;
  version: number;
  canClaim: boolean;
  canDecide: boolean;
  canRelease: boolean;
}) {
  const [claimState, claim, claiming] = useActionState<ApprovalActionState, FormData>(
    claimRequestAction,
    EMPTY_APPROVAL_STATE,
  );
  const [releaseState, release, releasing] = useActionState<ApprovalActionState, FormData>(
    releaseRequestAction,
    EMPTY_APPROVAL_STATE,
  );
  const [decideState, decide, deciding] = useActionState<ApprovalActionState, FormData>(
    decideRequestAction,
    EMPTY_APPROVAL_STATE,
  );
  const [note, setNote] = useState("");

  const refusal = [claimState, releaseState, decideState].find(
    (state) => state.requestId === requestId && !state.ok && state.message,
  );

  const hidden = (
    <>
      <input name="requestId" type="hidden" value={requestId} />
      <input name="version" type="hidden" value={version} />
    </>
  );

  return (
    <Space direction="vertical" size={8} style={{ width: "100%" }}>
      {refusal ? <Alert type="error" showIcon title={refusal.message} /> : null}

      {canDecide ? (
        <Input.TextArea
          rows={2}
          maxLength={1000}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Ghi chú quyết định (không bắt buộc; nếu từ chối thì nên ghi lý do)"
        />
      ) : null}

      <Space size={8} wrap>
        {canClaim ? (
          <form action={claim}>
            {hidden}
            <Button htmlType="submit" loading={claiming}>
              Nhận xử lý
            </Button>
          </form>
        ) : null}

        {canRelease ? (
          <form action={release}>
            {hidden}
            <Button htmlType="submit" loading={releasing}>
              Trả lại hàng chờ
            </Button>
          </form>
        ) : null}

        {canDecide ? (
          <>
            <form action={decide}>
              {hidden}
              <input name="decision" type="hidden" value="approved" />
              <input name="note" type="hidden" value={note} />
              <Button type="primary" htmlType="submit" loading={deciding}>
                Duyệt
              </Button>
            </form>
            <form action={decide}>
              {hidden}
              <input name="decision" type="hidden" value="rejected" />
              <input name="note" type="hidden" value={note} />
              <Button danger htmlType="submit" loading={deciding}>
                Từ chối
              </Button>
            </form>
          </>
        ) : null}
      </Space>
    </Space>
  );
}
