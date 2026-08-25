"use client";

import { useState } from "react";
import FormSection from "./FormSection";
import GateFields from "./GateFields";
import IdentityFields from "./IdentityFields";
import LeaveFields from "./LeaveFields";
import SubmitForm, { ActionFieldError } from "./SubmitForm";

export type RequestKind = "leave" | "gate";

const FORM_ID = "request-form";

const KINDS = [
  ["leave", "Xin nghỉ phép", "Nghỉ cả ngày hoặc nửa ngày"],
  ["gate", "Ra vào cổng", "Rời công ty rồi vào lại"],
] as const;

/**
 * The whole public form, on one page — PRD section X.
 *
 * It was three screens, carried between them in the query string, so the form
 * would work without JavaScript. It never did: the name picker queried Supabase
 * from the browser, and choosing a name was the first thing the form asked. The
 * steps cost a page load each and bought nothing.
 *
 * Changing kind unmounts the other group rather than hiding it. An unmounted
 * input is absent from the FormData, so a gate pass can never carry a leave
 * date it merely stopped showing.
 */
export default function RequestForm({ initialKind = "leave" }: { initialKind?: RequestKind }) {
  const [kind, setKind] = useState<RequestKind>(initialKind);
  const [reason, setReason] = useState("");

  function chooseKind(next: RequestKind) {
    setKind(next);
    // The two kinds do not share a reason list, so a reason chosen for one is
    // not a reason for the other.
    setReason("");
  }

  return (
    <>
      <header className="form-heading">
        <h1>Gửi đơn nghỉ phép hoặc ra vào cổng</h1>
        <p>Không cần đăng nhập. Điền một lần rồi gửi.</p>
      </header>

      <SubmitForm formId={FORM_ID}>
        <FormSection title="Loại đơn">
          <div className="choice-grid">
            {KINDS.map(([value, title, hint]) => (
              <label className="choice" key={value}>
                <input
                  name="kind"
                  type="radio"
                  value={value}
                  checked={kind === value}
                  onChange={() => chooseKind(value)}
                />
                <span>
                  <strong>{title}</strong>
                  <small>{hint}</small>
                </span>
              </label>
            ))}
          </div>
          <ActionFieldError field="kind" />
        </FormSection>

        <FormSection title={kind === "leave" ? "Người xin nghỉ" : "Người xin phép"}>
          <IdentityFields />
        </FormSection>

        {kind === "leave" ? (
          <LeaveFields formId={FORM_ID} reason={reason} onReasonChange={setReason} />
        ) : (
          <GateFields formId={FORM_ID} reason={reason} onReasonChange={setReason} />
        )}
      </SubmitForm>
    </>
  );
}
