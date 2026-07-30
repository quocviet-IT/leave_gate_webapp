# Nghỉ phép & Ra vào cổng — AI working rulebook

The product replaces two paper forms at CTYHP: the leave application and the
gate pass. Everything a user reads is **Vietnamese**; code, identifiers, commit
messages and comments are **English**.

This is a different system from the accounting app (`QUICKBOOK_WEBAPP`) — separate
repo, separate Supabase project, separate accounts. Never point them at one
database, and never copy accounting data in.

The spec is [docs/PRD_Nghi_Phep_Ra_Vao_Cong.html](docs/PRD_Nghi_Phep_Ra_Vao_Cong.html),
v0.5. Section numbers below refer to it. When code and PRD disagree, one of them
is wrong — say so, do not silently pick.

## 1. Run commands (exact)

- Dev: `npm run dev`
- Build: `npm run build`
- Test: `npm test`
- Typecheck: `npm run typecheck`
- Lint: `npm run lint`
- Apply migrations: `npm run migrate`
- Smoke every route: `node scripts/smoke-pages.mjs http://localhost:PORT`

## 2. How to verify (mandatory before claiming "done")

- Run build + test + typecheck + lint, zero errors, and paste the real output.
- UI change: also run `scripts/smoke-pages.mjs` against a running dev server.
  The four gates above all pass on a page that throws at render time.
  **Check which port the dev server actually took** — the accounting app often
  holds 3000, and smoking the wrong app produces confident nonsense.
- Time or hours logic: add a unit test in `tests/unit/` with concrete
  input/output taken from PRD section XI. Never verify by "looks right in the UI".
- Migration: `npm run migrate` is idempotent; re-run it and confirm the second
  run reports `skip`.

## 3. Architecture & where logic lives

Three zones, three ways in (PRD III). This shapes everything:

| Zone | Routes | Way in |
| --- | --- | --- |
| Employee, public | `/don`, `/tra-cuu` | none at all — a name chosen from the staff list |
| Admin | `/admin/*` | Google Workspace SSO, domain `ctyhp.vn` |
| Guard booth | `/bao-ve` | booth PIN |

- Pure rules: `lib/domain/` — `workhours.ts` (all working-time arithmetic),
  `sla.ts` (reminder clock), `codes.ts` (request codes, lookup tokens, employee
  code matching), `schemas.ts` (Zod, every write crosses one).
- Database access: `lib/db/server.ts` (as the user, RLS applies),
  `lib/db/client.ts` (browser, also used for the realtime approval queue),
  `lib/db/admin.ts` (service role — Directory sync and the scheduled reminder run
  only).
- Auth and role guards: `lib/auth.ts`. Admin pages sit under
  `app/admin/(guarded)/`; `dang-nhap` and `khong-du-quyen` sit outside it.
- Writes go through Postgres functions in `supabase/migrations/`, not through
  table policies. `anon` deliberately has **no** table access: a public form must
  not publish the staff directory. Name search, submit, lookup, withdraw and the
  booth stamps are all SECURITY DEFINER functions, which is where the rate limits
  and the booth PIN are enforced.
- **The request code proves nothing.** It is sequential. Any path taking a
  request code answers with a status only; full detail, withdrawal and real-return
  edits require the 128-bit lookup token from the private link. Never widen this.
- The employee number keys the staff import and must never reach a browser.
- DO NOT re-implement a working-hours or SLA rule anywhere else. One place.

## 4. Gotchas / past mistakes (append when a bug recurs)

- A Server Component must not read an Ant Design *sub*-component
  (`Typography.Title`, `Form.Item`, `Input.TextArea`, …). antd ships
  `"use client"`, so the server gets client-reference proxies and reading a static
  property off one throws at render time. Plain components (`Button`, `Card`,
  `Alert`) are fine. Keep `page.tsx` a thin server wrapper. Guarded by
  `tests/unit/rsc-antd.test.ts`.
- Running `npm run build` then `npm run dev` over the same `.next` makes nested
  routes 404 in dev while single-segment routes still work. Delete `.next` first.
- The plain Postgres port is blocked on the office network. `SUPABASE_DB_URL` must
  be the **session-mode pooler** (`postgres.<ref>@aws-0-<region>.pooler.supabase.com:5432`).
- Sunday is the only non-working day, and Saturday **is** a working day. A
  reminder clock that treats the weekend as two days off computes the wrong time.
- All timestamps are ICT (+07:00), including in exported files. Vietnam has no
  daylight saving, so a fixed offset is exact — but never build a `Date` from a
  local string without the offset.

## 5. Things NOT to do

- Never force-push to `main`.
- Never grant `anon` a table policy "just to test" the public form.
- Never let a booth screen show a leave reason (PRD rule 14 and 19).
- Never let a final-hours edit save without a reason (PRD rule 16).
- Never trust a client-sent hours figure — recompute with `lib/domain/workhours.ts`.
- Never swallow an error (empty catch, ignoring `{ error }`).

## 6. Open questions the board still owns

1. Anyone who can open the public link can file under another person's name
   (PRD v0.6 rule 3). Mitigations shipped: names only from the staff list, 5 per
   employee per day, one per device per minute, device fingerprint in the audit
   log, and the approval screen showing the person's recent requests. The
   residual gap — an impersonated person cannot discover the request — is
   accepted. Closing it needs company email for everyone, or a shared department
   PIN on the form.
2. Nobody can be chosen on the public form until C&B pastes a staff list.
   That is the only remaining prerequisite, and it is a spreadsheet.
