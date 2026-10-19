-- The public form lets a person type their own name instead of choosing it from
-- the staff list. Asked for by the board on 2026-08-25, over the objection
-- recorded in CLAUDE.md section 6: "names only from the staff list" was one of
-- the shipped mitigations for filing under somebody else's name, and this
-- removes it. What follows is the rest of that decision, made explicit.
--
-- Three things were keyed on the employee id and are re-keyed here:
--   1. lg_request.employee_id and lg_submit_attempt.employee_id become nullable.
--   2. The five-a-day limit counted rows per employee id. It now counts per
--      normalised name, and a per-device daily ceiling backs it up, because a
--      typed name is not an identity and costs nothing to vary.
--   3. Rule 9 -- an approver may not decide their own request -- read the
--      subject's email through the employee id. With no id it falls back to
--      matching the typed name against lg_app_user.full_name. This is weaker,
--      and deliberately so: an approver who types their name differently can
--      now decide their own request. Closing it needs an identity the public
--      form does not have.

-- 1. The request no longer has to point at a row in the staff list.
alter table lg_request        alter column employee_id drop not null;
alter table lg_submit_attempt alter column employee_id drop not null;

comment on column lg_request.employee_id is
  'The staff row this is about, when one was matched. Null when the person typed their name on the public form, and employee_snapshot is then the only record of who filed it.';

-- 2. The handover is a typed name too, or a leave application could not be
--    filed at all while the staff list is empty.
alter table lg_leave_detail add column if not exists handover_name text;

comment on column lg_leave_detail.handover_name is
  'Who the work was handed to, as typed. handover_employee_id is set instead when a supervisor filed and picked from their department list.';

-- 3. The throttle needs something to count, now that the employee id may be null.
alter table lg_submit_attempt add column if not exists name_key text;

comment on column lg_submit_attempt.name_key is
  'Lower-cased, space-collapsed name the request was filed under. The five-a-day limit counts these. Trivially varied on purpose: it is a speed bump, not a control.';

create index if not exists lg_submit_attempt_name_idx
  on lg_submit_attempt (name_key, at desc);

