/** Shapes shared between the database and the app. Keep in step with `supabase/migrations`. */

/**
 * The admin-zone roles. `supervisor` was removed on 2026-08-25; the value
 * survives in the `lg_app_role` enum only because Postgres cannot drop one, and
 * a check constraint keeps it out of `lg_app_user`.
 */
export type AppRole = "approver" | "cnb";

export type RequestKind = "leave" | "gate";

/**
 * `pending` → `claimed` → `approved` | `rejected`, or `withdrawn` from either of
 * the first two. Cancelling an approved request also lands on `withdrawn`, with
 * the reason recorded — PRD sections VI and XIII.
 */
export type RequestStatus = "pending" | "claimed" | "approved" | "rejected" | "withdrawn";

export type ActualInSource = "booth" | "employee" | "cnb";

export type Employee = {
  id: string;
  code: string | null;
  full_name: string;
  email: string | null;
  title: string | null;
  department: string | null;
  active: boolean;
  synced_at: string | null;
};

export type RequestRow = {
  id: string;
  code: string;
  kind: RequestKind;
  status: RequestStatus;
  employee_id: string;
  /** Name, title and department as they were when the request was filed. */
  employee_snapshot: {
    full_name: string;
    title: string | null;
    department: string | null;
    code: string | null;
  };
  filed_by_email: string | null;
  submitted_at: string;
  /** Bumped on every state change; the guard against two approvals (rule 8). */
  version: number;
  claimed_by_email: string | null;
  claimed_at: string | null;
  decided_by_email: string | null;
  decided_at: string | null;
  decision_note: string | null;
  withdrawn_at: string | null;
  withdraw_reason: string | null;
  reminders_sent: number;
  computed_minutes: number;
};

export type LeaveDetail = {
  request_id: string;
  from_date: string;
  to_date: string;
  half_day: "morning" | "afternoon" | null;
  reason: string;
  reason_text: string | null;
  note: string;
  handover_employee_id: string | null;
  makeup_date: string | null;
};

export type GateDetail = {
  request_id: string;
  reason: string;
  reason_text: string | null;
  note: string;
  out_at: string;
  expected_in_at: string;
  actual_in_at: string | null;
  actual_in_source: ActualInSource | null;
  drift_minutes: number | null;
  drift_reason: string | null;
  booth_out_at: string | null;
  booth_in_at: string | null;
  booth_id: string | null;
};

export type Timesheet = {
  request_id: string;
  /** What `lib/domain/workhours.ts` computed. Never edited. */
  computed_minutes: number;
  /** What payroll uses. Editing it requires a reason. */
  final_minutes: number;
  marked_at: string | null;
  marked_by_email: string | null;
};
