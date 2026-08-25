"use client";

import { GATE_REASON_OPTIONS } from "@/lib/domain/reasons";
import ReasonField from "./ReasonField";
import { ActionFieldError } from "./SubmitForm";

/**
 * Everything a gate pass asks for — PRD section X. No handover and no
 * commitment: leaving for an hour is not leaving the work behind.
 */
export default function GateFields({
  reason,
  onReasonChange,
}: {
  reason: string;
  onReasonChange: (reason: string) => void;
}) {
  return (
    <>
      <ReasonField
        kind="gate"
        label="Lý do xin phép"
        options={GATE_REASON_OPTIONS}
        value={reason}
        onChange={onReasonChange}
      />

      <div className="form-grid">
        <div className="form-field">
          <label htmlFor="outAt">Thời gian ra</label>
          <input id="outAt" className="field-control" name="outAt" type="datetime-local" />
          <ActionFieldError field="outAt" />
        </div>
        <div className="form-field">
          <label htmlFor="expectedInAt">Dự kiến vào lại</label>
          <input
            id="expectedInAt"
            className="field-control"
            name="expectedInAt"
            type="datetime-local"
          />
          <ActionFieldError field="expectedInAt" />
        </div>
      </div>

      <div className="form-field">
        <label htmlFor="note">Diễn giải</label>
        <textarea
          id="note"
          className="field-control"
          name="note"
          rows={3}
          maxLength={1000}
          placeholder="Ghi ngắn gọn nội dung cần xin phép"
        />
        <ActionFieldError field="note" />
      </div>
    </>
  );
}
