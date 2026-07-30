-- Foundation for the leave & gate-pass system (PRD sections V, VIII, X, XIII, XIV).
--
-- Design decisions worth knowing before reading:
--
--  * Three zones, three ways in (PRD III). Only the admin zone has Supabase auth
--    sessions, so it is the only zone with row-level SELECT policies. The public
--    zone and the guard booth reach the data through SECURITY DEFINER functions
--    added in later migrations — never through table policies. `anon` therefore
--    gets no direct table access at all: publishing a public form must not
--    publish the staff directory with it.
--
--  * Nothing is ever deleted (PRD rule 18). Withdrawals and cancellations move a
--    status and record who and when.
--
--  * `lg_request.version` is the guard against two approvers deciding the same
--    request (PRD rule 8). Every state change bumps it; the decision functions
--    match on the version the approver was looking at.

create extension if not exists pgcrypto;

-- ============================================================ enums

create type lg_app_role as enum ('approver', 'cnb', 'supervisor');
create type lg_request_kind as enum ('leave', 'gate');
create type lg_request_status as enum ('pending', 'claimed', 'approved', 'rejected', 'withdrawn');
create type lg_half_day as enum ('morning', 'afternoon');
create type lg_leave_reason as enum (
  'unpaid', 'annual', 'sick', 'marriage', 'maternity', 'bereavement', 'special', 'other'
);
create type lg_gate_reason as enum ('business_trip', 'leave', 'other');
create type lg_actual_in_source as enum ('booth', 'employee', 'cnb');

-- ============================================================ people

-- Who holds a role in the admin zone. Assigned by HR, not by the Directory sync,
-- because being a manager in Workspace does not make someone an approver here.
create table lg_app_user (
  email       text primary key check (email = lower(email)),
  role        lg_app_role not null,
  full_name   text,
  -- A supervisor may only file for this department (PRD rule 6).
  department  text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  constraint lg_app_user_supervisor_needs_department
    check (role <> 'supervisor' or department is not null)
);

-- Master data, synced one way from Google Workspace Directory (PRD XIV).
-- `code` is the employee code the public form checks names against. It does not
-- come from the Directory, which is why it is nullable here: an employee without
-- a code cannot file yet, and the sync must not invent one.
create table lg_employee (
  id            uuid primary key default gen_random_uuid(),
  code          text unique,
  full_name     text not null,
  email         text unique,
  title         text,
  department    text,
  active        boolean not null default true,
  directory_id  text unique,
  synced_at     timestamptz,
  created_at    timestamptz not null default now()
);

create index lg_employee_active_name_idx on lg_employee (active, full_name);
create index lg_employee_department_idx on lg_employee (department) where active;
create index lg_employee_code_idx on lg_employee (code) where code is not null;

-- One row per guard booth. The PIN is stored as a crypt() hash, never in clear.
create table lg_booth (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  pin_hash    text not null,
  active      boolean not null default true,
  updated_at  timestamptz not null default now(),
  updated_by  text
);

-- ============================================================ requests

create table lg_request (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null unique,
  kind               lg_request_kind not null,
  status             lg_request_status not null default 'pending',
  employee_id        uuid not null references lg_employee (id),
  -- Name, title and department as they were when filed. A later transfer must
  -- not move hours between departments in a closed period (PRD XIV).
  employee_snapshot  jsonb not null,
  -- Set when a supervisor files on behalf of a worker (PRD rule 6).
  filed_by_email     text,
  -- 32 hex characters. Half of the public zone's read authorisation.
  lookup_token       text not null unique check (lookup_token ~ '^[0-9a-f]{32}$'),
  submitted_at       timestamptz not null default now(),
  version            integer not null default 0,
  claimed_by_email   text,
  claimed_at         timestamptz,
  decided_by_email   text,
  decided_at         timestamptz,
  decision_note      text,
  withdrawn_at       timestamptz,
  withdraw_reason    text,
  -- 0, 1 or 2 — how many SLA nudges have gone out (PRD VII).
  reminders_sent     smallint not null default 0 check (reminders_sent between 0 and 2),
  -- What lib/domain/workhours.ts computed. Locked; never edited (PRD rule 17).
  computed_minutes   integer not null default 0 check (computed_minutes >= 0),
  constraint lg_request_claim_pair
    check ((claimed_by_email is null) = (claimed_at is null)),
  constraint lg_request_decision_pair
    check ((decided_by_email is null) = (decided_at is null)),
  constraint lg_request_decided_has_status
    check (decided_at is null or status in ('approved', 'rejected')),
  constraint lg_request_withdrawn_has_time
    check ((status = 'withdrawn') = (withdrawn_at is not null))
);

