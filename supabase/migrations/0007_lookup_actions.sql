-- Private-link lookup and employee actions (PRD sections XII-XIII, rules 1,
-- 11, 13, 15 and 18).
--
-- All three functions are service_role-only. The lookup token authorises the
-- operation, but keeping the functions behind Server Components and Server
-- Actions also keeps the database surface unavailable to a hand-made browser
-- request. No function below returns the token or the employee number.

create function lg_lookup_by_token(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
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
            'handoverName', handover.full_name,
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
$$;

comment on function lg_lookup_by_token(text) is
  'Full request detail for a valid private token. service_role only.';

revoke all on function lg_lookup_by_token(text) from public;
grant execute on function lg_lookup_by_token(text) to service_role;

create function lg_withdraw_request(p_token text, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request lg_request;
begin
  select *
  into v_request
  from lg_request
  where lookup_token = lower(btrim(coalesce(p_token, '')))
  for update;

  if not found then
    raise exception 'Đường dẫn theo dõi không hợp lệ';
  end if;

  if v_request.status not in ('pending', 'claimed') then
    raise exception 'Chỉ rút được đơn đang chờ duyệt hoặc đang xử lý';
  end if;

  update lg_request
  set status = 'withdrawn',
      withdrawn_at = now(),
      withdraw_reason = nullif(btrim(coalesce(p_reason, '')), ''),
      claimed_by_email = null,
      claimed_at = null
  where id = v_request.id;

  insert into lg_audit (entity, entity_id, action, actor, detail)
  values (
    'lg_request',
    v_request.id::text,
    'withdraw',
    'public',
    jsonb_build_object('code', v_request.code)
  );

  return jsonb_build_object('code', v_request.code, 'status', 'withdrawn');
end;
$$;

comment on function lg_withdraw_request(text, text) is
  'Withdraws a pending or claimed request using its private token. service_role only.';

revoke all on function lg_withdraw_request(text, text) from public;
grant execute on function lg_withdraw_request(text, text) to service_role;

create function lg_set_actual_return(
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

  if p_actual_in_at <= v_out_at then
    raise exception 'Giờ vào lại thực tế phải sau giờ ra';
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

comment on function lg_set_actual_return(text, timestamptz, integer, text, timestamptz) is
  'Records an employee-declared actual return before the server-computed deadline. service_role only.';

revoke all on function lg_set_actual_return(text, timestamptz, integer, text, timestamptz) from public;
grant execute on function lg_set_actual_return(text, timestamptz, integer, text, timestamptz)
  to service_role;
