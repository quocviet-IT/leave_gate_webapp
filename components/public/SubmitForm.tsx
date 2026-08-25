"use client";

import { createContext, useActionState, useContext, type ReactNode } from "react";
import { EMPTY_FILE_STATE, type FileState } from "@/app/(public)/don/action-state";
import { fileRequestAction } from "@/app/(public)/don/actions";

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
        {/*
          The bar sticks to the foot of the viewport so the button that files
          the request is always one tap away, rather than at the end of a long
          scroll on a phone. Starting over is a quiet link: it throws away
          everything typed, and it should not look like the primary action.
        */}
        <div className="form-actions form-actions--sticky">
          <a className="action-reset" href="/don">
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
