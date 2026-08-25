# Agent notes

See [CLAUDE.md](CLAUDE.md) for the working rulebook — run commands, verification
gates, architecture, gotchas. This file holds only what is specific to picking up
work here.

## State of the build

Every Phase 1 screen is built and verified. Build, typecheck, lint and 233 unit
tests pass; migrations `0001`–`0014` are applied to the live Supabase project;
all 16 routes answer correctly (`scripts/smoke-pages.mjs`), the two lookup
depths and both printable forms render against seeded data
(`scripts/smoke-private-lookup.mjs`), and one request has been walked end to
end (`npm run verify:e2e`). The public pages carry no horizontal overflow at
375px.

`components/ScreenSkeleton.tsx` and `components/PublicNotice.tsx` are gone: no
route renders a placeholder any more.

What exists for real:

- Working-time arithmetic, the SLA clock, request codes and lookup tokens, and
  every input schema — with unit tests taken from the PRD's own examples.
- Database foundation: tables, constraints, indexes, RLS with `anon` denied
  everywhere, role helpers, per-month code sequence, version-bump trigger.
- Route tree for all three zones, with the admin auth boundary enforced.
- Sign-in for the admin zone: a username and password, not Google. Google SSO
  was never usable — the provider is not enabled on the Supabase project, so
  `/auth/v1/authorize?provider=google` answers `400 provider is not enabled`
  and nobody had ever signed in. Two issued accounts replaced it on
  2026-08-25: `duyet` (approver) and `nhansu` (cnb). `npm run admin:accounts`
  creates or resets them; `npm run verify:admin` signs in and opens every
  screen over HTTP. **The supervisor role is gone** — `/admin/tao-don-ho` with
  it. A supervisor helping a worker now fills the public form, which needs no
  account at all.

  One shared approver account is a deliberate trade the board made, and it
  costs three things worth knowing: `decided_by_email` no longer names a
  person, rule 9 (không tự duyệt đơn của mình) is inert because a shared
  account's name matches nobody, and Claim no longer separates two people. The
  version lock is what still makes a shared login safe. Splitting the account
  back out is one row in `lg_app_user` per person — nothing in the design
  blocks it.
- Employee master data: a paste-import for C&B at `/admin/nhan-su`, and a bounded
  name search that never returns the employee number. The public form no longer
  uses that search; the supervisor's on-behalf screen does.
- The filing form at `/don`: one page, one submit button. A kind toggle swaps
  the field group in place, and the group that is not showing is unmounted, so
  a gate pass cannot carry a leave date it merely stopped displaying.
  `?kind=gate` opens straight on the gate form for a QR code that knows which
  it wants. `components/public/RequestForm.tsx` holds the state;
  `IdentityFields`, `LeaveFields`, `GateFields` and `ReasonField` hold the
  fields. `tests/unit/request-form-render.test.tsx` renders both kinds, because
  a URL cannot press the toggle.
- **The person types their own name** (migrations `0015` and `0016`, board
  decision 2026-08-25). There is no staff-list picker on the public form any more, and
  no Supabase client in the public bundle at all. `lg_request.employee_id` is
  null for every public filing, so read the person off `employee_snapshot` and
  never join `lg_employee`. What this gave up, and what still bounds it, is in
  CLAUDE.md section 6 — read it before changing anything here.
- Employee master data still exists and still matters: supervisors filing on
  behalf pick from it, and that path keeps the employee id and every guarantee
  that comes with it.
