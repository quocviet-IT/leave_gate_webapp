-- Supervisors filing on behalf, and the overview figures — PRD sections V,
-- XII and rule 6.
--
-- A supervisor files for the workers in their own department and nobody else's.
-- The department belongs on the account rather than on the request, so it is
-- added to lg_app_user here; HR has not named the supervisors yet (0002 says
-- so), which is why nothing is seeded.
--
-- Filing on behalf reuses lg_submit_request rather than repeating it. The rate
-- limits it applies are per employee and per device, and both still make sense
-- for a supervisor working through a stack of paper slips: the device is the
-- supervisor's machine, so a burst still slows down, and the five-a-day cap
-- still belongs to the worker the request is about.

alter table lg_app_user add column if not exists department text;

comment on column lg_app_user.department is
  'Which department a supervisor may file for. Null for approvers and C&B.';

create function lg_submit_on_behalf(
  p_employee_id      uuid,
  p_kind             lg_request_kind,
  p_detail           jsonb,
  p_computed_minutes int,
  p_device_hash      text,
  p_filed_by_email   text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $fn$
declare
  v_email      text := lower(btrim(coalesce(p_filed_by_email, '')));
  v_supervisor lg_app_user;
  v_employee   lg_employee;
  v_filed      jsonb;
begin
  select * into v_supervisor
  from lg_app_user
  where email = v_email and role = 'supervisor' and active;
  if not found then
    raise exception 'Chỉ quản xưởng mới gửi đơn hộ được';
  end if;

  select * into v_employee from lg_employee where id = p_employee_id;
  if not found or not v_employee.active then
    raise exception 'Không tìm thấy người này trong danh sách nhân sự';
  end if;

  -- Rule 6: their own department, nobody else's. A supervisor with no
  -- department on their account can file for nobody — better than for everybody.
  if coalesce(v_supervisor.department, '') = ''
     or lower(btrim(coalesce(v_employee.department, ''))) <> lower(btrim(v_supervisor.department))
  then
    raise exception 'Chỉ gửi hộ được cho người trong xưởng của mình';
  end if;

  v_filed := lg_submit_request(p_employee_id, p_kind, p_detail, p_computed_minutes, p_device_hash);

  update lg_request set filed_by_email = v_email where code = v_filed ->> 'code';

  insert into lg_audit (entity, entity_id, action, actor, detail)
  values ('lg_request',
          (select id::text from lg_request where code = v_filed ->> 'code'),
          'submit_on_behalf', v_email,
          jsonb_build_object('code', v_filed ->> 'code', 'employee', v_employee.full_name));

  return v_filed;
end;
$fn$;

comment on function lg_submit_on_behalf(uuid, lg_request_kind, jsonb, int, text, text) is
  'Files a request for a worker in the supervisor''s own department. service_role only.';

revoke all on function lg_submit_on_behalf(uuid, lg_request_kind, jsonb, int, text, text) from public;
grant execute on function lg_submit_on_behalf(uuid, lg_request_kind, jsonb, int, text, text)
  to service_role;

-- The workers a given supervisor may file for. Returns no employee number:
-- that is the staff import's row key and never reaches a browser.
create function lg_supervisor_employees(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_department text;
begin
  select department into v_department
  from lg_app_user
  where email = lower(btrim(coalesce(p_email, ''))) and role = 'supervisor' and active;

  if v_department is null or btrim(v_department) = '' then
    return '[]'::jsonb;
  end if;

  return coalesce(
    (select jsonb_agg(jsonb_build_object(
              'id', e.id,
              'fullName', e.full_name,
              'title', e.title,
              'department', e.department
            ) order by e.full_name)
     from lg_employee e
     where e.active
       and lower(btrim(coalesce(e.department, ''))) = lower(btrim(v_department))),
    '[]'::jsonb
  );
end;
$fn$;

revoke all on function lg_supervisor_employees(text) from public;
grant execute on function lg_supervisor_employees(text) to service_role;

-- The overview strip. One round trip rather than four, and the same numbers
-- every screen quotes.
create function lg_overview(p_from date, p_to date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $fn$
  select jsonb_build_object(
    'pending', (select count(*) from lg_request where status in ('pending', 'claimed')),
    'unclaimed', (select count(*) from lg_request where status = 'pending'),
    'leaveMinutes', coalesce((
      select sum(t.final_minutes)
      from lg_timesheet t
      join lg_request r on r.id = t.request_id
      join lg_leave_detail l on l.request_id = r.id
      where l.from_date between p_from and p_to
    ), 0),
    'gateMinutes', coalesce((
      select sum(t.final_minutes)
      from lg_timesheet t
      join lg_request r on r.id = t.request_id
      join lg_gate_detail g on g.request_id = r.id
      where (g.out_at at time zone 'Asia/Ho_Chi_Minh')::date between p_from and p_to
    ), 0),
    'unmarked', (select count(*) from lg_timesheet where marked_at is null),
    'gatePassesToday', (
      select count(*)
      from lg_request r
      join lg_gate_detail g on g.request_id = r.id
      where r.status = 'approved'
        and (g.out_at at time zone 'Asia/Ho_Chi_Minh')::date
            = (now() at time zone 'Asia/Ho_Chi_Minh')::date
    ),
    'awaitingGateReturn', (
      select count(*)
      from lg_request r
      join lg_gate_detail g on g.request_id = r.id
      where r.status = 'approved'
        and g.booth_out_at is not null
        and g.booth_in_at is null
    )
  );
$fn$;

comment on function lg_overview(date, date) is
  'Counts for the admin overview. Carries no name and no reason.';

revoke all on function lg_overview(date, date) from public;
grant execute on function lg_overview(date, date) to service_role;
