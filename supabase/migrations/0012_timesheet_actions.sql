-- The timesheet — PRD section XI, rules 16 and 17.
--
-- Computed hours are locked: what lib/domain/workhours.ts worked out at filing
-- is the record of what the rules said, and nothing may edit it (rule 17).
-- Final hours are what payroll uses. They start equal to the computed figure,
-- and moving them apart costs a reason of at least ten characters — the old
-- value, the new value, the editor and the time are all kept (rule 16).
--
-- Both functions are service_role only, and both re-check the role in the
-- database rather than trust the caller: requireRole("cnb") already ran in the
-- server action, and this is the second lock on the same door.

create function lg_is_cnb(p_email text)
returns boolean
language sql
stable
set search_path = public
as $fn$
  select exists (
    select 1 from lg_app_user
    where email = lower(btrim(coalesce(p_email, '')))
      and role = 'cnb'
      and active
  );
$fn$;

revoke all on function lg_is_cnb(text) from public;
grant execute on function lg_is_cnb(text) to service_role;

create function lg_set_final_hours(
  p_request_id    uuid,
  p_final_minutes integer,
  p_reason        text,
  p_email         text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_email  text := lower(btrim(coalesce(p_email, '')));
  v_sheet  lg_timesheet;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if not lg_is_cnb(v_email) then
    raise exception 'Chỉ C&B mới sửa được số giờ chốt';
  end if;
  if p_final_minutes is null or p_final_minutes < 0 then
    raise exception 'Số giờ chốt không hợp lệ';
  end if;

  select * into v_sheet from lg_timesheet where request_id = p_request_id for update;
  if not found then
    raise exception 'Đơn này chưa có trên bảng chấm công';
  end if;

  if v_sheet.final_minutes = p_final_minutes then
    return jsonb_build_object('requestId', p_request_id, 'finalMinutes', p_final_minutes);
  end if;

  -- Rule 16. The reason is only required once the final hours leave the
  -- computed ones — putting them back is not an adjustment to justify.
  if p_final_minutes <> v_sheet.computed_minutes and length(v_reason) < 10 then
    raise exception 'Lý do điều chỉnh phải từ 10 ký tự';
  end if;

  insert into lg_hours_adjustment (request_id, old_minutes, new_minutes, reason, changed_by)
  values (
    p_request_id,
    v_sheet.final_minutes,
    p_final_minutes,
    case when length(v_reason) >= 10 then v_reason else 'Đưa về đúng số giờ hệ thống tính' end,
    v_email
  );

  update lg_timesheet set final_minutes = p_final_minutes where request_id = p_request_id;

  insert into lg_audit (entity, entity_id, action, actor, detail)
  values ('lg_request', p_request_id::text, 'set_final_hours', v_email,
          jsonb_build_object('old', v_sheet.final_minutes, 'new', p_final_minutes));

  return jsonb_build_object('requestId', p_request_id, 'finalMinutes', p_final_minutes);
end;
$fn$;

comment on function lg_set_final_hours(uuid, integer, text, text) is
  'Edits the payroll hours, with the reason rule 16 requires. service_role only.';

revoke all on function lg_set_final_hours(uuid, integer, text, text) from public;
grant execute on function lg_set_final_hours(uuid, integer, text, text) to service_role;

-- "Marked as done" is how C&B keeps track of what has reached payroll. It is a
-- bookmark, not a state of the request, so it can be taken back.
create function lg_mark_timesheet(p_request_id uuid, p_email text, p_done boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if not lg_is_cnb(v_email) then
    raise exception 'Chỉ C&B mới đánh dấu được';
  end if;

  update lg_timesheet
  set marked_at = case when p_done then now() else null end,
      marked_by_email = case when p_done then v_email else null end
  where request_id = p_request_id;

  if not found then
    raise exception 'Đơn này chưa có trên bảng chấm công';
  end if;

  insert into lg_audit (entity, entity_id, action, actor, detail)
  values ('lg_request', p_request_id::text,
          case when p_done then 'timesheet_mark' else 'timesheet_unmark' end,
          v_email, '{}'::jsonb);

  return jsonb_build_object('requestId', p_request_id, 'done', p_done);
end;
$fn$;

revoke all on function lg_mark_timesheet(uuid, text, boolean) from public;
grant execute on function lg_mark_timesheet(uuid, text, boolean) to service_role;

-- Approvals that predate 0009 never got a timesheet row. Backfill them so the
-- screen shows the whole period rather than only what was approved since.
insert into lg_timesheet (request_id, computed_minutes, final_minutes)
select r.id, r.computed_minutes, r.computed_minutes
from lg_request r
where r.status = 'approved'
on conflict (request_id) do nothing;
