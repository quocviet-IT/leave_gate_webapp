# Agent notes

See [CLAUDE.md](CLAUDE.md) for the working rulebook — run commands, verification
gates, architecture, gotchas. This file holds only what is specific to picking up
work here.

## State of the build

The scaffold is in place and verified: build, typecheck, lint and 63 unit tests
pass, migrations `0001`–`0002` are applied to the live Supabase project, and all
10 routes answer correctly (`scripts/smoke-pages.mjs`).

What exists for real:

- Working-time arithmetic, the SLA clock, request codes and lookup tokens, and
  every input schema — with unit tests taken from the PRD's own examples.
- Database foundation: tables, constraints, indexes, RLS with `anon` denied
  everywhere, role helpers, per-month code sequence, version-bump trigger.
- Route tree for all three zones, with the admin auth boundary enforced.
- Google sign-in for the admin zone.

What is a labelled placeholder: the screens themselves. Each unbuilt route
renders `components/ScreenSkeleton.tsx`, which names the build step from PRD
section XV and lists what the finished screen holds. Replace one skeleton at a
time, in the PRD's order.

## Build order (PRD section XV)

1. ~~Foundation: project, database, admin sign-in~~ — done
2. Directory sync and employee codes; roles for supervisors
3. Public form, one route, dynamic fields — **blocked: no employee-code source**
4. Lookup page: track, withdraw, real return time; codes, tokens, QR
5. Approval queue: claim, version lock, realtime, four tabs
6. Guard booth: PIN, today's table, Cho ra / Cho vào, 5-minute undo
7. Timesheet: filters, gate-time column, mandatory adjustment reason, Excel
8. Overview screen; supervisor filing on behalf
9. Two Google Chat spaces and the SLA reminder job
10. Printable layouts matching the paper forms
11. End-to-end run: file on a phone → approve → booth stamp → timesheet

## Conventions

- Table and function names are prefixed `lg_` (leave & gate).
- Migrations are numbered `NNNN_snake_case.sql` and never edited after they are
  applied — add another one.
- UI text Vietnamese, code English. Roles in code: `approver`, `cnb`,
  `supervisor`.
- Minutes are the unit end-to-end; convert to hours only at the UI edge.
