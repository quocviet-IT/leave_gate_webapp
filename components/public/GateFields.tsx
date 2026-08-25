"use client";

import { GATE_REASON_OPTIONS } from "@/lib/domain/reasons";
import FieldLabel from "./FieldLabel";
import FormSection from "./FormSection";
import HoursLine from "./HoursLine";
import ReasonField from "./ReasonField";
import { ActionFieldError } from "./SubmitForm";

/**
 * Everything a gate pass asks for — PRD section X. No handover and no
 * commitment: leaving for an hour is not leaving the work behind. Nothing here
 * is optional, so nothing here carries a tag.
 */
export default function GateFields({
  formId,
  reason,
  onReasonChange,
}: {
  formId: string;
  reason: string;
  onReasonChange: (reason: string) => void;
}) {
  return (
    <>
      <FormSection title="Thời gian ra vào">
        <div className="form-grid">
          <div className="form-field">
            <FieldLabel htmlFor="outAt">Thời gian ra</FieldLabel>
            <input id="outAt" className="field-control" name="outAt" type="datetime-local" />
            <ActionFieldError field="outAt" />
          </div>
          <div className="form-field">
            <FieldLabel htmlFor="expectedInAt">Dự kiến vào lại</FieldLabel>
            <input
              id="expectedInAt"
              className="field-control"
              name="expectedInAt"
              type="datetime-local"
            />
            <ActionFieldError field="expectedInAt" />
          </div>
        </div>

        <HoursLine formId={formId} kind="gate" />
      </FormSection>

      <FormSection title="Lý do">
        <ReasonField
          kind="gate"
          label="Lý do xin phép"
          options={GATE_REASON_OPTIONS}
          value={reason}
          onChange={onReasonChange}
        />

        <div className="form-field">
          <FieldLabel htmlFor="note">Diễn giải</FieldLabel>
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
      </FormSection>
    </>
  );
}
