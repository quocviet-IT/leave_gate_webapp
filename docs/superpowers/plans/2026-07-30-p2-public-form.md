# P2 — Public Form Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A worker scans a QR code on a noticeboard, picks their name, fills three short steps, and receives a request code with a private tracking link — no login anywhere.

**Architecture:** The form is server-rendered across three steps carried in the URL, so the public zone stays free of Ant Design and of form-state JavaScript. The only client component is the line that shows the computed hours as dates change, and it imports the same pure functions the server uses. Filing goes through a Server Action to a `service_role`-only SQL function: the anon key is public, so a browser must not be able to reach the write path at all.

**Tech Stack:** Next.js 16 · React 19 · Supabase Postgres · Zod · Vitest · `qrcode` for server-rendered SVG.

## Global Constraints

- UI text Vietnamese; code, comments and commit messages English.
- **The public zone must not import Ant Design.** First-load JS ≤ 160 KB gzip on `/`, `/don`, `/tra-cuu`, proven by `npm run measure:js` against a production server.
- `anon` gets no table policy and no write function. Writes are `service_role` only, called from Server Actions.
- The request code proves nothing (it is sequential). Only the 32-hex lookup token authorises reading a request in full.
- Hours are computed once, by `lib/domain/workhours.ts`, and written to a column nobody can edit. Never recompute the rule in SQL or in the browser.
- Minutes are the unit end-to-end; convert at the UI edge only.
- Nothing is deleted; every state change records who and when.
- Migrations are numbered and never edited after they are applied.
- Verification gates: `npm run build`, `npm test`, `npm run typecheck`, `npm run lint`, `node scripts/smoke-pages.mjs`, `npm run verify:submit`, `npm run measure:js`.

**PRD rules covered:** 1 (filing needs nothing, reading needs the link), 3 (rate-limited not gated), 18 (nothing deleted), and the field lists in section X.

**"Minimal" means** — decided with the board on 30/07/2026: every field on the paper form is kept, so the printed copy still matches and HR keys in nothing. The form feels minimal because each step asks two or three things and optional fields sit behind a disclosure. It does not mean dropping fields.

---

### Task 1: The filing function and its rate limits

**Files:**
- Create: `supabase/migrations/0004_submit_request.sql`
- Create: `scripts/verify-submit.mjs`
- Modify: `package.json` — add `verify:submit`

**Interfaces:**
- Consumes: `lg_request`, `lg_leave_detail`, `lg_gate_detail`, `lg_employee`, `lg_audit`, `lg_next_request_sequence` from 0001/0003
- Produces:
  - `lg_submit_request(p_employee_id uuid, p_kind lg_request_kind, p_detail jsonb, p_computed_minutes int, p_device_hash text) returns jsonb` — `{"code": "NP-2607-0148", "token": "…32 hex…"}`; raises on rate limit, unknown or inactive employee
  - `lg_status_by_code(p_code text) returns text` — the status label only, or null
  - `lg_submit_attempt` table — one row per filing, keyed for the two limits

- [ ] **Step 1: Write the failing verification script**

Create `scripts/verify-submit.mjs`:

```js
// End-to-end check of filing: the codes, the token, the two rate limits, and the
// deliberate poverty of the status-by-code path. One transaction, rolled back.
//
// Run: npm run verify:submit
import pg from "pg";

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("SUPABASE_DB_URL chưa được đặt (dùng node --env-file=.env.local).");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
let passed = 0;
let failed = 0;

function check(name, condition, detail = "") {
  if (condition) { passed++; console.log(`ok   ${name}`); }
  else { failed++; console.log(`FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
}

async function expectRaise(sql, params) {
  await client.query("savepoint sp");
  try {
    await client.query(sql, params);
    await client.query("rollback to savepoint sp");
    return false;
  } catch {
    await client.query("rollback to savepoint sp");
    return true;
  }
}

const LEAVE = {
  fromDate: "2026-07-30",
  toDate: "2026-08-01",
  halfDay: null,
  reason: "annual",
  reasonText: "",
  note: "Về quê thăm gia đình",
  handoverEmployeeId: null,
  makeupDate: null,
};