-- Normalising a typed name: case and runs of whitespace are not differences.
create or replace function lg_name_key(p_name text)
returns text
language sql
immutable
set search_path = public
as $fn$
  select lower(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'));
$fn$;

comment on function lg_name_key(text) is
  'A typed name reduced to what counts as the same name for the daily limit.';

revoke all on function lg_name_key(text) from public;
grant execute on function lg_name_key(text) to service_role;

-- The filing function takes a typed identity. The old signature is dropped
-- rather than overloaded: two ways to file is one too many.
drop function if exists lg_submit_request(uuid, lg_request_kind, jsonb, int, text);

create function lg_submit_request(
  p_employee_name       text,
  p_employee_department text,
  p_employee_title      text,
  p_kind                lg_request_kind,
  p_detail              jsonb,
  p_computed_minutes    int,
  p_device_hash         text,
  p_employee_id         uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $fn$
declare
  v_employee   lg_employee;
  v_name       text := btrim(coalesce(p_employee_name, ''));
  v_department text := btrim(coalesce(p_employee_department, ''));
  v_title      text := nullif(btrim(coalesce(p_employee_title, '')), '');
  v_name_key   text;
  v_code       text;
  v_token      text;
  v_sequence   int;
  v_period     text;
  v_prefix     text;
  v_request_id uuid;
  v_today      date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  -- A supervisor filing on behalf still passes an id, and that path keeps every
  -- guarantee the public one just gave up: the name, department and title come
  -- from the staff row, so nothing typed is even consulted. The typed fields are
  -- only validated when there is no row to read them from.
  if p_employee_id is not null then
    select * into v_employee from lg_employee where id = p_employee_id;
    if not found or not v_employee.active then
      raise exception 'Không tìm thấy người này trong danh sách nhân sự';
    end if;
    v_name       := v_employee.full_name;
    v_department := coalesce(nullif(v_employee.department, ''), v_department);
    v_title      := v_employee.title;
  else
    if length(v_name) < 2 or length(v_name) > 100 then
      raise exception 'Ghi họ và tên của bạn';
    end if;

    if length(v_department) < 2 or length(v_department) > 100 then
      raise exception 'Ghi bộ phận hoặc xưởng của bạn';
    end if;

    if length(coalesce(v_title, '')) > 100 then
      raise exception 'Chức vụ quá dài';
    end if;
  end if;

  v_name_key := lg_name_key(v_name);

  if p_computed_minutes < 0 or p_computed_minutes > 60 * 24 * 40 then
    raise exception 'Số phút không hợp lệ';
  end if;

  -- One filing per device per minute.
  if exists (
    select 1 from lg_submit_attempt
    where device_hash = p_device_hash and at > now() - interval '1 minute'
  ) then
    raise exception 'Bạn vừa gửi một đơn. Đợi một phút rồi gửi tiếp.';
  end if;

  -- Five a day for one name, counted in company time.
  if (
    select count(*) from lg_submit_attempt
    where name_key = v_name_key
      and (at at time zone 'Asia/Ho_Chi_Minh')::date = v_today
  ) >= 5 then
    raise exception 'Mỗi người gửi tối đa 5 đơn một ngày';
  end if;

  -- And a ceiling for one device, whatever names it types. Without this the
  -- five-a-day limit is one keystroke away from being no limit at all.
  if (
    select count(*) from lg_submit_attempt
    where device_hash = p_device_hash
      and (at at time zone 'Asia/Ho_Chi_Minh')::date = v_today
  ) >= 30 then
    raise exception 'Máy này đã gửi quá nhiều đơn hôm nay';
  end if;

  v_prefix := case p_kind when 'leave' then 'NP' else 'RC' end;
  v_period := to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYMM');
  v_sequence := lg_next_request_sequence(v_prefix, v_period);
  v_code := v_prefix || '-' || v_period || '-' || lpad(v_sequence::text, 4, '0');
  v_token := encode(gen_random_bytes(16), 'hex');

  insert into lg_request (
    code, kind, status, employee_id, employee_snapshot, lookup_token, computed_minutes
  )
  values (
    v_code, p_kind, 'pending', p_employee_id,
    jsonb_build_object(
      'full_name', v_name,
      'title', v_title,
      'department', v_department,
      'code', v_employee.code,
      'typed', p_employee_id is null
    ),
    v_token, p_computed_minutes
  )
  returning id into v_request_id;

  if p_kind = 'leave' then
    insert into lg_leave_detail (
      request_id, from_date, to_date, half_day, reason, reason_text, note,
      handover_employee_id, handover_name, makeup_date
    )
    values (
      v_request_id,
      (p_detail ->> 'fromDate')::date,
      (p_detail ->> 'toDate')::date,
      nullif(p_detail ->> 'halfDay', '')::lg_half_day,
      (p_detail ->> 'reason')::lg_leave_reason,
      nullif(p_detail ->> 'reasonText', ''),
      p_detail ->> 'note',
      nullif(p_detail ->> 'handoverEmployeeId', '')::uuid,
      nullif(btrim(coalesce(p_detail ->> 'handoverName', '')), ''),
      nullif(p_detail ->> 'makeupDate', '')::date
    );
  else
    insert into lg_gate_detail (
      request_id, reason, reason_text, note, out_at, expected_in_at
    )
    values (
      v_request_id,
      (p_detail ->> 'reason')::lg_gate_reason,
      nullif(p_detail ->> 'reasonText', ''),
      p_detail ->> 'note',
      (p_detail ->> 'outAt')::timestamptz,
      (p_detail ->> 'expectedInAt')::timestamptz
    );
  end if;

  insert into lg_submit_attempt (employee_id, name_key, device_hash)
  values (p_employee_id, v_name_key, p_device_hash);

  insert into lg_audit (entity, entity_id, action, actor, detail)
  values (
    'request', v_request_id, 'submit', 'public',
    jsonb_build_object('code', v_code, 'deviceHash', p_device_hash, 'typedName', p_employee_id is null)
  );

  return jsonb_build_object('code', v_code, 'token', v_token);
end;
$fn$;

comment on function lg_submit_request(text, text, text, lg_request_kind, jsonb, int, text, uuid) is
  'Files a request under a typed name, or under a staff row when an id is given. service_role only: the public form reaches it through a server action.';

revoke all on function lg_submit_request(text, text, text, lg_request_kind, jsonb, int, text, uuid) from public;
grant execute on function lg_submit_request(text, text, text, lg_request_kind, jsonb, int, text, uuid) to service_role;

-- Rule 9 has to work off the snapshot now, because there may be no employee row
-- behind the request. Comparing a typed name to an approver's own name is a
-- weaker test than comparing account emails, and it is the strongest one left.
create or replace function lg_request_is_own(p_request lg_request, p_email text)
returns boolean
language plpgsql
stable
set search_path = public
as $fn$
declare
  v_subject_email text;
  v_own_name      text;
begin
  if lower(coalesce(p_request.filed_by_email, '')) = lower(p_email) then
    return true;
  end if;

  if p_request.employee_id is not null then
    select lower(e.email) into v_subject_email
    from lg_employee e where e.id = p_request.employee_id;
    return v_subject_email = lower(p_email);
  end if;

  select lg_name_key(u.full_name) into v_own_name
  from lg_app_user u where u.email = lower(p_email);

  return v_own_name is not null
     and v_own_name <> ''
     and v_own_name = lg_name_key(p_request.employee_snapshot ->> 'full_name');
end;
$fn$;

comment on function lg_request_is_own(lg_request, text) is
  'Rule 9: whether this approver is the subject of the request, or filed it. Falls back to matching the typed name when there is no staff row to read an email from.';

revoke all on function lg_request_is_own(lg_request, text) from public;
grant execute on function lg_request_is_own(lg_request, text) to service_role;

-- lg_decide_request keeps its whole body; only the rule 9 test changes, from an
-- email comparison to the helper above, which still compares emails when there
-- is a staff row to read one from.
create or replace function lg_decide_request(
  p_request_id      uuid,
  p_version         integer,
  p_email           text,
  p_decision        lg_request_status,
  p_note            text default null,
  p_timeout_minutes int default 30
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_request lg_request;
  v_email   text := lower(btrim(coalesce(p_email, '')));
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception 'Quyết định phải là duyệt hoặc từ chối';
  end if;

  select * into v_request from lg_request where id = p_request_id for update;
  if not found then
    raise exception 'Không tìm thấy đơn';
  end if;

  if v_request.version <> p_version then
    raise exception '%', lg_stale_view_message(v_request);
  end if;

  if v_request.status not in ('pending', 'claimed') then
    raise exception '%', lg_stale_view_message(v_request);
  end if;

  -- Rule 9. The request is "yours" if it is about your account, or you filed it
  -- on somebody's behalf.
  if lg_request_is_own(v_request, v_email) then
    raise exception 'Không tự duyệt đơn của mình; ba người duyệt còn lại sẽ xử lý';
  end if;

  -- Deciding without claiming is allowed, but taking one off somebody who is
  -- actively holding it is not.
  if lg_claim_is_live(v_request.status, v_request.claimed_at, p_timeout_minutes)
     and lower(v_request.claimed_by_email) <> v_email then
    raise exception '%', lg_stale_view_message(v_request);
  end if;

  update lg_request
  set status = p_decision,
      decided_by_email = v_email,
      decided_at = now(),
      decision_note = nullif(btrim(coalesce(p_note, '')), ''),
      claimed_by_email = null,
      claimed_at = null
  where id = p_request_id;

  -- An approved request reaches the timesheet with its hours already computed
  -- (PRD section XI). A rejected one never does.
  if p_decision = 'approved' then
    insert into lg_timesheet (request_id, computed_minutes, final_minutes)
    values (p_request_id, v_request.computed_minutes, v_request.computed_minutes)
    on conflict (request_id) do nothing;
  end if;

  insert into lg_audit (entity, entity_id, action, actor, detail)
  values ('lg_request', p_request_id::text, 'decide', v_email,
          jsonb_build_object('code', v_request.code, 'decision', p_decision));

  return (select jsonb_build_object('code', code, 'version', version, 'status', status)
          from lg_request where id = p_request_id);
end;
$fn$;

comment on function lg_decide_request(uuid, integer, text, lg_request_status, text, int) is
  'One approval is enough; a stale version is refused. service_role only.';

revoke all on function lg_decide_request(uuid, integer, text, lg_request_status, text, int) from public;
grant execute on function lg_decide_request(uuid, integer, text, lg_request_status, text, int)
  to service_role;

-- Filing on behalf passes the staff id through, so this path is unchanged in
-- substance. Only the call it makes has a new shape.
create or replace function lg_submit_on_behalf(
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

  v_filed := lg_submit_request(
    v_employee.full_name,
    coalesce(v_employee.department, ''),
    v_employee.title,
    p_kind,
    p_detail,
    p_computed_minutes,
    p_device_hash,
    p_employee_id
  );

  update lg_request set filed_by_email = v_email where code = v_filed ->> 'code';

  insert into lg_audit (entity, entity_id, action, actor, detail)
  values ('lg_request',
          (select id::text from lg_request where code = v_filed ->> 'code'),
          'submit_on_behalf', v_email,
          jsonb_build_object('code', v_filed ->> 'code', 'employee', v_employee.full_name));

  return v_filed;
end;
$fn$;

revoke all on function lg_submit_on_behalf(uuid, lg_request_kind, jsonb, int, text, text) from public;
grant execute on function lg_submit_on_behalf(uuid, lg_request_kind, jsonb, int, text, text) to service_role;

-- The private link shows who the work was handed to. That name now comes from
-- the staff row when a supervisor picked one, and from what the employee typed
-- otherwise.
create or replace function lg_lookup_by_token(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_result jsonb;
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{32}$' then
    return null;
  end if;

  select jsonb_strip_nulls(
    jsonb_build_object(
      'id', r.id,
      'code', r.code,
      'kind', r.kind,
      'status', r.status,
      'employee', jsonb_build_object(
        'fullName', r.employee_snapshot ->> 'full_name',
        'title', r.employee_snapshot ->> 'title',
        'department', r.employee_snapshot ->> 'department'
      ),
      'submittedAt', r.submitted_at,
      'computedMinutes', r.computed_minutes,
      'claimedBy', coalesce(claimed_user.full_name, r.claimed_by_email),
      'claimedAt', r.claimed_at,
      'decidedBy', coalesce(decided_user.full_name, r.decided_by_email),
      'decidedAt', r.decided_at,
      'decisionNote', r.decision_note,
      'withdrawnAt', r.withdrawn_at,
      'withdrawReason', r.withdraw_reason,
      'detail',
        case r.kind
          when 'leave' then jsonb_strip_nulls(jsonb_build_object(
            'fromDate', l.from_date,
            'toDate', l.to_date,
            'halfDay', l.half_day,
            'reason', l.reason,
            'reasonText', l.reason_text,
            'note', l.note,
            'handoverName', coalesce(handover.full_name, l.handover_name),
            'makeupDate', l.makeup_date
          ))
          else jsonb_strip_nulls(jsonb_build_object(
            'reason', g.reason,
            'reasonText', g.reason_text,
            'note', g.note,
            'outAt', g.out_at,
            'expectedInAt', g.expected_in_at,
            'actualInAt', g.actual_in_at,
            'actualInSource', g.actual_in_source,
            'driftMinutes', g.drift_minutes,
            'driftReason', g.drift_reason,
            'boothOutAt', g.booth_out_at,
            'boothInAt', g.booth_in_at
          ))
        end
    )
  )
  into v_result
  from lg_request r
  left join lg_leave_detail l on l.request_id = r.id
  left join lg_gate_detail g on g.request_id = r.id
  left join lg_employee handover on handover.id = l.handover_employee_id
  left join lg_app_user claimed_user on claimed_user.email = r.claimed_by_email
  left join lg_app_user decided_user on decided_user.email = r.decided_by_email
  where r.lookup_token = p_token;

  return v_result;
end;
$fn$;

revoke all on function lg_lookup_by_token(text) from public;
grant execute on function lg_lookup_by_token(text) to service_role;
