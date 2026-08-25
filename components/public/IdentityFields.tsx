"use client";

import FieldLabel from "./FieldLabel";
import { ActionFieldError } from "./SubmitForm";

/**
 * Who is filing, as typed.
 *
 * This was a picker that searched the staff list over Supabase and returned an
 * id. The board asked on 2026-08-25 for people to type their own name instead
 * (CLAUDE.md section 6 records what that gave up). Two consequences worth
 * knowing when editing this file:
 *
 * - Name, title and department are all required, because all three are printed
 *   on the paper form and an approver reads them together. They used to arrive
 *   free with the staff row; now they are three things to type, which is why
 *   they sit on one block of their own at the top rather than scattered.
 * - Nothing here queries anything, so the public form no longer needs a
 *   database client in the browser at all.
 */
export default function IdentityFields() {
  return (
    <>
      <div className="form-field">
        <FieldLabel htmlFor="employeeName">Họ và tên</FieldLabel>
        <input
          id="employeeName"
          className="field-control"
          name="employeeName"
          type="text"
          maxLength={100}
          autoComplete="name"
          autoCapitalize="words"
          placeholder="Ví dụ: Tạ Quốc Việt"
        />
        <ActionFieldError field="employeeName" />
      </div>

      <div className="form-grid">
        <div className="form-field">
          <FieldLabel htmlFor="employeeTitle">Chức vụ</FieldLabel>
          <input
            id="employeeTitle"
            className="field-control"
            name="employeeTitle"
            type="text"
            maxLength={100}
            placeholder="Ví dụ: Công nhân"
          />
          <ActionFieldError field="employeeTitle" />
        </div>
        <div className="form-field">
          <FieldLabel htmlFor="employeeDepartment">Phòng ban</FieldLabel>
          <input
            id="employeeDepartment"
            className="field-control"
            name="employeeDepartment"
            type="text"
            maxLength={100}
            placeholder="Ví dụ: Sản xuất"
          />
          <ActionFieldError field="employeeDepartment" />
        </div>
      </div>
    </>
  );
}