- What the public form requires, decided by the board on 2026-08-25 and
  enforced in the schemas *and* in `lg_submit_request`:

  | Required | Optional |
  | --- | --- |
  | Họ và tên · Chức vụ · Phòng ban | Bàn giao công việc cho |
  | Nghỉ từ ngày · Đến hết ngày | Đề xuất ngày làm bù |
  | Lý do · Diễn giải | |

  The handover used to be required. It is a blank line on the paper form, and
  the PRD never made it a rule, so it is optional here too — but a handover
  that *is* typed must still be a name rather than a stray keystroke.

  The card carries the paper form's own title — `ĐƠN XIN NGHỈ PHÉP` or
  `GIẤY XIN PHÉP RA VÀO CỔNG`, the same two names printed by
  `PrintableRequest` — and renames itself when the kind toggle moves. Keep the
  two in step: a worker who has filled these sheets for years reads the title
  first, and the render test asserts each kind shows only its own.

  The submit bar is `position: sticky`, which is why nothing in the public zone
  may set `overflow` on `html`, `body` or the layout's `main`: any of them
  creates a scroll container and the bar stops sticking. Horizontal overflow is
  held off with `min-width: 0` on the grid and flex children instead — a date
  input's intrinsic width is what pushes a phone page sideways.

  The form marks the **optional** fields, not the required ones. Almost
  everything is required, so marking the majority would be noise; the two
  exceptions are the information. Keep it that way when adding a field, and
  `request-form-render.test.tsx` counts the tags to make sure.
- Public lookup, both depths: `/tra-cuu` answers a request code with a status
  and nothing else, and `/tra-cuu/<token>` opens the request in full, withdraws
  it, and takes a real return time until the end of the next working day.
  `npm run smoke:lookup` seeds a request, renders every branch and deletes it.
- Approval queue at `/admin/duyet-don`: four tabs, Claim with a 30-minute
  release, optimistic version lock, and a realtime subscription so four
  approvers never work off the same stale table. Approving writes the timesheet
  row. `npm run verify:approvals` covers rules 7 to 10 in the database.
- Gate booth at `/bao-ve`: a PIN buys a 30-day session token on that machine,
  the board shows only today's approved gate passes and carries no reason at
  all, Cho ra must precede Cho vào, and a mis-tap is undoable for five
  minutes. A booth tap becomes the payroll figure. `npm run verify:booth`.
- Timesheet at `/admin/cham-cong`: period filter, both hours columns with the
  computed one locked, an adjustment reason of ten characters whenever they
  differ, the gate-time column with its review flags, mark as done, and an
  Excel download. `npm run verify:timesheet`.
- `lib/xlsx.ts` writes the `.xlsx` by hand — a ZIP of five XML parts over
  `node:zlib`, so the export needs no spreadsheet dependency. Its test reads
  the ZIP back rather than trusting it.
- Overview at `/admin`. Counts only — no name, no reason — because C&B lands
  there too, and the names and reasons belong to the approver's queue and the
  private link. Filing on behalf at `/admin/tao-don-ho` was removed with the
  supervisor role on 2026-08-25.
- Google Chat and the SLA run. `lib/domain/chat-messages.ts` composes every
  message and is where the two spaces differ: the guards' space carries a
  name, a time and a code, never a reason. Posting is best-effort — a Chat
  outage must not be why a request failed to file. The scheduled run is
  `/api/cron/nhac-duyet`, authorised by `CRON_SECRET`, and each nudge is
  claimed in the database before it is posted so two runs cannot double up.
  `npm run verify:reminders`. `CRON_SECRET` now holds a real value, and the
  route answers 401 without it and 200 with it. **Nothing has been posted to a
  real space yet:** `GCHAT_WEBHOOK_APPROVERS` and `GCHAT_WEBHOOK_GUARDS` are
  still empty, so the poster reports `skipped`.
- Printable sheets at `/tra-cuu/<token>/in`, reproducing both paper forms
  field for field (PRD section IX). Behind the private token like anything
  else that shows a name, and only for an approved request. A Server
  Component with no Ant Design in it — a printed page carries the form's own
  type, not a design system's.
- Zone-scoped bundles: Ant Design is loaded by `app/admin/layout.tsx` and
  `app/bao-ve/layout.tsx` only. The root layout must stay free of it, and public
  pages carry their own plain markup rather than an Ant Design shell.
  `npm run measure:js` against a production server proves it.

