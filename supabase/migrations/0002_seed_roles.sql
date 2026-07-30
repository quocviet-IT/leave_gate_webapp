-- The people who hold roles in the admin zone, from PRD section V.
--
-- Seeded here rather than synced, because Workspace does not know who approves
-- leave. Re-runnable: emails are the key, so a role change is an edit, not a
-- duplicate. Supervisors are NOT seeded — HR has not named them yet (PRD XV,
-- "còn thiếu để bắt đầu").

insert into lg_app_user (email, role, full_name) values
  ('dieu@ctyhp.vn',     'approver', 'Chị Diệu'),
  ('sx001@ctyhp.vn',    'approver', 'Chị Phúc'),
  ('mytran@ctyhp.vn',   'approver', 'Chị Trân'),
  ('hanh@ctyhp.vn',     'approver', 'Chị Hạnh'),
  ('anhkhoa@ctyhp.vn',  'cnb',      'Chị Khoa')
on conflict (email) do update
  set role = excluded.role,
      full_name = excluded.full_name,
      active = true;
