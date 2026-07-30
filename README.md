# Leave Application & Gate Pass System

An internal web app for CTYHP that replaces the two paper forms in use today. Employees open a
link or scan a QR code to file a request — no login; one of the four approvers claims and decides
it; the guard confirms the real times at the gate; approved requests flow to the timesheet screen.

**Status:** PRD v0.5 (draft) plus a working scaffold. The database foundation is applied to
Supabase and the working-time, SLA and request-code logic is in place with tests. The screens
themselves are labelled placeholders — see [AGENTS.md](AGENTS.md) for what comes next.

```bash
npm install
cp .env.local.example .env.local   # fill in the Supabase URL and keys
npm run migrate                    # apply migrations
npm run dev
```

Four gates: `npm run build` · `npm test` · `npm run typecheck` · `npm run lint`, plus
`node scripts/smoke-pages.mjs http://localhost:3000` after any UI change.

## Three access zones

The whole design follows from these, so nothing is shared between them by accident.

| Zone | Routes | Way in | Who |
| --- | --- | --- | --- |
| Employee | `/don`, `/tra-cuu` | no login — pick a name, type a matching employee code | all staff, including everyone without a company email |
| Admin | `/admin/*` | Google Workspace SSO, `@ctyhp.vn` only | four approvers · C&B · workshop supervisors |
| Gate booth | `/bao-ve` | booth PIN | the guard on duty |

`anon` holds no table permissions at all: publishing a public form must not publish the staff
directory with it. Name search, filing, lookup, withdrawal and the booth stamps each go through a
database function that can also enforce the employee code, the booth PIN and rate limits.

## Documents

| File | Contents |
| --- | --- |
| [docs/PRD_Nghi_Phep_Ra_Vao_Cong.html](docs/PRD_Nghi_Phep_Ra_Vao_Cong.html) | PRD v0.5: the 17 board review items mapped to where each landed, three zones, roles, 9 screens, 20 business rules, Directory sync, build order, risks |
| [docs/DEMO_Nghi_Phep_Ra_Vao_Cong.html](docs/DEMO_Nghi_Phep_Ra_Vao_Cong.html) | Interactive UI demo — **still on v0.4**, predating the three zones and the gate booth screen |

Both open directly in a browser; nothing to build. The documents are in English; the interface
they describe is in Vietnamese, because that is what the staff read, so screen labels are quoted
as they appear.

## Phase 1 scope

One public form route with dynamic fields · identification by name plus employee code · QR codes
for the workshops · lookup page (track, withdraw, real return time, print) · approval queue with
Claim and a lock against double approval · four personal tabs · supervisors filing on behalf ·
gate booth screen with Cho ra / Cho vào · two Google Chat spaces · SLA reminders at 1 h and 2 h ·
computed hours · timesheet (filters, Excel, mandatory adjustment reason) · Google Workspace
Directory sync · print layouts matching the paper forms · works on a phone.

Left to Phase 2: automatic public-holiday deduction, remaining annual leave, a payroll feed,
direct Chat messages, per-request QR scanning at the gate, named sign-in for guards, an HR-facing
admin screen for departments and staff, approval rights scoped by department.

## Technology

Next.js 16 · React 19 · Ant Design 6 · Supabase (Postgres, authorisation in the database for all
three zones) · Google Workspace SSO for the admin zone · a booth PIN for the gate · Google Chat
webhooks (two spaces) · Vercel.

## Relationship to the accounting app

This is a **separate system** from the CTYHP accounting app (`QUICKBOOK_WEBAPP`): its own repo,
its own database, its own accounts. Employees using this app cannot reach accounting data.

## Missing before work can start

1. **A source for the employee codes** — Google Directory has no such field, and the employee code
   is what stands in for a password on the public form. Without it, step 3 of the build order
   cannot run.
2. The official list of departments and units.
3. The list of supervisors allowed to file on behalf of workers.
4. A PIN for the booth, and confirmation that the booth has a networked machine.