create index lg_request_queue_idx on lg_request (status, submitted_at);
create index lg_request_employee_idx on lg_request (employee_id, submitted_at desc);
create index lg_request_claimed_idx on lg_request (claimed_by_email, claimed_at)
  where status = 'claimed';
create index lg_request_decided_idx on lg_request (decided_by_email, decided_at desc);

create table lg_leave_detail (
  request_id            uuid primary key references lg_request (id),
  from_date             date not null,
  to_date               date not null,
  half_day              lg_half_day,
  reason                lg_leave_reason not null,
  reason_text           text,
  note                  text not null,
  handover_employee_id  uuid references lg_employee (id),
  makeup_date           date,
  constraint lg_leave_range check (to_date >= from_date),
  constraint lg_leave_half_day_single_date check (half_day is null or from_date = to_date),
  constraint lg_leave_reason_text_present
    check (reason not in ('special', 'other') or coalesce(reason_text, '') <> '')
);

create table lg_gate_detail (
  request_id         uuid primary key references lg_request (id),
  reason             lg_gate_reason not null,
  reason_text        text,
  note               text not null,
  out_at             timestamptz not null,
  expected_in_at     timestamptz not null,
  -- The time actually used for payroll, and where it came from. A booth stamp
  -- beats what the employee typed (PRD rule 13).
  actual_in_at       timestamptz,
  actual_in_source   lg_actual_in_source,
  drift_minutes      integer,
  drift_reason       text,
  -- Raw booth stamps, kept separate from the payroll figure above.
  booth_out_at       timestamptz,
  booth_in_at        timestamptz,
  booth_id           uuid references lg_booth (id),
  constraint lg_gate_order check (expected_in_at > out_at),
  constraint lg_gate_actual_pair check ((actual_in_at is null) = (actual_in_source is null)),
  constraint lg_gate_booth_order check (booth_in_at is null or booth_out_at is not null),
  constraint lg_gate_reason_text_present
    check (reason <> 'other' or coalesce(reason_text, '') <> '')
);

-- ============================================================ payroll

create table lg_timesheet (
  request_id        uuid primary key references lg_request (id),
  -- Copied from lg_request.computed_minutes when the request is approved.
  computed_minutes  integer not null check (computed_minutes >= 0),
  -- What payroll uses. Changing it away from computed_minutes needs a reason.
  final_minutes     integer not null check (final_minutes >= 0),
  marked_at         timestamptz,
  marked_by_email   text,
  constraint lg_timesheet_mark_pair check ((marked_at is null) = (marked_by_email is null))
);

create index lg_timesheet_unmarked_idx on lg_timesheet (marked_at) where marked_at is null;

-- Every edit of the final hours, with its reason (PRD rule 16). Append-only.
create table lg_hours_adjustment (
  id           bigint generated always as identity primary key,
  request_id   uuid not null references lg_request (id),
  old_minutes  integer not null,
  new_minutes  integer not null,
  reason       text not null check (length(btrim(reason)) >= 10),
  changed_by   text not null,
  changed_at   timestamptz not null default now()
);

create index lg_hours_adjustment_request_idx on lg_hours_adjustment (request_id, changed_at desc);

-- ============================================================ audit

create table lg_audit (
  id          bigint generated always as identity primary key,
  entity      text not null,
  entity_id   text not null,
  action      text not null,
  -- Email for the admin zone, 'booth:<name>' at the gate, 'public' on the form.
  actor       text not null,
  at          timestamptz not null default now(),
  detail      jsonb not null default '{}'::jsonb
);

