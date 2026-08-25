# `/don` as a single page

**Date:** 2026-08-25 · **Status:** approved · **Supersedes:** the three-step wizard in `lib/domain/form-steps.ts`

## Why

Filing takes three screens for leave and two for a gate pass, each one a page
load carrying the answers so far in the query string. The staff this is built
for file a request standing in a workshop on a phone, and every extra screen is
somewhere to abandon.

The wizard was built to keep the form usable without JavaScript. That reason no
longer holds: `NamePicker` is a client component that queries Supabase over RPC,
so a browser with no JavaScript has never been able to choose a name — which is
the first thing the form asks. Splitting the page bought nothing it was meant to
buy.

## What changes

`/don` becomes one page: a kind toggle, the name picker, the fields for the
chosen kind, and one **Gửi đơn** button. `?buoc=` disappears.

Choosing a kind swaps the field group in place, with no page load. The two
groups **unmount** rather than hide — an unmounted input is absent from the
`FormData`, so a gate request cannot carry a stray leave date. Hiding with CSS
would mean toggling `disabled` on every field of the inactive group, which is a
correctness detail that is easy to get wrong once and never notice.

Conditional fields follow the same rule as the supervisor's form: "Ghi rõ lý do"
appears only when the reason needs it (`special` or `other` for leave, `other`
for a gate pass). "Ngày làm bù" stays visible, marked as optional.

## Structure

| File | Responsibility |
| --- | --- |
| `app/(public)/don/page.tsx` | server wrapper, renders `<RequestForm />` and nothing else |
| `components/public/RequestForm.tsx` | owns `kind` and `reason` state; renders the toggle, the identity picker and whichever field group applies |
| `components/public/LeaveFields.tsx` | the leave field group, presentational |
| `components/public/GateFields.tsx` | the gate field group, presentational |
| `lib/domain/form-steps.ts` | **deleted** |

`SubmitForm`, `NamePicker` and `HoursLine` are reused unchanged. `HoursLine`
already takes `kind` as a prop and lists it in its effect's dependencies, so it
recalculates when the toggle moves.

This mirrors `components/admin/OnBehalfForm.tsx`, which has always been a
single-page form with a kind radio — the public zone was the odd one out.

## Validation

Unchanged. `fileRequestAction` already parses the whole payload with
`leaveRequestSchema` / `gateRequestSchema` and returns errors keyed by field,
and `ActionFieldError` already renders them beside each input.

`validateStep` is deleted rather than kept, because it is a second copy of those
same rules — the working rulebook's "one place for a rule" applies to input
validation as much as to working hours. Nothing else imports it.

## Testing

- `tests/unit/request-form-render.test.tsx` renders the client component to
  static markup: one form and one submit button; leave fields present by
  default; gate fields present after the toggle moves and leave fields gone;
  "Ghi rõ lý do" absent until a reason that needs it is chosen. The test must be
  shown failing before the component is written.
- `tests/unit/form-steps.test.ts` is deleted with the module it covers.
- `scripts/smoke-pages.mjs` drops the three `?buoc=` URLs and keeps `/don`.

## Risk

`/don` measures 150.1 KB against the 160 KB public budget, leaving ~10 KB. One
page now carries both field groups and two `NamePicker` instances where three
pages carried them separately. The modules are shared, so the increase should be
small, but `npm run measure:js` decides it. If the budget is exceeded the answer
is to fix it, not to raise the budget.