- `npm run verify:e2e -- http://localhost:PORT` walks one request the whole
  way — file, approve, both booth taps, the timesheet edit, the audit trail —
  over the real database and a running server, then deletes what it made.
  Unlike the other `verify:*` scripts it COMMITS, because a transaction rolled
  back is invisible to the pages it then opens over HTTP.

## Before it can be used for real

Every Phase 1 screen is built. What remains is not a screen but a connection:
the staff list, the two Chat webhooks and the booth PIN all come from the
company, and none of them is code. See "Before it can be used for real" below.

## Build order (PRD section XV)

1. ~~Foundation: project, database, admin sign-in~~ — done
2. Staff master data: C&B pastes the list, the public form can search it; roles
   for supervisors — **done** (P1). Google Directory sync replaces the paste in P9.
3. ~~Public form, one route, dynamic fields~~ — done, and rebuilt as a single
   page on 2026-08-25: the three-step wizard is gone. It searches whatever
   `lg_employee` holds, so it is live but empty until C&B pastes the list.
4. ~~Lookup page: track, withdraw, real return time; codes, tokens, QR~~ — done
5. ~~Approval queue: claim, version lock, realtime, four tabs~~ — done
6. ~~Guard booth: PIN, today's table, Cho ra / Cho vào, 5-minute undo~~ — done
7. ~~Timesheet: filters, gate-time column, mandatory adjustment reason, Excel~~ — done
8. ~~Overview screen; supervisor filing on behalf~~ — done
9. Two Google Chat spaces and the SLA reminder job — **built; `CRON_SECRET` is
   set, still waiting on the two webhook URLs**
10. ~~Printable layouts matching the paper forms~~ — done
11. ~~End-to-end run: file on a phone → approve → booth stamp → timesheet~~ — done (`npm run verify:e2e`)

## Conventions

- Table and function names are prefixed `lg_` (leave & gate).
- Migrations are numbered `NNNN_snake_case.sql` and never edited after they are
  applied — add another one.
- UI text Vietnamese, code English. Roles in code: `approver`, `cnb`,
  `supervisor`.
- Minutes are the unit end-to-end; convert to hours only at the UI edge.

## What the company still owes

Four things, none of them code. The first three are what stops the app being
used tomorrow; the fourth only silences the Chat nudges.

| Needed | Where it goes | Until then |
| --- | --- | --- |
| Staff spreadsheet — name, job title, department, employee number | C&B pastes it at `/admin/nhan-su` | `lg_employee` is empty, so the name picker on `/don` finds nobody and no request can be filed |
| A booth PIN | set once in `lg_booth` | `/bao-ve` cannot be signed into, so no gate stamp is possible |
| The four approvers', C&B's and the supervisors' `@ctyhp.vn` addresses | `lg_app_user` — 5 rows are seeded, confirm they are the right people | a wrong address means that person lands on `/admin/khong-du-quyen` |
| Two Google Chat webhook URLs | `GCHAT_WEBHOOK_APPROVERS`, `GCHAT_WEBHOOK_GUARDS` | posting reports `skipped`; nothing else is affected |

## Filing on behalf was broken, and is fixed

Found on 2026-08-25 while re-keying the handover field: `OnBehalfForm` sent
`handoverEmployeeId` from a hidden input that was always empty, and
`leaveRequestSchema` required it to be a UUID. A supervisor filing a **leave**
application therefore always got "Chọn người nhận bàn giao" and could never
submit. Gate passes were unaffected, which is why it went unnoticed.

`verify:supervisor` did not catch it because it called the database function
directly and never crossed the server action, and the render test rendered the
form without submitting it. The form asked for a handover name after that, and
the whole screen was removed a few hours later with the supervisor role — but
the lesson stands: a check that skips the server action does not cover the
server action.