async function main() {
  await client.connect();
  await client.query("begin");

  const emp = await client.query(
    `insert into lg_employee (code, full_name, title, department, active)
     values ('ZZSUB01', 'Nguyễn Văn Thử', 'Công nhân', 'Sản xuất', true) returning id`,
  );
  const employeeId = emp.rows[0].id;

  const first = await client.query(
    "select lg_submit_request($1::uuid, 'leave', $2::jsonb, $3::int, $4) as r",
    [employeeId, JSON.stringify(LEAVE), 24 * 60, "device-a"],
  );
  const filed = first.rows[0].r;

  check("filing returns a request code", /^NP-\d{4}-\d{4}$/.test(filed.code ?? ""), filed.code);
  check("filing returns a 32-hex token", /^[0-9a-f]{32}$/.test(filed.token ?? ""), filed.token);

  const row = await client.query(
    "select status, computed_minutes, employee_snapshot from lg_request where code = $1",
    [filed.code],
  );
  check("the request starts pending", row.rows[0].status === "pending", row.rows[0].status);
  check("the computed hours are stored", row.rows[0].computed_minutes === 1440, String(row.rows[0].computed_minutes));
  check(
    "the name is snapshotted at filing",
    row.rows[0].employee_snapshot.full_name === "Nguyễn Văn Thử",
    JSON.stringify(row.rows[0].employee_snapshot),
  );

  const detail = await client.query(
    "select l.reason, l.note from lg_leave_detail l join lg_request r on r.id = l.request_id where r.code = $1",
    [filed.code],
  );
  check("the leave detail is stored", detail.rows[0].reason === "annual", JSON.stringify(detail.rows[0]));

  // The status path is deliberately poor: a status, nothing else.
  const status = await client.query("select lg_status_by_code($1) as s", [filed.code]);
  check("status by code answers with a status", status.rows[0].s === "pending", status.rows[0].s);
  const unknown = await client.query("select lg_status_by_code('NP-2607-9999') as s");
  check("status by code says nothing about an unknown code", unknown.rows[0].s === null, String(unknown.rows[0].s));

  // One filing per device per minute.
  const throttled = await expectRaise(
    "select lg_submit_request($1::uuid, 'leave', $2::jsonb, $3::int, $4)",
    [employeeId, JSON.stringify(LEAVE), 480, "device-a"],
  );
  check("a second filing from the same device within a minute is refused", throttled);

  // Five a day per employee: four more from other devices, then the sixth fails.
  for (let i = 2; i <= 5; i++) {
    await client.query("select lg_submit_request($1::uuid, 'leave', $2::jsonb, $3::int, $4)", [
      employeeId,
      JSON.stringify(LEAVE),
      480,
      `device-${i}`,
    ]);
  }
  const capped = await expectRaise(
    "select lg_submit_request($1::uuid, 'leave', $2::jsonb, $3::int, $4)",
    [employeeId, JSON.stringify(LEAVE), 480, "device-6"],
  );
  check("a sixth filing in one day is refused", capped);

  // A leaver cannot be filed for, even with a valid id.
  await client.query("update lg_employee set active = false where id = $1", [employeeId]);
  const inactive = await expectRaise(
    "select lg_submit_request($1::uuid, 'leave', $2::jsonb, $3::int, $4)",
    [employeeId, JSON.stringify(LEAVE), 480, "device-7"],
  );
  check("an inactive employee cannot be filed for", inactive);

  // anon must not be able to reach the write path at all.
  const grants = await client.query(
    `select has_function_privilege('anon', 'lg_submit_request(uuid, lg_request_kind, jsonb, integer, text)', 'execute') as anon_can`,
  );
  check("anon cannot execute lg_submit_request", grants.rows[0].anon_can === false);

  await client.query("rollback");
  console.log(`\n${passed} đạt, ${failed} không đạt.`);
  process.exitCode = failed === 0 ? 0 : 1;
}

main()
  .catch((err) => { console.error("\nLỗi:", err.message); process.exitCode = 1; })
  .finally(() => client.end());
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --env-file=.env.local scripts/verify-submit.mjs`
Expected: FAIL — `Lỗi: function lg_submit_request(uuid, lg_request_kind, jsonb, integer, text) does not exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0004_submit_request.sql`:

```sql
-- Filing from the public form (PRD sections III and X, rules 1, 3 and 18).
--
-- Granted to service_role only. The anon key ships to the browser, so any
-- function anon may execute is callable directly with hand-made arguments — which
-- would let someone file with computed_minutes of their choosing. The Server
-- Action is the only caller, and it computes the hours with
-- lib/domain/workhours.ts so that rule lives in exactly one place.
--
-- What stays in SQL is what must be atomic under concurrency: the per-month code
-- sequence and the two rate limits.

create table lg_submit_attempt (
  id           bigint generated always as identity primary key,
  employee_id  uuid not null references lg_employee (id),
  -- Coarse throttle key: a hash of address, user agent and the day. Not identity,
  -- and deliberately not reversible.
  device_hash  text not null,
  at           timestamptz not null default now()
);

