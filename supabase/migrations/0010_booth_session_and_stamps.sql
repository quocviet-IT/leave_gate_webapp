-- The gate booth — PRD section VIII, rules 13, 14 and 19.
--
-- The booth is its own zone: no Google account and no Supabase session. A PIN
-- buys a long-lived session on that one machine, held as a random token in the
-- table below. The cookie carries the token and nothing else, so a tampered
-- cookie simply matches no row.
--
-- What the booth may see is deliberately narrow: approved gate passes leaving
-- today, and not one word of why anybody is going out. A leave reason must
-- never reach a booth screen (rules 14 and 19), so `lg_booth_today` selects the
-- columns by name and leaves `note` and `reason` behind.

create table lg_booth_session (
  token       text primary key check (token ~ '^[0-9a-f]{64}$'),
  booth_id    uuid not null references lg_booth (id),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  last_seen_at timestamptz not null default now()
);

create index lg_booth_session_booth_idx on lg_booth_session (booth_id, expires_at desc);

alter table lg_booth_session enable row level security;
-- No policy: nobody reaches this table except through the functions below.

-- Sets or replaces a booth's PIN. C&B only; the PIN is never stored in clear.
create function lg_set_booth_pin(p_booth_name text, p_pin text, p_actor text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $fn$
declare
  v_booth lg_booth;
begin
  if length(btrim(coalesce(p_pin, ''))) < 4 then
    raise exception 'Mã PIN phải từ 4 ký tự';
  end if;

  insert into lg_booth (name, pin_hash, updated_by)
  values (btrim(p_booth_name), crypt(btrim(p_pin), gen_salt('bf')), p_actor)
  on conflict (name) do update
    set pin_hash = excluded.pin_hash,
        updated_at = now(),
        updated_by = excluded.updated_by,
        active = true
  returning * into v_booth;

  -- Changing the PIN ends every machine's session, which is the point: a PIN
  -- change is how a booth is locked out.
  delete from lg_booth_session where booth_id = v_booth.id;

  insert into lg_audit (entity, entity_id, action, actor, detail)
  values ('lg_booth', v_booth.id::text, 'set_pin', coalesce(p_actor, 'unknown'),
          jsonb_build_object('name', v_booth.name));

  return jsonb_build_object('id', v_booth.id, 'name', v_booth.name);
end;
$fn$;

comment on function lg_set_booth_pin(text, text, text) is
  'Sets a booth PIN and ends its sessions. service_role only.';

revoke all on function lg_set_booth_pin(text, text, text) from public;
grant execute on function lg_set_booth_pin(text, text, text) to service_role;

-- Exchanges a PIN for a session token. Wrong PIN returns null rather than
-- raising, so the caller cannot tell "no such booth" from "wrong PIN".
create function lg_booth_sign_in(p_pin text, p_token text, p_days int)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $fn$
declare
  v_booth lg_booth;
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'Phiên không hợp lệ';
  end if;

  select * into v_booth
  from lg_booth
  where active and pin_hash = crypt(btrim(coalesce(p_pin, '')), pin_hash)
  limit 1;

  if not found then
    return null;
  end if;

  insert into lg_booth_session (token, booth_id, expires_at)
  values (p_token, v_booth.id, now() + make_interval(days => p_days));

  insert into lg_audit (entity, entity_id, action, actor, detail)
  values ('lg_booth', v_booth.id::text, 'booth_sign_in', 'booth:' || v_booth.name, '{}'::jsonb);

  return jsonb_build_object('id', v_booth.id, 'name', v_booth.name);
end;
$fn$;

comment on function lg_booth_sign_in(text, text, int) is
  'Exchanges a booth PIN for a session token, or null. service_role only.';

revoke all on function lg_booth_sign_in(text, text, int) from public;
grant execute on function lg_booth_sign_in(text, text, int) to service_role;

create function lg_booth_session_booth(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_id   uuid;
  v_name text;
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{64}$' then
    return null;
  end if;

  select b.id, b.name into v_id, v_name
  from lg_booth_session s
  join lg_booth b on b.id = s.booth_id
  where s.token = p_token and s.expires_at > now() and b.active;

  if not found then
    return null;
  end if;

  update lg_booth_session set last_seen_at = now() where token = p_token;
  return jsonb_build_object('id', v_id, 'name', v_name);
end;
$fn$;

revoke all on function lg_booth_session_booth(text) from public;
grant execute on function lg_booth_session_booth(text) to service_role;

create function lg_booth_sign_out(p_token text)
returns void
language sql
security definer
set search_path = public
as $fn$
  delete from lg_booth_session where token = p_token;
$fn$;

revoke all on function lg_booth_sign_out(text) from public;
grant execute on function lg_booth_sign_out(text) to service_role;

-- Today's board. Approved gate passes only, leaving today in ICT, soonest exit
-- first. No reason, no note, no leave request, no other day (rules 14 and 19).
create function lg_booth_today(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_booth jsonb := lg_booth_session_booth(p_token);
  v_today date;
  v_rows  jsonb;
begin
  if v_booth is null then
    raise exception 'Phiên bốt đã hết hạn; nhập lại mã PIN';
  end if;

  v_today := (now() at time zone 'Asia/Ho_Chi_Minh')::date;

  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.out_at), '[]'::jsonb)
  into v_rows
  from (
    select
      r.id,
      r.code,
      r.employee_snapshot ->> 'full_name' as full_name,
      r.employee_snapshot ->> 'department' as department,
      g.out_at,
      g.expected_in_at,
      g.booth_out_at,
      g.booth_in_at
    from lg_request r
    join lg_gate_detail g on g.request_id = r.id
    where r.kind = 'gate'
      and r.status = 'approved'
      and (g.out_at at time zone 'Asia/Ho_Chi_Minh')::date = v_today
    order by g.out_at
  ) t;

  return jsonb_build_object('booth', v_booth, 'rows', v_rows);
end;
$fn$;

comment on function lg_booth_today(text) is
  'Today''s approved gate passes for the booth. Carries no reason, by design.';

revoke all on function lg_booth_today(text) from public;
grant execute on function lg_booth_today(text) to service_role;

-- One tap. The time is the server's, never typed. Cho ra must come before Cho
-- vào; tapping the return first is refused with an explanation.
create function lg_booth_stamp(p_token text, p_request_id uuid, p_direction text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_booth  jsonb := lg_booth_session_booth(p_token);
  v_gate   lg_gate_detail;
  v_status lg_request_status;
  v_code   text;
  v_now    timestamptz := now();
  v_drift  integer;
begin
  if v_booth is null then
    raise exception 'Phiên bốt đã hết hạn; nhập lại mã PIN';
  end if;
  if p_direction not in ('out', 'in') then
    raise exception 'Chỉ ghi được Cho ra hoặc Cho vào';
  end if;

  select r.status, r.code into v_status, v_code from lg_request r where r.id = p_request_id;
  if not found then
    raise exception 'Không tìm thấy đơn';
  end if;
  if v_status <> 'approved' then
    raise exception 'Chỉ ghi giờ cho đơn đã duyệt';
  end if;

  select * into v_gate from lg_gate_detail where request_id = p_request_id for update;
  if not found then
    raise exception 'Đơn này không phải giấy ra vào cổng';
  end if;

  if p_direction = 'out' then
    if v_gate.booth_out_at is not null then
      raise exception 'Đã ghi giờ ra cho đơn này';
    end if;
    update lg_gate_detail
    set booth_out_at = v_now,
        booth_id = (v_booth ->> 'id')::uuid
    where request_id = p_request_id;
  else
    if v_gate.booth_out_at is null then
      raise exception 'Phải bấm Cho ra trước khi bấm Cho vào';
    end if;
    if v_gate.booth_in_at is not null then
      raise exception 'Đã ghi giờ vào cho đơn này';
    end if;

    -- Plain subtraction of two instants, the same arithmetic as
    -- returnDriftMinutes() in lib/domain/workhours.ts. No working-hours rule is
    -- involved, so this is not a second home for one.
    v_drift := round(extract(epoch from (v_now - v_gate.expected_in_at)) / 60.0);

    -- Rule 13: the guard's time wins over whatever the employee entered.
    update lg_gate_detail
    set booth_in_at = v_now,
        booth_id = (v_booth ->> 'id')::uuid,
        actual_in_at = v_now,
        actual_in_source = 'booth',
        drift_minutes = v_drift,
        drift_reason = case
          when actual_in_source = 'employee' then drift_reason
          else null
        end
    where request_id = p_request_id;
  end if;

  insert into lg_audit (entity, entity_id, action, actor, detail)
  values ('lg_request', p_request_id::text, 'booth_' || p_direction,
          'booth:' || (v_booth ->> 'name'),
          jsonb_build_object('code', v_code, 'at', v_now));

  return jsonb_build_object('code', v_code, 'direction', p_direction, 'at', v_now);
end;
$fn$;

comment on function lg_booth_stamp(text, uuid, text) is
  'Records a Cho ra / Cho vào tap at the booth. service_role only.';

revoke all on function lg_booth_stamp(text, uuid, text) from public;
grant execute on function lg_booth_stamp(text, uuid, text) to service_role;

-- A mis-tap is undoable for a few minutes on that row. After the window, C&B
-- edits it with a reason instead. The window arrives from the caller for the
-- same reason the claim timeout does — one home for the rule.
create function lg_booth_undo(
  p_token          text,
  p_request_id     uuid,
  p_direction      text,
  p_window_minutes int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_booth jsonb := lg_booth_session_booth(p_token);
  v_gate  lg_gate_detail;
  v_code  text;
  v_at    timestamptz;
begin
  if v_booth is null then
    raise exception 'Phiên bốt đã hết hạn; nhập lại mã PIN';
  end if;
  if p_direction not in ('out', 'in') then
    raise exception 'Chỉ hoàn tác được Cho ra hoặc Cho vào';
  end if;

  select * into v_gate from lg_gate_detail where request_id = p_request_id for update;
  if not found then
    raise exception 'Không tìm thấy đơn';
  end if;

  v_at := case when p_direction = 'out' then v_gate.booth_out_at else v_gate.booth_in_at end;
  if v_at is null then
    raise exception 'Chưa có gì để hoàn tác';
  end if;
  if now() > v_at + make_interval(mins => p_window_minutes) then
    raise exception 'Quá % phút thì không hoàn tác được; nhờ C&B sửa kèm lý do', p_window_minutes;
  end if;

  select code into v_code from lg_request where id = p_request_id;

  if p_direction = 'out' then
    if v_gate.booth_in_at is not null then
      raise exception 'Đã ghi giờ vào; hoàn tác giờ vào trước';
    end if;
    update lg_gate_detail set booth_out_at = null where request_id = p_request_id;
  else
    -- Undoing the return also undoes what it wrote to the payroll figure, but
    -- only when the booth is what put it there.
    update lg_gate_detail
    set booth_in_at = null,
        actual_in_at = case when actual_in_source = 'booth' then null else actual_in_at end,
        actual_in_source = case when actual_in_source = 'booth' then null else actual_in_source end,
        drift_minutes = case when actual_in_source = 'booth' then null else drift_minutes end
    where request_id = p_request_id;
  end if;

  insert into lg_audit (entity, entity_id, action, actor, detail)
  values ('lg_request', p_request_id::text, 'booth_undo_' || p_direction,
          'booth:' || (v_booth ->> 'name'),
          jsonb_build_object('code', v_code, 'undid', v_at));

  return jsonb_build_object('code', v_code, 'direction', p_direction);
end;
$fn$;

comment on function lg_booth_undo(text, uuid, text, int) is
  'Reverses a booth tap inside its undo window. service_role only.';

revoke all on function lg_booth_undo(text, uuid, text, int) from public;
grant execute on function lg_booth_undo(text, uuid, text, int) to service_role;
