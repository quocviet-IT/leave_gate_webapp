"use client";

import { needsReasonText, type RequestKind } from "@/lib/domain/reasons";
import FieldLabel from "./FieldLabel";
import { ActionFieldError } from "./SubmitForm";

/**
 * The reason, and the box that appears when a reason is not self-explanatory.
 *
 * Which reasons need writing out is not decided here — `needsReasonText` in the
 * schemas decides it, and the same call refuses the request server-side. That
 * is the point of putting this in one component: the box a person sees and the
 * box the server insists on are the same rule read twice.
 */
export default function ReasonField({
  kind,
  label,
  options,
  value,
  onChange,
}: {
  kind: RequestKind;
  label: string;
  options: readonly (readonly [string, string])[];
  value: string;
  onChange: (reason: string) => void;
}) {
  return (
    <>
      <div className="form-field">
        <FieldLabel htmlFor="reason">{label}</FieldLabel>
        <select
          id="reason"
          className="field-control"
          name="reason"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Chọn lý do</option>
          {options.map(([option, text]) => (
            <option key={option} value={option}>
              {text}
            </option>
          ))}
        </select>
        <ActionFieldError field="reason" />
      </div>

      {needsReasonText(kind, value) ? (
        <div className="form-field">
          <FieldLabel htmlFor="reasonText">Ghi rõ lý do</FieldLabel>
          <input
            id="reasonText"
            className="field-control"
            name="reasonText"
            type="text"
            maxLength={500}
            placeholder="Viết ngắn gọn trường hợp của bạn"
          />
          <ActionFieldError field="reasonText" />
        </div>
      ) : null}
    </>
  );
}
