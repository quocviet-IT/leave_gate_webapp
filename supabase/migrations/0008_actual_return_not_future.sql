-- An employee-declared return time may not sit in the future (PRD rule 15).
--
-- 0007 checked the deadline and the ordering against the exit, but nothing
-- bounded the value from above: a request filed before the deadline could carry
-- a return time years away and still be accepted, which then flows straight to
-- the timesheet as computed hours.
--
-- Five minutes of slack absorbs the gap between a phone's clock and the
-- server's. The deadline itself stays where CLAUDE.md section 3 puts it — the
-- caller computes it with lib/domain/workhours.ts, and this function only
-- enforces what it was handed. Working-time arithmetic lives in one place.

create or replace function lg_set_actual_return(
  p_token          text,
  p_actual_in_at   timestamptz,
  p_drift_minutes  integer,
  p_drift_reason   text,
  p_deadline       timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id uuid;
  v_code text;
  v_status lg_request_status;
  v_out_at timestamptz;
  v_actual_in_at timestamptz;
  v_actual_source lg_actual_in_source;
  v_booth_in_at timestamptz;
begin
  select r.id, r.code, r.status, g.out_at, g.actual_in_at, g.actual_in_source, g.booth_in_at
  into v_request_id, v_code, v_status, v_out_at, v_actual_in_at, v_actual_source, v_booth_in_at
  from lg_request r
  join lg_gate_detail g on g.request_id = r.id
  where r.lookup_token = lower(btrim(coalesce(p_token, '')))
  for update of r, g;

  if not found then
    raise exception 'Không tìm thấy giấy ra vào cổng từ đường dẫn này';
  end if;

  if v_status <> 'approved' then
    raise exception 'Chỉ nhập giờ vào lại cho đơn đã duyệt';
  end if;

  if p_deadline is null or now() > p_deadline then
    raise exception 'Đã hết hạn nhập giờ vào lại; liên hệ C&B để điều chỉnh';
  end if;

  if p_actual_in_at is null then
    raise exception 'Phải nhập giờ vào lại thực tế';
  end if;

  if p_actual_in_at <= v_out_at then
    raise exception 'Giờ vào lại thực tế phải sau giờ ra';
  end if;

  if p_actual_in_at > now() + interval '5 minutes' then
    raise exception 'Giờ vào lại thực tế không được ở tương lai';
  end if;

  if v_booth_in_at is not null or v_actual_source = 'booth' then
    raise exception 'Bảo vệ đã ghi giờ vào; giờ tại cổng được ưu tiên';
  end if;

  if v_actual_in_at is not null then
    raise exception 'Giờ vào lại thực tế đã được ghi';
  end if;

  if abs(p_drift_minutes) > 15 and btrim(coalesce(p_drift_reason, '')) = '' then
    raise exception 'Lệch quá 15 phút thì phải ghi lý do';
  end if;

  update lg_gate_detail
  set actual_in_at = p_actual_in_at,
      actual_in_source = 'employee',
      drift_minutes = p_drift_minutes,
      drift_reason = nullif(btrim(coalesce(p_drift_reason, '')), '')
  where request_id = v_request_id;

  insert into lg_audit (entity, entity_id, action, actor, detail)
  values (
    'lg_request',
    v_request_id::text,
    'set_actual_return',
    'public',
    jsonb_build_object(
      'code', v_code,
      'actualInAt', p_actual_in_at,
      'driftMinutes', p_drift_minutes,
      'source', 'employee'
    )
  );

  return jsonb_build_object('code', v_code, 'actualInAt', p_actual_in_at);
end;
$$;

-- create or replace keeps the existing grants, but 0005 made default privileges
-- in public deny anon and authenticated, so state them anyway rather than rely
-- on what the previous definition happened to carry.
revoke all on function lg_set_actual_return(text, timestamptz, integer, text, timestamptz) from public;
grant execute on function lg_set_actual_return(text, timestamptz, integer, text, timestamptz)
  to service_role;
