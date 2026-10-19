-- The SLA reminder run — PRD sections VI and VII.
--
-- The clock itself is not here. "One working hour" and "two working hours" are
-- computed by lib/domain/sla.ts, which knows that Saturday is a working day and
-- Sunday is not; putting that arithmetic in SQL as well would give one rule two
-- homes (CLAUDE.md section 3). What the database owns is the bookkeeping: which
-- requests are still waiting, and how many nudges each has already had.
--
-- lg_request.reminders_sent is bumped inside the same statement that reads it,
-- so two overlapping runs of the job cannot both send stage 1.

create function lg_requests_awaiting_decision()
returns jsonb
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(
    jsonb_agg(jsonb_build_object(
      'id', r.id,
      'code', r.code,
      'kind', r.kind,
      'submittedAt', r.submitted_at,
      'remindersSent', r.reminders_sent,
      'fullName', r.employee_snapshot ->> 'full_name',
      'department', r.employee_snapshot ->> 'department',
      'computedMinutes', r.computed_minutes,
      'fromDate', l.from_date,
      'toDate', l.to_date,
      'outAt', g.out_at,
      'expectedInAt', g.expected_in_at
    ) order by r.submitted_at),
    '[]'::jsonb
  )
  from lg_request r
  left join lg_leave_detail l on l.request_id = r.id
  left join lg_gate_detail g on g.request_id = r.id
  -- A claim stops the clock (PRD section VII), so only unclaimed requests are
  -- candidates for a nudge.
  where r.status = 'pending';
$fn$;

comment on function lg_requests_awaiting_decision() is
  'Unclaimed requests and how many SLA nudges each has had. service_role only.';

revoke all on function lg_requests_awaiting_decision() from public;
grant execute on function lg_requests_awaiting_decision() to service_role;

-- Claims the right to send stage `p_stage`, or returns false because somebody
-- already did. The comparison and the write are one statement on purpose: two
-- overlapping cron runs must not both post the same nudge.
create function lg_claim_reminder(p_request_id uuid, p_stage smallint)
returns boolean
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_updated int;
begin
  if p_stage not in (1, 2) then
    raise exception 'Chỉ có hai mốc nhắc';
  end if;

  update lg_request
  set reminders_sent = p_stage
  where id = p_request_id
    and status = 'pending'
    and reminders_sent < p_stage;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    return false;
  end if;

  insert into lg_audit (entity, entity_id, action, actor, detail)
  values ('lg_request', p_request_id::text, 'sla_reminder', 'system',
          jsonb_build_object('stage', p_stage));
  return true;
end;
$fn$;

comment on function lg_claim_reminder(uuid, smallint) is
  'Takes the right to send one SLA nudge, exactly once. service_role only.';

revoke all on function lg_claim_reminder(uuid, smallint) from public;
grant execute on function lg_claim_reminder(uuid, smallint) to service_role;

-- The approvers, for the message that names all four.
create function lg_approver_names()
returns jsonb
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(jsonb_agg(coalesce(full_name, email) order by full_name), '[]'::jsonb)
  from lg_app_user
  where role = 'approver' and active;
$fn$;

revoke all on function lg_approver_names() from public;
grant execute on function lg_approver_names() to service_role;
