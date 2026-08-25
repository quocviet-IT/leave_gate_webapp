# Leave Application & Gate Pass System

An internal web app for CTYHP that replaces the two paper forms in use today. Employees open a
link or scan a QR code to file a request — no login; one of the four approvers claims and decides
it; the guard confirms the real times at the gate; approved requests flow to the timesheet screen.

**Status:** every Phase 1 screen is built against PRD v0.5 and verified — filing, both lookup
depths, the approval queue, the gate booth, the timesheet with its Excel export, the overview,
filing on behalf, the two Chat spaces, the SLA run and both printable forms. One request has been
walked end to end over the real database (`npm run verify:e2e`).

**Before it can be used for real,** the company still owes a PIN for the booth and the two Google
Chat webhook URLs; until the webhooks arrive the Chat poster reports `skipped` rather than failing.
A staff spreadsheet is no longer a prerequisite for filing — since 2026-08-25 the public form takes
a typed name — but supervisors filing on behalf still pick from that list. See
[AGENTS.md](AGENTS.md).

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
| Employee | `/don`, `/tra-cuu` | no login, no code — type your own name | all staff, including everyone without a company email |
| Admin | `/admin/*` | Google Workspace SSO, `@ctyhp.vn` only | four approvers · C&B · workshop supervisors |
| Gate booth | `/bao-ve` | booth PIN | the guard on duty |

`anon` holds no table permissions at all: publishing a public form must not publish the staff
directory with it. Filing, lookup, withdrawal and the booth stamps each go through a database
function that can also apply the rate limits and the booth PIN.

Since 2026-08-25 the form takes a **typed** name rather than one picked from the staff list — a
board decision that widens the impersonation risk on purpose. What still bounds it, and what got
weaker, is written out in [CLAUDE.md](CLAUDE.md) section 6 and in migration `0015`.

Two strings do different jobs and must not be confused. The **request code** (`NP-2607-0148`) is a
human reference — sequential, therefore guessable, and worth only a status when quoted. The
**lookup token** in the private link is the single secret of the public zone: it authorises reading
a request in full, withdrawing it, and entering a real return time.

## Documents

| File | Contents |
| --- | --- |
| [docs/PRD_Nghi_Phep_Ra_Vao_Cong.html](docs/PRD_Nghi_Phep_Ra_Vao_Cong.html) | PRD v0.5: the 17 board review items mapped to where each landed, three zones, roles, 9 screens, 20 business rules, Directory sync, build order, risks |
| [docs/DEMO_Nghi_Phep_Ra_Vao_Cong.html](docs/DEMO_Nghi_Phep_Ra_Vao_Cong.html) | Interactive UI demo — **still on v0.4**, predating the three zones and the gate booth screen |

Both open directly in a browser; nothing to build. The documents are in English; the interface
they describe is in Vietnamese, because that is what the staff read, so screen labels are quoted
as they appear.

## Phase 1 scope

One public form route with dynamic fields, all on one page · the person types their own name · QR codes
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

1. **A spreadsheet of staff** — name, job title, department, and the employee number as the row
   key. C&B pastes it into the admin zone; re-pasting updates in place. No longer blocks the public
   form, which takes a typed name, but supervisors filing on behalf pick from this list.
2. The official list of departments and units (it comes from the same file).
3. The list of supervisors allowed to file on behalf of workers.
4. A PIN for the booth, and confirmation that the booth has a networked machine.
