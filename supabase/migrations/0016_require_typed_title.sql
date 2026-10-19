-- A typed request must carry a job title as well as a name and a department.
--
-- All three are printed on the paper form and an approver reads them together:
-- a name alone does not identify one person among several hundred. 0015 asked
-- for two of the three; this asks for the third, and the app schema asks for it
-- at the same time.
--
-- The check stays inside the typed branch. A supervisor filing on behalf passes
-- an id, and the title then comes from the staff row — which may legitimately
-- have none, so requiring one there would break filing for those people.
--
-- Only the validation block changes; the rest is 0015's function verbatim.

create or replace function lg_submit_request(
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
  -- guarantee the public one gave up: the name, department and title come from
  -- the staff row, so nothing typed is even consulted.
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

    if length(coalesce(v_title, '')) < 2 or length(v_title) > 100 then
      raise exception 'Ghi chức vụ của bạn';
    end if;

    if length(v_department) < 2 or length(v_department) > 100 then
      raise exception 'Ghi phòng ban của bạn';
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

revoke all on function lg_submit_request(text, text, text, lg_request_kind, jsonb, int, text, uuid) from public;
grant execute on function lg_submit_request(text, text, text, lg_request_kind, jsonb, int, text, uuid) to service_role;