create index lg_submit_attempt_employee_idx on lg_submit_attempt (employee_id, at desc);
create index lg_submit_attempt_device_idx on lg_submit_attempt (device_hash, at desc);

alter table lg_submit_attempt enable row level security;

create function lg_submit_request(
  p_employee_id      uuid,
  p_kind             lg_request_kind,
  p_detail           jsonb,
  p_computed_minutes int,
  p_device_hash      text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee   lg_employee;
  v_code       text;
  v_token      text;
  v_sequence   int;
  v_period     text;
  v_prefix     text;
  v_request_id uuid;
  v_today      date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  select * into v_employee from lg_employee where id = p_employee_id;
  if not found or not v_employee.active then
    raise exception 'Không tìm thấy người này trong danh sách nhân sự';
  end if;

  if p_computed_minutes < 0 or p_computed_minutes > 60 * 24 * 40 then
    raise exception 'Số phút không hợp lệ';
  end if;

  -- One filing per device per minute.
  if exists (
    select 1 from lg_submit_attempt
    where device_hash = p_device_hash and at > now() - interval '1 minute'
  ) then
    raise exception 'Bạn vừa gửi một đơn. Đợi một phút rồi gửi tiếp.';
  end if;

  -- Five per employee per day, counted in company time.
  if (
    select count(*) from lg_submit_attempt
    where employee_id = p_employee_id
      and (at at time zone 'Asia/Ho_Chi_Minh')::date = v_today
  ) >= 5 then
    raise exception 'Mỗi người gửi tối đa 5 đơn một ngày';
  end if;

  v_prefix := case p_kind when 'leave' then 'NP' else 'RC' end;
  v_period := to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYMM');
  v_sequence := lg_next_request_sequence(v_prefix, v_period);
  v_code := v_prefix || '-' || v_period || '-' || lpad(v_sequence::text, 4, '0');
  v_token := encode(gen_random_bytes(16), 'hex');

  insert into lg_request (
    code, kind, status, employee_id, employee_snapshot, lookup_token, computed_minutes
  )
  values (
    v_code, p_kind, 'pending', p_employee_id,
    jsonb_build_object(
      'full_name', v_employee.full_name,
      'title', v_employee.title,
      'department', v_employee.department,
      'code', v_employee.code
    ),
    v_token, p_computed_minutes
  )
  returning id into v_request_id;

  if p_kind = 'leave' then
    insert into lg_leave_detail (
      request_id, from_date, to_date, half_day, reason, reason_text, note,
      handover_employee_id, makeup_date
    )
    values (
      v_request_id,
      (p_detail ->> 'fromDate')::date,
      (p_detail ->> 'toDate')::date,
      nullif(p_detail ->> 'halfDay', '')::lg_half_day,
      (p_detail ->> 'reason')::lg_leave_reason,
      nullif(p_detail ->> 'reasonText', ''),
      p_detail ->> 'note',
      nullif(p_detail ->> 'handoverEmployeeId', '')::uuid,
      nullif(p_detail ->> 'makeupDate', '')::date
    );
  else
    insert into lg_gate_detail (
      request_id, reason, reason_text, note, out_at, expected_in_at
    )
    values (
      v_request_id,
      (p_detail ->> 'reason')::lg_gate_reason,
      nullif(p_detail ->> 'reasonText', ''),
      p_detail ->> 'note',
      (p_detail ->> 'outAt')::timestamptz,
      (p_detail ->> 'expectedInAt')::timestamptz
    );
  end if;

  insert into lg_submit_attempt (employee_id, device_hash) values (p_employee_id, p_device_hash);

  insert into lg_audit (entity, entity_id, action, actor, detail)
  values ('lg_request', v_request_id::text, 'submit', 'public',
          jsonb_build_object('code', v_code, 'kind', p_kind, 'device', p_device_hash));

  return jsonb_build_object('code', v_code, 'token', v_token);
end;
$$;

comment on function lg_submit_request(uuid, lg_request_kind, jsonb, int, text) is
  'Files a request from the public form. service_role only — never grant to anon.';

revoke all on function lg_submit_request(uuid, lg_request_kind, jsonb, int, text) from public;
grant execute on function lg_submit_request(uuid, lg_request_kind, jsonb, int, text) to service_role;

-- Quoting a request code proves nothing, so this answers with a status and
-- nothing else: no name, no dates, no reason (rule 1).
create function lg_status_by_code(p_code text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select status::text from lg_request where code = upper(btrim(coalesce(p_code, '')));
$$;

comment on function lg_status_by_code(text) is
  'Status of a request by its printed code. Reveals nothing else, by design.';

revoke all on function lg_status_by_code(text) from public;
grant execute on function lg_status_by_code(text) to anon, authenticated, service_role;
```

- [ ] **Step 4: Apply and verify**

Run: `npm run migrate`
Expected: `apply 0004_submit_request.sql ... ok`

Run: `npm run migrate` again
Expected: `skip  0004_submit_request.sql (đã áp dụng)`

Add to `package.json` scripts, after `verify:employees`:

```json
    "verify:submit": "node --env-file=.env.local scripts/verify-submit.mjs",
```

Run: `npm run verify:submit`
Expected: `15 đạt, 0 không đạt.` (12 as first written, plus the three privilege-surface checks added when the first run found every `lg_` function reachable by `anon`.)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0004_submit_request.sql scripts/verify-submit.mjs package.json
git commit -m "Add the filing function with its rate limits"
```

---

### Task 2: Device throttle key and the filing service

**Files:**
- Create: `lib/device.ts`
- Create: `lib/services/requests.ts`
- Test: `tests/unit/device.test.ts`

**Interfaces:**
- Produces:
  - `deviceHash(headers: Headers, todayIct: string): Promise<string>` — 32 hex characters
  - `fileRequest(input: { employeeId: string; kind: "leave" | "gate"; detail: object; computedMinutes: number; deviceHash: string }): Promise<{ code: string; token: string }>`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/device.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { deviceHash } from "@/lib/device";

function headers(init: Record<string, string>): Headers {
  return new Headers(init);
}

describe("device throttle key", () => {
  const a = headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8", "user-agent": "Chrome" });

  it("is 32 hex characters", async () => {
    expect(await deviceHash(a, "2026-07-30")).toMatch(/^[0-9a-f]{32}$/);
  });

  it("is stable for the same device on the same day", async () => {
    expect(await deviceHash(a, "2026-07-30")).toBe(await deviceHash(a, "2026-07-30"));
  });

  it("rotates daily, so yesterday's key cannot be replayed", async () => {
    expect(await deviceHash(a, "2026-07-30")).not.toBe(await deviceHash(a, "2026-07-31"));
  });

  it("uses the first address in x-forwarded-for, not the proxy chain", async () => {
    const b = headers({ "x-forwarded-for": "1.2.3.4, 9.9.9.9", "user-agent": "Chrome" });
    expect(await deviceHash(b, "2026-07-30")).toBe(await deviceHash(a, "2026-07-30"));
  });

  it("separates two different devices", async () => {
    const b = headers({ "x-forwarded-for": "1.2.3.5", "user-agent": "Chrome" });
    expect(await deviceHash(b, "2026-07-30")).not.toBe(await deviceHash(a, "2026-07-30"));
  });

  it("still returns a key when the headers are missing", async () => {
    expect(await deviceHash(headers({}), "2026-07-30")).toMatch(/^[0-9a-f]{32}$/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/device.test.ts`
Expected: FAIL — cannot resolve `@/lib/device`.

- [ ] **Step 3: Write the implementation**

Create `lib/device.ts`:

```ts
import "server-only";

/**
 * A coarse key for throttling the public form.
 *
 * It is not identity and must not be treated as such: a whole workshop behind one
 * router shares an address, and a determined person changes theirs. It exists to
 * stop the accidental double-tap and the crude flood, which is what rule 3 asks
 * of it. The day is mixed in so a key cannot be replayed across days, and the
 * result is a hash so the audit log never carries a raw address.
 */
export async function deviceHash(headers: Headers, todayIct: string): Promise<string> {
  const forwarded = headers.get("x-forwarded-for") ?? "";
  const address = forwarded.split(",")[0]?.trim() || "unknown";
  const agent = headers.get("user-agent") ?? "unknown";
  const material = `${address}|${agent}|${todayIct}`;

  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
  return [...new Uint8Array(digest)]
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
```

Create `lib/services/requests.ts`:

```ts
import "server-only";
import { createSupabaseAdminClient } from "@/lib/db/admin";

export type FileRequestInput = {
  employeeId: string;
  kind: "leave" | "gate";
  detail: Record<string, unknown>;
  /** Computed by lib/domain/workhours.ts on the server. Never sent by a browser. */
  computedMinutes: number;
  deviceHash: string;
};

export type FiledRequest = { code: string; token: string };

/**
 * Files a request. Uses the service-role client on purpose: `lg_submit_request`
 * is granted to service_role only, so the browser cannot reach it even though it
 * holds the anon key.
 */
export async function fileRequest(input: FileRequestInput): Promise<FiledRequest> {
  const sb = createSupabaseAdminClient();
  const { data, error } = await sb.rpc("lg_submit_request", {
    p_employee_id: input.employeeId,
    p_kind: input.kind,
    p_detail: input.detail,
    p_computed_minutes: input.computedMinutes,
    p_device_hash: input.deviceHash,
  });
  if (error) throw new Error(error.message);
  const filed = data as FiledRequest | null;
  if (!filed?.code || !filed?.token) throw new Error("Gửi đơn không trả về mã đơn");
  return filed;
}

/** Status of a request by its printed code. Reveals nothing else, by design. */
export async function statusByCode(code: string): Promise<string | null> {
  const sb = createSupabaseAdminClient();
  const { data, error } = await sb.rpc("lg_status_by_code", { p_code: code });
  if (error) throw new Error(error.message);
  return (data as string | null) ?? null;
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/unit/device.test.ts`
Expected: PASS — 6 tests.

Run: `npm test` · `npm run typecheck` · `npm run lint`
Expected: all clean.

- [ ] **Step 5: Commit**

```bash
git add lib/device.ts lib/services/requests.ts tests/unit/device.test.ts
git commit -m "Add the device throttle key and the filing service"
```

---

### Task 3: The three-step form

Steps live in the URL (`/don`, `/don?buoc=2&…`), so the browser needs no form-state JavaScript and the public budget holds. One small client component shows the computed hours, importing the same pure functions the server uses.

**Files:**
- Create: `lib/domain/form-steps.ts` — which fields belong to which step, and per-step validation
- Create: `components/public/NamePicker.tsx` — `"use client"`, the only interactive control in step 1
- Create: `components/public/HoursLine.tsx` — `"use client"`, the live computed-hours line
- Create: `app/(public)/don/actions.ts` — the Server Action that files
- Modify: `app/(public)/don/page.tsx` — replace the placeholder with the real form
- Test: `tests/unit/form-steps.test.ts`

**Interfaces:**
- Consumes: `parseEmployeeList` is *not* used here; `computeLeaveMinutes`, `computeGateMinutes`, `minutesToHours` from `lib/domain/workhours.ts`; `leaveRequestSchema`, `gateRequestSchema`, `submitterSchema` from `lib/domain/schemas.ts`; `deviceHash` from `lib/device.ts`; `fileRequest` from `lib/services/requests.ts`; `lg_search_employees` via the anon client
- Produces:
  - `type FormStep = 1 | 2 | 3`
  - `stepFieldsFor(kind: "leave" | "gate", step: FormStep): string[]`
  - `validateStep(kind, step, values: Record<string, string>): { ok: boolean; errors: Record<string, string> }`
  - `fileRequestAction(previous: FileState, formData: FormData): Promise<FileState>` where `FileState = { ok: boolean; message: string; errors: Record<string, string>; filed?: { code: string; token: string } }`

- [ ] **Step 1: Write the failing test for the step map**

Create `tests/unit/form-steps.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { stepFieldsFor, validateStep } from "@/lib/domain/form-steps";

describe("which fields belong to which step", () => {
  it("asks only for the form type and the name first", () => {
    expect(stepFieldsFor("leave", 1)).toEqual(["kind", "employeeId"]);
    expect(stepFieldsFor("gate", 1)).toEqual(["kind", "employeeId"]);
  });

  it("asks the leave essentials second", () => {
    expect(stepFieldsFor("leave", 2)).toEqual(["fromDate", "toDate", "halfDay", "reason", "reasonText", "note"]);
  });

  it("asks the gate essentials second", () => {
    expect(stepFieldsFor("gate", 2)).toEqual(["reason", "reasonText", "outAt", "expectedInAt", "note"]);
  });

  it("leaves handover, make-up day and the undertaking to the last step", () => {
    expect(stepFieldsFor("leave", 3)).toEqual(["handoverEmployeeId", "makeupDate", "committed"]);
  });

  it("has nothing left to ask a gate pass on the last step", () => {
    expect(stepFieldsFor("gate", 3)).toEqual([]);
  });
});

describe("per-step validation", () => {
  it("refuses to leave step 1 without a chosen name", () => {
    const result = validateStep("leave", 1, { kind: "leave", employeeId: "" });
    expect(result.ok).toBe(false);
    expect(result.errors.employeeId).toBe("Chọn tên của bạn trong danh sách");
  });

  it("refuses an end date before the start date", () => {
    const result = validateStep("leave", 2, {
      fromDate: "2026-08-01",
      toDate: "2026-07-30",
      reason: "annual",
      note: "x",
    });
    expect(result.ok).toBe(false);
    expect(result.errors.toDate).toMatch(/từ ngày bắt đầu/);
  });

  it("demands the free-text reason for 'other'", () => {
    const result = validateStep("leave", 2, {
      fromDate: "2026-07-30",
      toDate: "2026-07-30",
      reason: "other",
      reasonText: "",
      note: "x",
    });
    expect(result.ok).toBe(false);
    expect(result.errors.reasonText).toBeTruthy();
  });

  it("refuses a gate return before the exit", () => {
    const result = validateStep("gate", 2, {
      reason: "business_trip",
      outAt: "2026-07-30T14:00:00+07:00",
      expectedInAt: "2026-07-30T10:00:00+07:00",
      note: "x",
    });
    expect(result.ok).toBe(false);
    expect(result.errors.expectedInAt).toBeTruthy();
  });

  it("accepts a complete leave step 2", () => {
    expect(
      validateStep("leave", 2, {
        fromDate: "2026-07-30",
        toDate: "2026-08-01",
        reason: "annual",
        note: "Về quê",
      }).ok,
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/form-steps.test.ts`
Expected: FAIL — cannot resolve `@/lib/domain/form-steps`.

- [ ] **Step 3: Implement the step map**

Create `lib/domain/form-steps.ts`:

```ts
/**
 * The shape of the public form: three steps, each asking two or three things.
 *
 * Every field on the paper form is kept (PRD section X) — "minimal" was decided to
 * mean fewer questions per screen, not fewer questions. Optional fields sit in the
 * last step behind a disclosure, so a worker who has nothing to add taps straight
 * through it.
 */

import { z } from "zod";
import { GATE_REASONS, LEAVE_REASONS } from "./schemas";

export type RequestKind = "leave" | "gate";
export type FormStep = 1 | 2 | 3;

const STEPS: Record<RequestKind, Record<FormStep, string[]>> = {
  leave: {
    1: ["kind", "employeeId"],
    2: ["fromDate", "toDate", "halfDay", "reason", "reasonText", "note"],
    3: ["handoverEmployeeId", "makeupDate", "committed"],
  },
  gate: {
    1: ["kind", "employeeId"],
    2: ["reason", "reasonText", "outAt", "expectedInAt", "note"],
    3: [],
  },
};

export function stepFieldsFor(kind: RequestKind, step: FormStep): string[] {
  return STEPS[kind][step];
}

/** The last step a given kind actually has. */
export function lastStepFor(kind: RequestKind): FormStep {
  return stepFieldsFor(kind, 3).length > 0 ? 3 : 2;
}

const uuid = z.string().uuid();
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

type Values = Record<string, string | undefined>;
export type StepResult = { ok: boolean; errors: Record<string, string> };

function fail(errors: Record<string, string>): StepResult {
  return { ok: Object.keys(errors).length === 0, errors };
}

export function validateStep(kind: RequestKind, step: FormStep, values: Values): StepResult {
  const errors: Record<string, string> = {};

  if (step === 1) {
    if (!uuid.safeParse(values.employeeId ?? "").success) {
      errors.employeeId = "Chọn tên của bạn trong danh sách";
    }
    return fail(errors);
  }

  if (step === 2 && kind === "leave") {
    if (!dateOnly.safeParse(values.fromDate ?? "").success) errors.fromDate = "Chọn ngày bắt đầu";
    if (!dateOnly.safeParse(values.toDate ?? "").success) errors.toDate = "Chọn ngày kết thúc";
    if (!errors.fromDate && !errors.toDate && (values.toDate ?? "") < (values.fromDate ?? "")) {
      errors.toDate = "Ngày kết thúc phải từ ngày bắt đầu trở đi";
    }
    if (values.halfDay && values.fromDate !== values.toDate) {
      errors.halfDay = "Nghỉ nửa ngày chỉ áp dụng cho một ngày";
    }
    if (!LEAVE_REASONS.includes((values.reason ?? "") as (typeof LEAVE_REASONS)[number])) {
      errors.reason = "Chọn lý do nghỉ";
    }
    if (
      (values.reason === "special" || values.reason === "other") &&
      (values.reasonText ?? "").trim() === ""
    ) {
      errors.reasonText = "Chọn lý do này thì phải ghi rõ";
    }
    if ((values.note ?? "").trim() === "") errors.note = "Ghi rõ lý do nghỉ";
    return fail(errors);
  }

  if (step === 2 && kind === "gate") {
    if (!GATE_REASONS.includes((values.reason ?? "") as (typeof GATE_REASONS)[number])) {
      errors.reason = "Chọn lý do xin phép";
    }
    if (values.reason === "other" && (values.reasonText ?? "").trim() === "") {
      errors.reasonText = 'Chọn "Khác" thì phải ghi rõ';
    }
    const out = Date.parse(values.outAt ?? "");
    const back = Date.parse(values.expectedInAt ?? "");
    if (Number.isNaN(out)) errors.outAt = "Chọn giờ ra";
    if (Number.isNaN(back)) errors.expectedInAt = "Chọn giờ vào lại";
    if (!Number.isNaN(out) && !Number.isNaN(back) && back <= out) {
      errors.expectedInAt = "Giờ vào lại phải sau giờ ra";
    }
    if ((values.note ?? "").trim() === "") errors.note = "Ghi rõ nội dung";
    return fail(errors);
  }

  if (step === 3 && kind === "leave") {
    if (!uuid.safeParse(values.handoverEmployeeId ?? "").success) {
      errors.handoverEmployeeId = "Chọn người nhận bàn giao";
    }
    if (values.committed !== "on") errors.committed = "Phải tích cam kết trước khi gửi";
    return fail(errors);
  }

  return fail(errors);
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/unit/form-steps.test.ts`
Expected: PASS — 10 tests.

- [ ] **Step 5: Commit the step map, then build the screens**

```bash
git add lib/domain/form-steps.ts tests/unit/form-steps.test.ts
git commit -m "Define the public form's three steps and their validation"
```

The screens themselves (`NamePicker`, `HoursLine`, the step markup in `page.tsx`, and `actions.ts` calling `fileRequest`) follow in the same task. Requirements they must meet, each checkable:

- No `antd` import anywhere under `app/(public)` or `components/public`.
- `NamePicker` calls `lg_search_employees` through the anon client, debounced at 250 ms, minimum two characters, and renders name · title · department so two people with the same name are told apart.
- `HoursLine` imports `computeLeaveMinutes` / `computeGateMinutes` — never its own arithmetic.
- Every field renders its error underneath itself, from `validateStep`.
- Step 3 for a gate pass does not exist; the button in step 2 says "Gửi đơn".
- The action recomputes the minutes server-side and ignores any value posted from the browser.
- `npm run measure:js` still reports `/don` inside the public budget.

- [ ] **Step 6: Verify and commit the screens**

Run: `npm test` · `npm run typecheck` · `npm run lint` · `npm run build`, then `npm run measure:js` against a production server.
Expected: all clean; `/don` inside 160 KB.

```bash
git add "app/(public)/don" components/public
git commit -m "Build the public filing form across three steps"
```

---

### Task 4: The success screen — code, private link, QR

**Files:**
- Create: `app/(public)/don/xong/page.tsx`
- Create: `lib/qr.ts` — server-side QR to SVG
- Modify: `package.json` — add `qrcode`
- Test: `tests/unit/qr.test.ts`

**Interfaces:**
- Produces: `qrSvg(text: string): Promise<string>` — an inline SVG string, no client JavaScript

- [ ] **Step 1: Add the dependency and write the failing test**

Run: `npm install qrcode && npm install --save-dev @types/qrcode`

Create `tests/unit/qr.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { qrSvg } from "@/lib/qr";

describe("QR rendering", () => {
  it("returns an inline SVG", async () => {
    const svg = await qrSvg("https://example.com/don");
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
  });

  it("encodes different text differently", async () => {
    expect(await qrSvg("a".repeat(20))).not.toBe(await qrSvg("b".repeat(20)));
  });

  it("refuses empty text rather than rendering a meaningless code", async () => {
    await expect(qrSvg("")).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/qr.test.ts`
Expected: FAIL — cannot resolve `@/lib/qr`.

- [ ] **Step 3: Implement**

Create `lib/qr.ts`:

```ts
import QRCode from "qrcode";

/**
 * A QR code as an inline SVG string, rendered on the server.
 *
 * Server-side on purpose: a QR library in the browser would cost the public zone
 * tens of kilobytes for a picture that never changes.
 */
export async function qrSvg(text: string): Promise<string> {
  if (text.trim() === "") throw new Error("Không thể tạo mã QR cho nội dung rỗng");
  return QRCode.toString(text, {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#17202e", light: "#ffffff" },
  });
}
```

- [ ] **Step 4: Build the success screen**

`app/(public)/don/xong/page.tsx` reads `code` and `token` from the query, and must:

- Show the request code large and monospaced, with "Chụp lại màn hình này" beside it.
- Show a QR of the absolute lookup URL, rendered by `qrSvg`, so the worker can reopen their request from another phone.
- State plainly that the link is the only way back into the request, and that the code alone shows a status.
- Carry no client JavaScript at all.

- [ ] **Step 5: Verify and commit**

Run: `npm test` · `npm run typecheck` · `npm run lint` · `npm run build` · `npm run measure:js`

```bash
git add lib/qr.ts tests/unit/qr.test.ts "app/(public)/don/xong" package.json package-lock.json
git commit -m "Show the request code, private link and QR after filing"
```

---

### Task 5: First deployment

A form nobody can reach is not finished. This task ends with a URL a phone can open.

**Files:**
- Create: `vercel.json`

- [ ] **Step 1: Create the Vercel project**

In the Vercel dashboard, with the account that owns `ctyhp-accounting`:

1. New Project → import `quocviet-IT/leave_gate_webapp`.
2. Framework preset: Next.js. Root Directory: **repository root** (unlike the accounting app, the code is not in a subfolder).
3. Project name: `ctyhp-nhansu` — this decides the URL the QR posters will carry, so it cannot change afterwards without reprinting them.

- [ ] **Step 2: Set the environment variables**

Add to Production **and** Preview, from `.env.local`:

| Name | Note |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public |
| `SUPABASE_SERVICE_ROLE_KEY` | server only — never expose |
| `GOOGLE_WORKSPACE_DOMAIN` | `ctyhp.vn` |

`SUPABASE_DB_URL` is **not** needed in Vercel: it exists for the migration script, which runs from a developer's machine.

- [ ] **Step 3: Add the Google redirect URL**

In Supabase → Authentication → URL Configuration, add the production origin to Redirect URLs, and set Site URL to it. Without this, admin sign-in returns to localhost.

- [ ] **Step 4: Verify the deployment**

```bash
node scripts/smoke-pages.mjs https://<production-url>
node scripts/measure-js.mjs https://<production-url>
```

Expected: 11/11 routes answer per zone; every measured route inside budget. Then file one real request from a phone on mobile data — not office wifi — and confirm the code and link come back.

- [ ] **Step 5: Commit**

```bash
git add vercel.json
git commit -m "Deploy the app and record its production settings"
```

---

### Task 6: The printable QR poster

**Files:**
- Create: `app/admin/(guarded)/poster/page.tsx`

- [ ] **Step 1: Build the poster page**

An A4 page, print-styled, that C&B prints and the workshops pin up. It must carry:

- The QR of the absolute `/don` URL, at least 8 cm square so a phone reads it from arm's length.
- The URL in plain text underneath, large enough to type by hand.
- Four lines of instruction in Vietnamese: quét mã · chọn tên · điền · chụp lại mã đơn.
- A line stating that no login and no password are needed — the single most common question a poster like this gets.

- [ ] **Step 2: Verify in print preview**

Open `/admin/poster`, print to PDF at A4, and confirm the QR scans from the printed page with a phone. A QR that only scans on screen is not done.

- [ ] **Step 3: Commit**

```bash
git add "app/admin/(guarded)/poster"
git commit -m "Add the printable QR poster for the workshops"
```

---

## Phase exit criteria

- [ ] `npm run build` · `npm test` · `npm run typecheck` · `npm run lint` clean, output pasted
- [ ] `npm run verify:submit` reports `12 đạt, 0 không đạt`
- [ ] `npm run verify:employees` still 10/10 — P1 not broken
- [ ] `scripts/smoke-pages.mjs` passes against the **production URL**
- [ ] `measure:js` against production: `/don` and `/don/xong` inside 160 KB gzip
- [ ] No `antd` import under `app/(public)` or `components/public`
- [ ] A request filed from a phone on mobile data, and its code found again by the private link
- [ ] `lg_status_by_code` returns a status and nothing else — confirmed in `verify-submit`
- [ ] `anon` cannot execute `lg_submit_request` — confirmed in `verify-submit`
- [ ] The printed poster scans from paper

## Notes for whoever runs P3 next

The lookup page consumes `lookup_token` and must answer three different depths:
the token gives everything, the code gives a status, and nothing else gives
anything. Withdrawal and the real-return edit both need the token, and both go
through a `service_role` function called from a Server Action — for the same
reason filing does.
