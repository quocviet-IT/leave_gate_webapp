-- Claim, release and decide — PRD section VII, rules 7 to 10.
--
-- All three are service_role only. The approver's identity is not a parameter
-- the browser controls: the server action calls requireRole() first and passes
-- the session email it verified. The claim timeout arrives the same way as the
-- return deadline in 0007 — computed by the caller from
-- lib/domain/approvals.ts, so the rule keeps one home (CLAUDE.md section 3).
--
-- Every one of them re-reads the row `for update` and re-checks the version. An
-- approver acting on a screen that has moved on is refused and told who decided
-- it, rather than quietly overwriting a colleague (rule 8).

-- A claim nobody acted on is not held by anybody. Rather than run a job, each
-- write path asks this first, which is the same question the queue asks when it
-- renders. The two cannot drift apart.
create function lg_claim_is_live(
  p_status          lg_request_status,
  p_claimed_at      timestamptz,
  p_timeout_minutes int
)
returns boolean
language sql
stable
set search_path = public
as $fn$
  select p_status = 'claimed'
     and p_claimed_at is not null
     and now() < p_claimed_at + make_interval(mins => p_timeout_minutes);
$fn$;

comment on function lg_claim_is_live(lg_request_status, timestamptz, int) is
  'Whether a claim is still held. Mirrors isClaimExpired() in lib/domain/approvals.ts.';

revoke all on function lg_claim_is_live(lg_request_status, timestamptz, int) from public;
grant execute on function lg_claim_is_live(lg_request_status, timestamptz, int) to service_role;

-- Raised when the version on screen no longer matches the row. The message
-- names the decision so the approver sees why, not just that.
create function lg_stale_view_message(p_request lg_request)
returns text
language sql
stable
set search_path = public
as $fn$
  select case
    when p_request.status in ('approved', 'rejected') then
      coalesce(
        (select u.full_name from lg_app_user u where u.email = p_request.decided_by_email),
        p_request.decided_by_email,
        'Người khác'
      )
      || case when p_request.status = 'approved' then ' đã duyệt đơn này' else ' đã từ chối đơn này' end
      || coalesce(' lúc ' || to_char(p_request.decided_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI'), '')
    when p_request.status = 'withdrawn' then 'Người gửi đã rút đơn này'
    when p_request.claimed_by_email is not null then
      coalesce(
        (select u.full_name from lg_app_user u where u.email = p_request.claimed_by_email),
        p_request.claimed_by_email
      ) || ' đang xử lý đơn này'
    else 'Đơn đã thay đổi từ lúc bạn mở màn hình'
  end;
$fn$;

revoke all on function lg_stale_view_message(lg_request) from public;
grant execute on function lg_stale_view_message(lg_request) to service_role;

create function lg_claim_request(
  p_request_id      uuid,
  p_version         integer,
  p_email           text,
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
  if v_email = '' then
    raise exception 'Thiếu tài khoản người duyệt';
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

  -- Somebody else is genuinely holding it. An aged-out claim is not.
  if lg_claim_is_live(v_request.status, v_request.claimed_at, p_timeout_minutes)
     and lower(v_request.claimed_by_email) <> v_email then
    raise exception '%', lg_stale_view_message(v_request);
  end if;

  update lg_request
  set status = 'claimed',
      claimed_by_email = v_email,
      claimed_at = now()
  where id = p_request_id;

  insert into lg_audit (entity, entity_id, action, actor, detail)
  values ('lg_request', p_request_id::text, 'claim', v_email,
          jsonb_build_object('code', v_request.code));

  return (select jsonb_build_object('code', code, 'version', version, 'status', status)
          from lg_request where id = p_request_id);
end;
$fn$;

comment on function lg_claim_request(uuid, integer, text, int) is
  'Takes a pending request, or re-takes one whose claim aged out. service_role only.';

revoke all on function lg_claim_request(uuid, integer, text, int) from public;
grant execute on function lg_claim_request(uuid, integer, text, int) to service_role;

create function lg_release_request(
  p_request_id uuid,
  p_version    integer,
  p_email      text
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
  select * into v_request from lg_request where id = p_request_id for update;
  if not found then
    raise exception 'Không tìm thấy đơn';
  end if;

  if v_request.version <> p_version then
    raise exception '%', lg_stale_view_message(v_request);
  end if;

  if v_request.status <> 'claimed' or lower(coalesce(v_request.claimed_by_email, '')) <> v_email then
    raise exception 'Bạn không giữ đơn này';
  end if;

  update lg_request
  set status = 'pending',
      claimed_by_email = null,
      claimed_at = null
  where id = p_request_id;

  insert into lg_audit (entity, entity_id, action, actor, detail)
  values ('lg_request', p_request_id::text, 'release', v_email,
          jsonb_build_object('code', v_request.code));

  return (select jsonb_build_object('code', code, 'version', version, 'status', status)
          from lg_request where id = p_request_id);
end;
$fn$;

comment on function lg_release_request(uuid, integer, text) is
  'Hands a claimed request back to the queue. service_role only.';

revoke all on function lg_release_request(uuid, integer, text) from public;
grant execute on function lg_release_request(uuid, integer, text) to service_role;

create function lg_decide_request(
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
  v_subject text;
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
  select lower(e.email) into v_subject from lg_employee e where e.id = v_request.employee_id;
  if v_subject = v_email or lower(coalesce(v_request.filed_by_email, '')) = v_email then
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
