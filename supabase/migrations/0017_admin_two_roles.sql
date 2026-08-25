-- The admin zone drops to two roles and two issued accounts.
--
-- Board decision, 2026-08-25. Google SSO was never usable — the provider is not
-- enabled on the Supabase project, so nobody had ever signed in — and the
-- supervisor role lost its reason to exist when migration 0015 let a worker type
-- their own name on the public form. A supervisor filling in the public form on
-- a worker's behalf now needs no account at all.
--
-- What this gives up is recorded in
-- docs/superpowers/specs/2026-08-25-admin-accounts-design.md: with one shared
-- approver account, `decided_by_email` no longer names a person and rule 9 is
-- inert. The version lock in lg_decide_request is what still keeps a shared
-- login safe, and it is unchanged.

-- Filing on behalf was the supervisor's only action.
drop function if exists lg_submit_on_behalf(uuid, lg_request_kind, jsonb, int, text, text);

-- The department only ever scoped a supervisor. The column stays — it is null on
-- both remaining accounts, and dropping a column is easy to do and expensive to
-- undo — but the constraint that made it mandatory for a role that no longer
-- exists has to go.
alter table lg_app_user drop constraint if exists lg_app_user_supervisor_needs_department;

-- `supervisor` cannot be removed from the enum: Postgres has no DROP VALUE, and
-- rebuilding lg_app_role to tidy one unused label would rewrite a column that
-- every RLS policy reads through lg_current_role(). A check constraint is what
-- actually keeps the value out of the table, and says so where it is enforced.
alter table lg_app_user drop constraint if exists lg_app_user_role_in_use;
alter table lg_app_user
  add constraint lg_app_user_role_in_use check (role in ('approver', 'cnb'));

comment on column lg_app_user.role is
  'approver or cnb. The lg_app_role enum still carries supervisor because an enum value cannot be dropped; lg_app_user_role_in_use is what keeps it unused.';

comment on column lg_app_user.department is
  'Unused since 2026-08-25. It scoped a supervisor to one workshop, and there are no supervisors.';

-- lg_search_employees was reachable by anon because the old public form searched
-- the staff list from the browser. Since 0015 the form types a name, and the
-- supervisor screen that also read the list is gone, so no browser calls this any
-- more. A function open to the internet with no caller is exactly what the
-- rulebook warns about, so the grant goes with the caller.
revoke execute on function lg_search_employees(text) from anon;

comment on function lg_search_employees(text) is
  'Name search over the staff list. service_role and authenticated only since 2026-08-25 — the public form types a name and no longer searches.';
