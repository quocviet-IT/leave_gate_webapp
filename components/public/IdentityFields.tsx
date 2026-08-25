"use client";

import { ActionFieldError } from "./SubmitForm";

/**
 * Who is filing, as typed.
 *
 * This was a picker that searched the staff list over Supabase and returned an
 * id. The board asked on 2026-08-25 for people to type their own name instead
 * (CLAUDE.md section 6 records what that gave up). Two consequences worth
 * knowing when editing this file:
 *
 * - The department is asked for because it no longer arrives free with the
 *   staff row, and an approver needs to know which workshop a request is from.
 * - Nothing here queries anything, so the public form no longer needs a
 *   database client in the browser at all.
 */
export default function IdentityFields() {
  return (
    <>
      <div className="form-field">
        <label htmlFor="employeeName">Họ và tên</label>
        <input
          id="employeeName"
          className="field-control"
          name="employeeName"
          type="text"
          maxLength={100}
          autoComplete="name"
          placeholder="Ví dụ: Tạ Quốc Việt"
        />
        <ActionFieldError field="employeeName" />
      </div>

      <div className="form-grid">
        <div className="form-field">
          <label htmlFor="employeeDepartment">Bộ phận / Xưởng</label>
          <input
            id="employeeDepartment"
            className="field-control"
            name="employeeDepartment"
            type="text"
            maxLength={100}
            placeholder="Ví dụ: Xưởng A"
          />
          <ActionFieldError field="employeeDepartment" />
        </div>
        <div className="form-field">
          <label htmlFor="employeeTitle">Chức vụ</label>
          <input
            id="employeeTitle"
            className="field-control"
            name="employeeTitle"
            type="text"
            maxLength={100}
            placeholder="Không bắt buộc"
          />
          <ActionFieldError field="employeeTitle" />
        </div>
      </div>
    </>
  );
}
