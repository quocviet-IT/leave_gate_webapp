"use client";

import { LEAVE_REASON_OPTIONS } from "@/lib/domain/reasons";
import FieldLabel from "./FieldLabel";
import FormSection from "./FormSection";
import HoursLine from "./HoursLine";
import ReasonField from "./ReasonField";
import { ActionFieldError } from "./SubmitForm";

/**
 * Everything a leave application asks for — PRD section X, in the order the
 * paper form asks it.
 *
 * The hours line sits inside the dates block rather than at the foot of the
 * form: it answers the question those two dates just raised, and it is the one
 * thing this form does that the paper never could.
 *
 * The handover and the make-up date are optional, matching the blank lines for
 * them on the paper form. They are last because a worker with nothing to add
 * should reach the button without stopping.
 */
export default function LeaveFields({
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
      <FormSection title="Thời gian nghỉ">
        <div className="form-grid">
          <div className="form-field">
            <FieldLabel htmlFor="fromDate">Nghỉ từ ngày</FieldLabel>
            <input id="fromDate" className="field-control" name="fromDate" type="date" />
            <ActionFieldError field="fromDate" />
          </div>
          <div className="form-field">
            <FieldLabel htmlFor="toDate">Đến hết ngày</FieldLabel>
            <input id="toDate" className="field-control" name="toDate" type="date" />
            <ActionFieldError field="toDate" />
          </div>
        </div>

        <div className="form-field">
          <FieldLabel htmlFor="halfDay">Thời lượng</FieldLabel>
          <select id="halfDay" className="field-control" name="halfDay">
            <option value="">Cả ngày</option>
            <option value="morning">Nửa ngày buổi sáng</option>
            <option value="afternoon">Nửa ngày buổi chiều</option>
          </select>
          <span className="field-help">Nửa ngày chỉ chọn được khi nghỉ trong một ngày.</span>
          <ActionFieldError field="halfDay" />
        </div>

        <HoursLine formId={formId} kind="leave" />
      </FormSection>

      <FormSection title="Lý do">
        <ReasonField
          kind="leave"
          label="Lý do nghỉ"
          options={LEAVE_REASON_OPTIONS}
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
            placeholder="Ghi ngắn gọn lý do nghỉ"
          />
          <ActionFieldError field="note" />
        </div>
      </FormSection>

      <FormSection title="Bàn giao">
        <div className="form-field">
          <FieldLabel htmlFor="handoverName" optional>
            Bàn giao công việc cho
          </FieldLabel>
          <input
            id="handoverName"
            className="field-control"
            name="handoverName"
            type="text"
            maxLength={100}
            autoCapitalize="words"
            placeholder="Tên người nhận bàn giao"
          />
          <ActionFieldError field="handoverName" />
        </div>

        <div className="form-field">
          <FieldLabel htmlFor="makeupDate" optional>
            Đề xuất ngày làm bù
          </FieldLabel>
          <input id="makeupDate" className="field-control" name="makeupDate" type="date" />
          <ActionFieldError field="makeupDate" />
        </div>

        <label className="commitment">
          <input name="committed" type="checkbox" />
          <span>
            Tôi cam kết việc nghỉ phép không ảnh hưởng đến công việc tôi đang phụ trách và đã bàn
            giao đầy đủ.
          </span>
        </label>
        <ActionFieldError field="committed" />
      </FormSection>
    </>
  );
}
