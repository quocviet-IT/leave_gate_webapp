-- Filing from the public form (PRD sections III and X, rules 1, 3 and 18).
--
-- Granted to service_role only. The anon key ships to the browser, so any
-- function anon may execute is callable directly with hand-made arguments — which
-- would let someone file with computed_minutes of their choosing. The Server
-- Action is the only caller, and it computes the hours with
-- lib/domain/workhours.ts so that rule lives in exactly one place.
--
-- What stays in SQL is what must be atomic under concurrency: the per-month code
-- sequence and the two rate limits.
--
-- search_path includes `extensions` because Supabase installs pgcrypto there, and
-- the token comes from gen_random_bytes().

create table lg_submit_attempt (
  id           bigint generated always as identity primary key,
  employee_id  uuid not null references lg_employee (id),
  -- Coarse throttle key: a hash of address, user agent and the day. Not identity,
  -- and deliberately not reversible.
  device_hash  text not null,
  at           timestamptz not null default now()
);

create index lg_submit_attempt_employee_idx on lg_submit_attempt (employee_id, at desc);
create index lg_submit_attempt_device_idx on lg_submit_attempt (device_hash, at desc);

alter table lg_submit_attempt enable row level security;

create function lg_submit_request(
  p_employee_id      uuid,
  p_kind             lg_request_kind,
  p_detail           jsonb,
  p_computed_minutes int,
  p_device_hash      text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_employee   lg_employee;
  v_code       text;
  v_token      text;
  v_sequence   int;
  v_period     text;
  v_prefix     text;
  v_request_id uuid;
  v_today      date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  select * into v_employee from lg_employee where id = p_employee_id;
  if not found or not v_employee.active then
    raise exception 'Không tìm thấy người này trong danh sách nhân sự';
  end if;

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

  -- Five per employee per day, counted in company time.
  if (
    select count(*) from lg_submit_attempt
    where employee_id = p_employee_id
      and (at at time zone 'Asia/Ho_Chi_Minh')::date = v_today
  ) >= 5 then
    raise exception 'Mỗi người gửi tối đa 5 đơn một ngày';
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
      'full_name', v_employee.full_name,
      'title', v_employee.title,
      'department', v_employee.department,
      'code', v_employee.code
    ),
    v_token, p_computed_minutes
  )
  returning id into v_request_id;

  if p_kind = 'leave' then
    insert into lg_leave_detail (
      request_id, from_date, to_date, half_day, reason, reason_text, note,
      handover_employee_id, makeup_date
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

  insert into lg_submit_attempt (employee_id, device_hash) values (p_employee_id, p_device_hash);

  insert into lg_audit (entity, entity_id, action, actor, detail)
  values ('lg_request', v_request_id::text, 'submit', 'public',
          jsonb_build_object('code', v_code, 'kind', p_kind, 'device', p_device_hash));

  return jsonb_build_object('code', v_code, 'token', v_token);
end;
$$;

comment on function lg_submit_request(uuid, lg_request_kind, jsonb, int, text) is
  'Files a request from the public form. service_role only — never grant to anon.';

revoke all on function lg_submit_request(uuid, lg_request_kind, jsonb, int, text) from public;
grant execute on function lg_submit_request(uuid, lg_request_kind, jsonb, int, text) to service_role;

-- Quoting a request code proves nothing, so this answers with a status and
-- nothing else: no name, no dates, no reason (rule 1).
create function lg_status_by_code(p_code text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select status::text from lg_request where code = upper(btrim(coalesce(p_code, '')));
$$;

comment on function lg_status_by_code(text) is
  'Status of a request by its printed code. Reveals nothing else, by design.';

revoke all on function lg_status_by_code(text) from public;
grant execute on function lg_status_by_code(text) to anon, authenticated, service_role;
