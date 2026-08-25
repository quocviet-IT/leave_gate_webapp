"use client";

import { LEAVE_REASON_OPTIONS } from "@/lib/domain/reasons";
import NamePicker from "./NamePicker";
import ReasonField from "./ReasonField";
import { ActionFieldError } from "./SubmitForm";

/**
 * Everything a leave application asks for — PRD section X. What used to be
 * spread over two screens is one block: the dates and the reason, then the
 * handover the approver needs before saying yes.
 */
export default function LeaveFields({
  reason,
  onReasonChange,
}: {
  reason: string;
  onReasonChange: (reason: string) => void;
}) {
  return (
    <>
      <div className="form-grid">
        <div className="form-field">
          <label htmlFor="fromDate">Nghỉ từ ngày</label>
          <input id="fromDate" className="field-control" name="fromDate" type="date" />
          <ActionFieldError field="fromDate" />
        </div>
        <div className="form-field">
          <label htmlFor="toDate">Đến hết ngày</label>
          <input id="toDate" className="field-control" name="toDate" type="date" />
          <ActionFieldError field="toDate" />
        </div>
      </div>

      <div className="form-field">
        <label htmlFor="halfDay">Thời lượng</label>
        <select id="halfDay" className="field-control" name="halfDay">
          <option value="">Cả ngày</option>
          <option value="morning">Nửa ngày buổi sáng</option>
          <option value="afternoon">Nửa ngày buổi chiều</option>
        </select>
        <span className="field-help">
          Nửa ngày chỉ chọn được khi ngày bắt đầu và kết thúc giống nhau.
        </span>
        <ActionFieldError field="halfDay" />
      </div>

      <ReasonField
        kind="leave"
        label="Lý do nghỉ"
        options={LEAVE_REASON_OPTIONS}
        value={reason}
        onChange={onReasonChange}
      />

      <div className="form-field">
        <label htmlFor="note">Diễn giải</label>
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

      <NamePicker fieldName="handoverEmployeeId" label="Bàn giao công việc cho" />
      <ActionFieldError field="handoverEmployeeId" />

      <div className="form-field">
        <label htmlFor="makeupDate">Đề xuất ngày làm bù</label>
        <input id="makeupDate" className="field-control" name="makeupDate" type="date" />
        <span className="field-help">Không bắt buộc.</span>
        <ActionFieldError field="makeupDate" />
      </div>

      <label className="commitment">
        <input name="committed" type="checkbox" />
        <span>
          Tôi cam kết việc nghỉ phép không ảnh hưởng đến công việc tôi đang phụ trách và đã bàn
          giao đầy đủ cho người được chọn ở trên.
        </span>
      </label>
      <ActionFieldError field="committed" />
    </>
  );
}
