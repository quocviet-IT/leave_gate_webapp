# The admin zone: two accounts, a username and a password

**Date:** 2026-08-25 · **Status:** approved · **Replaces:** Google Workspace SSO and the supervisor role

## Why

Google SSO was never usable. The provider is not enabled on the Supabase
project — `/auth/v1/authorize?provider=google` answers
`400 Unsupported provider: provider is not enabled` — so no one has ever opened
`/admin/*`. Enabling it needs a Google Cloud OAuth client and a Workspace admin,
neither of which the company has supplied.

The board's decision on 2026-08-25: issue usernames and passwords instead, one
shared account for the approvers and one for C&B, and drop the supervisor role.

## What the zone becomes

| Username | Role | Screens |
| --- | --- | --- |
| `duyet` | `approver` | Tổng quan · Duyệt đơn |
| `nhansu` | `cnb` | Tổng quan · Chấm công · Nhân sự · Poster QR |

Sign-in takes a username, not an email. `duyet` is what a person types; the code
appends `@ctyhp.vn` and calls `signInWithPassword`. Supabase Auth needs an email
to key an account on, but nobody has to know that.

Sessions, `proxy.ts`, `getUserRole` and `requireRole` are untouched. A Supabase
password session is the same session object an OAuth one produced, so the guard
chain — signed in → company email → row in `lg_app_user` — keeps working as
written.

Two accounts do not justify an account-management screen. Whoever can create
accounts can grant themselves a role, so that screen needs an authorisation
model of its own; for two rows it is cheaper and safer to create them in the
Supabase dashboard.

## What this costs, recorded because it was raised and accepted

One shared approver account changes four things, and all four were put to the
board before the work started:

1. **`decided_by_email` stops naming a person.** Every decision records the same
   address. The audit log still shows that a decision happened, when, and on
   what — but not by whom. For an approval system that is the sharpest loss.
2. **Rule 9 stops working.** "An approver may not decide their own request"
   compares the approver's name against the name on the request. A shared
   account's name matches nobody, so anyone holding it can approve their own
   request. `lg_request_is_own` stays in place and still works for a request
   filed against a staff row, which is the supervisor path — now removed. In
   practice the rule is inert.
3. **Claim loses its purpose.** It exists so four approvers do not decide the
   same request twice (PRD rules 7–8). Two people sharing one login look
   identical to it. The version lock still prevents a double decision, so
   nothing becomes unsafe; the button simply stops meaning what it says. It is
   left in place rather than removed — it costs nothing and would have to be
   rebuilt the day accounts are split.
4. **A leaver forces a password change for everyone.**

The way back is small: give each approver their own row in `lg_app_user` and
their own account. Nothing in this design blocks that, which is why the role
model keeps its shape.

## Removing the supervisor

Nothing in the product still needs it. Supervisors filed on behalf of workers
who had no phone; since migration `0015` a worker types their own name, and a
supervisor can fill the public form for them just as easily.

Deleted: `/admin/tao-don-ho` (page, actions, action state),
`components/admin/OnBehalfForm.tsx`, `lib/services/supervisor.ts`,
`scripts/verify-supervisor.mjs` and its npm script, `onBehalfSubmitterSchema`,
and `supervisor` from `AppRole`, the nav and the overview.

Migration `0017` drops `lg_submit_on_behalf`, drops the
`lg_app_user_supervisor_needs_department` constraint, and adds
`role in ('approver','cnb')`. The value `supervisor` **stays in the
`lg_app_role` enum**: Postgres cannot drop an enum value, and rebuilding the
type to tidy one unused label would rewrite a column every policy reads. The
check constraint is what actually keeps it out.

`lg_app_user.department` is left in place. It is null on both accounts and
costs nothing, and dropping a column is the kind of change that is easy to do
and expensive to undo.

## Tightening what the removal frees

`lg_search_employees` is granted to `anon` because the old public form searched
the staff list from the browser. That form types a name now, and the supervisor
screen that also used the list is gone, so no browser calls it any more.
Migration `0017` revokes it. `verify-submit.mjs` asserts the anon surface, so
its expected list shrinks to `lg_status_by_code` alone.

`lg_employee` and the C&B paste-import at `/admin/nhan-su` stay. Nothing on the
request path reads them today, but the timesheet reconciliation and the
Directory sync in P9 both want a staff list, and deleting it would be a
decision this change was never asked to make.

## Testing

- `tests/unit/admin-auth.test.ts`: a username becomes the right email; a
  username with an `@` in it is refused rather than producing a broken address;
  the role guard admits exactly `approver` and `cnb`.
- `tests/unit/admin-screens-render.test.tsx` loses its `OnBehalfForm` cases and
  keeps the overview ones, with `supervisor` gone from the role fixtures.
- `verify:approvals` is unchanged and must stay green: the version lock is what
  keeps a shared account safe, and it is the check that matters most now.
- `verify:submit`'s anon-surface assertion shrinks to one function.
- `scripts/smoke-pages.mjs` drops `/admin/tao-don-ho`.

## What has to happen outside the code

The two accounts must exist in Supabase Auth with a password, and
`lg_app_user` must hold exactly two rows keyed to their addresses. Neither is a
migration: a migration must not carry a password, and `supabase/migrations` is
committed to a public repository.
