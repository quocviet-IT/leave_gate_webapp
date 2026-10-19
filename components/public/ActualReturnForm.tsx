"use client";

import { useActionState, useMemo, useState } from "react";
import { EMPTY_PUBLIC_ACTION_STATE } from "@/app/(public)/tra-cuu/action-state";
import { setActualReturnAction } from "@/app/(public)/tra-cuu/actions";
import {
  requiresDriftReason,
  returnDriftMinutes,
} from "@/lib/domain/workhours";
import { formatDrift } from "@/lib/format";

function ictDate(local: string): Date {
  return new Date(`${local}:00+07:00`);
}

export default function ActualReturnForm({
  token,
  expectedInAt,
}: {
  token: string;
  expectedInAt: string;
}) {
  const [state, submit, pending] = useActionState(
    setActualReturnAction,
    EMPTY_PUBLIC_ACTION_STATE,
  );
  const [actual, setActual] = useState("");
  const drift = useMemo(() => {
    if (!actual) return null;
    const parsed = ictDate(actual);
    if (Number.isNaN(parsed.getTime())) return null;
    return returnDriftMinutes(new Date(expectedInAt), parsed);
  }, [actual, expectedInAt]);
  const needsReason = drift !== null && requiresDriftReason(drift);

  return (
    <form action={submit} className="lookup-action">
      <input name="lookupToken" type="hidden" value={token} />
      <div className="form-field">
        <label htmlFor="actualInAt">Giờ vào lại thực tế</label>
        <input
          id="actualInAt"
          className="field-control"
          name="actualInAt"
          type="datetime-local"
          value={actual}
          onChange={(event) => setActual(event.target.value)}
        />
        {drift !== null ? (
          <span className={needsReason ? "drift-line drift-line--warn" : "drift-line"}>
            So với dự kiến: {formatDrift(drift)}
          </span>
        ) : (
          <span className="field-help">Nhập đúng thời gian bạn quay lại công ty.</span>
        )}
        {state.errors.actualInAt ? (
          <p className="field-error">{state.errors.actualInAt}</p>
        ) : null}
      </div>

      <div className="form-field">
        <label htmlFor="driftReason">
          Lý do vào sớm hoặc vào trễ {needsReason ? "(bắt buộc)" : "(nếu có)"}
        </label>
        <textarea
          id="driftReason"
          className="field-control"
          name="driftReason"
          rows={3}
          maxLength={500}
        />
        {state.errors.driftReason ? (
          <p className="field-error">{state.errors.driftReason}</p>
        ) : null}
      </div>

      {state.message ? (
        <div className="form-alert" role="alert">
          {state.message}
        </div>
      ) : null}

      <button className="button button--primary" type="submit" disabled={pending}>
        {pending ? "Đang lưu..." : "Lưu giờ vào lại"}
      </button>
    </form>
  );
}
