"use client";

import { createContext, useActionState, useContext, type ReactNode } from "react";
import {
  EMPTY_FILE_STATE,
  fileRequestAction,
  type FileState,
} from "@/app/(public)/don/actions";

const FileStateContext = createContext<FileState>(EMPTY_FILE_STATE);

export function ActionFieldError({ field }: { field: string }) {
  const state = useContext(FileStateContext);
  const message = state.errors[field];
  return message ? (
    <p id={`${field}-action-error`} className="field-error" role="alert">
      {message}
    </p>
  ) : null;
}

export default function SubmitForm({
  children,
  submitLabel = "Gửi đơn",
  formId,
}: {
  children: ReactNode;
  submitLabel?: string;
  formId: string;
}) {
  const [state, submit, pending] = useActionState<FileState, FormData>(
    fileRequestAction,
    EMPTY_FILE_STATE,
  );

  if (state.ok && state.filed) {
    return (
      <section className="file-success" aria-live="polite">
        <span className="step-kicker">Đã gửi đơn</span>
        <h1>Hệ thống đã nhận đơn của bạn</h1>
        <p>Mã đơn</p>
        <strong className="request-code">{state.filed.code}</strong>
        <a className="button button--primary" href={`/tra-cuu/${state.filed.token}`}>
          Mở trang theo dõi riêng
        </a>
        <p className="success-note">
          Hãy lưu đường dẫn theo dõi. Mã đơn một mình chỉ xem được trạng thái chung.
        </p>
      </section>
    );
  }

  return (
    <FileStateContext.Provider value={state}>
      <form id={formId} action={submit} className="request-form">
        {children}
        {state.message ? (
          <div className="form-alert" role="alert">
            <strong>Chưa gửi được đơn</strong>
            <p>{state.message}</p>
          </div>
        ) : null}
        <div className="form-actions">
          <a className="button button--secondary" href="/don">
            Làm lại
          </a>
          <button className="button button--primary" type="submit" disabled={pending}>
            {pending ? "Đang gửi..." : submitLabel}
          </button>
        </div>
      </form>
    </FileStateContext.Provider>
  );
}