create index lg_audit_entity_idx on lg_audit (entity, entity_id, at desc);

-- ============================================================ request codes

-- One counter per prefix and month, so codes read NP-2607-0148 with no gaps and
-- no duplicates even when two people submit in the same second.
create table lg_request_sequence (
  prefix  text not null,
  period  text not null,
  next    integer not null default 1,
  primary key (prefix, period)
);

create function lg_next_request_sequence(p_prefix text, p_period text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next integer;
begin
  -- The row always ends up holding the *next* free number, so the number just
  -- taken is one less — true both for the first insert and for every bump after.
  insert into lg_request_sequence (prefix, period, next)
  values (p_prefix, p_period, 2)
  on conflict (prefix, period)
    do update set next = lg_request_sequence.next + 1
  returning next - 1
  into v_next;
  return v_next;
end;
$$;

comment on function lg_next_request_sequence(text, text) is
  'Next sequence number for a request code, unique per prefix and YYMM period.';

-- ============================================================ version guard

create function lg_bump_version()
returns trigger
language plpgsql
as $$
begin
  new.version := old.version + 1;
  return new;
end;
$$;

create trigger lg_request_bump_version
  before update on lg_request
  for each row
  when (
    old.status is distinct from new.status
    or old.claimed_by_email is distinct from new.claimed_by_email
    or old.decided_by_email is distinct from new.decided_by_email
  )
  execute function lg_bump_version();

-- ============================================================ role helpers

-- The signed-in person's role, or null. Used by every policy below.
create function lg_current_role()
returns lg_app_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from lg_app_user
  where email = lower(coalesce(auth.jwt() ->> 'email', ''))
    and active;
$$;

create function lg_current_department()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select department
  from lg_app_user
  where email = lower(coalesce(auth.jwt() ->> 'email', ''))
    and active;
$$;

-- ============================================================ RLS

alter table lg_app_user enable row level security;
alter table lg_employee enable row level security;
alter table lg_booth enable row level security;
alter table lg_request enable row level security;
alter table lg_leave_detail enable row level security;
alter table lg_gate_detail enable row level security;
alter table lg_timesheet enable row level security;
alter table lg_hours_adjustment enable row level security;
alter table lg_audit enable row level security;
alter table lg_request_sequence enable row level security;

-- No policy is the same as "deny", and that is the intended state for `anon` on
-- every table. The public form and the guard booth get their access through
-- SECURITY DEFINER functions, which can enforce the employee code, the booth PIN
-- and rate limits — a table policy cannot.

create policy lg_app_user_read on lg_app_user
  for select to authenticated
  using (lg_current_role() is not null);

create policy lg_employee_read on lg_employee
  for select to authenticated
  using (lg_current_role() is not null);

-- Approvers and C&B see every request; a supervisor sees only what they filed.
create policy lg_request_read on lg_request
  for select to authenticated
  using (
    lg_current_role() in ('approver', 'cnb')
    or (
      lg_current_role() = 'supervisor'
      and filed_by_email = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );

create policy lg_leave_detail_read on lg_leave_detail
  for select to authenticated
  using (exists (select 1 from lg_request r where r.id = request_id));

create policy lg_gate_detail_read on lg_gate_detail
  for select to authenticated
  using (exists (select 1 from lg_request r where r.id = request_id));

create policy lg_timesheet_read on lg_timesheet
  for select to authenticated
  using (lg_current_role() in ('approver', 'cnb'));

create policy lg_hours_adjustment_read on lg_hours_adjustment
  for select to authenticated
  using (lg_current_role() in ('approver', 'cnb'));

create policy lg_audit_read on lg_audit
  for select to authenticated
  using (lg_current_role() = 'cnb');

-- The booth list is administrative; the PIN hash is never selectable by a role
-- that could brute-force it offline.
create policy lg_booth_read on lg_booth
  for select to authenticated
  using (lg_current_role() = 'cnb');

-- Writes are deliberately absent. Every state change lands through a function in
-- a later migration, so the rules in PRD section XIII live in one place.
