"use client";

import { useActionState } from "react";
import { EMPTY_PUBLIC_ACTION_STATE } from "@/app/(public)/tra-cuu/action-state";
import { withdrawRequestAction } from "@/app/(public)/tra-cuu/actions";

export default function WithdrawForm({ token }: { token: string }) {
  const [state, submit, pending] = useActionState(
    withdrawRequestAction,
    EMPTY_PUBLIC_ACTION_STATE,
  );

  return (
    <form action={submit} className="lookup-action">
      <input name="lookupToken" type="hidden" value={token} />
      <div className="form-field">
        <label htmlFor="withdrawReason">Lý do rút đơn (không bắt buộc)</label>
        <input
          id="withdrawReason"
          className="field-control"
          name="reason"
          type="text"
          maxLength={500}
          placeholder="Ví dụ: Không còn nhu cầu nghỉ"
        />
        {state.errors.reason ? <p className="field-error">{state.errors.reason}</p> : null}
      </div>
      {state.message ? (
        <div className="form-alert" role="alert">
          {state.message}
        </div>
      ) : null}
      <button className="button button--danger" type="submit" disabled={pending}>
        {pending ? "Đang rút đơn..." : "Rút đơn"}
      </button>
    </form>
  );
}
