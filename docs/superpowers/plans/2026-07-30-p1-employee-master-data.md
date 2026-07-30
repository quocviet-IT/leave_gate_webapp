# P1 — Employee Master Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** C&B can paste the staff list from Excel into the admin zone, and the public form can search those names — the prerequisite that unblocks every later phase.

**Architecture:** Parsing is a pure function in `lib/domain/employees.ts` so it is fully unit-testable. Writing goes through one SECURITY DEFINER function that checks the caller is C&B; the public name search goes through a second one that returns names without codes. No table policy is added, so `anon` still holds nothing.

**Tech Stack:** Next.js 16 · React 19 · Ant Design 6 (admin only) · Supabase Postgres · Zod · Vitest · `pg` for the verification script.

## Global Constraints

Inherited from [the roadmap](2026-07-30-roadmap.md) — repeated here because a task's implementer sees only their own task.

- UI text Vietnamese; code, comments and commit messages English.
- The public zone (`/`, `/don`, `/tra-cuu`) must not import Ant Design. This phase touches `/admin` only, so Ant Design is allowed in the files it creates.
- `anon` never gets a table policy. Public access is by SECURITY DEFINER function only.
- The name search must never return an employee code.
- Nothing is deleted; the import deactivates nobody.
- Table and function names are prefixed `lg_`.
- Migrations are numbered `NNNN_snake_case.sql` and never edited once applied.
- Minutes are the unit for time; not used in this phase but do not introduce hours columns.
- Verification gates for the phase: `npm run build`, `npm test`, `npm run typecheck`, `npm run lint`, `node scripts/smoke-pages.mjs http://localhost:PORT`, and `node --env-file=.env.local scripts/verify-employees.mjs`.

**PRD rules covered by this phase:** rule 2 (names are chosen from the list, never typed).

---

### Task 1: Parse a pasted staff list

HR will paste from Excel, which means tab-separated text with a possible header row, a BOM, CRLF line endings, and duplicates. Parsing is where all of that gets absorbed.

**Files:**
- Create: `lib/domain/employees.ts`
- Test: `tests/unit/employees.test.ts`

**Interfaces:**
- Consumes: `normalizeEmployeeCode` from `lib/domain/codes.ts` — `(value: string) => string`
- Produces:
  - `type EmployeeImportRow = { code: string; fullName: string; title: string | null; department: string | null; email: string | null }`
  - `type ImportIssue = { line: number; message: string }`
  - `type ParsedImport = { rows: EmployeeImportRow[]; issues: ImportIssue[] }`
  - `parseEmployeeList(text: string): ParsedImport`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/employees.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseEmployeeList } from "@/lib/domain/employees";

describe("parsing a pasted staff list", () => {
  it("reads a tab-separated paste from Excel with a header row", () => {
    const text = [
      "Mã CBNV\tHọ và tên\tChức vụ\tPhòng ban\tEmail",
      "HP-0148\tNguyễn Văn Bình\tCông nhân\tSản xuất\t",
      "HP-0149\tTrần Thị Lan\tCông nhân\tSản xuất\tlan@ctyhp.vn",
    ].join("\n");

    const { rows, issues } = parseEmployeeList(text);

    expect(issues).toEqual([]);
    expect(rows).toEqual([
      {
        code: "HP0148",
        fullName: "Nguyễn Văn Bình",
        title: "Công nhân",
        department: "Sản xuất",
        email: null,
      },
      {
        code: "HP0149",
        fullName: "Trần Thị Lan",
        title: "Công nhân",
        department: "Sản xuất",
        email: "lan@ctyhp.vn",
      },
    ]);
  });

  it("reads a comma-separated list with no header", () => {
    const { rows } = parseEmployeeList("HP-0150,Lê Minh Tuấn,Kỹ thuật viên,Kỹ thuật");
    expect(rows).toHaveLength(1);
    expect(rows[0].code).toBe("HP0150");
    expect(rows[0].department).toBe("Kỹ thuật");
  });

  it("reads a semicolon-separated list", () => {
    const { rows } = parseEmployeeList("HP-0151;Phạm Thu Hà;Kế toán viên;Kế toán");
    expect(rows[0].fullName).toBe("Phạm Thu Hà");
  });

  it("keeps a comma that sits inside a quoted field", () => {
    const { rows } = parseEmployeeList('HP-0152,"Vũ, Thị Mai",Nhân viên,Hành chính');
    expect(rows[0].fullName).toBe("Vũ, Thị Mai");
  });

  it("survives a BOM, CRLF endings and blank lines", () => {
    const text = "﻿HP-0153\tHoàng Văn Nam\r\n\r\nHP-0154\tĐỗ Thị Yến\r\n";
    const { rows, issues } = parseEmployeeList(text);
    expect(issues).toEqual([]);
    expect(rows.map((r) => r.code)).toEqual(["HP0153", "HP0154"]);
  });

  it("normalises the code and collapses runs of spaces in the name", () => {
    const { rows } = parseEmployeeList("hp 0155\tNguyễn   Thị  Hoa");
    expect(rows[0].code).toBe("HP0155");
    expect(rows[0].fullName).toBe("Nguyễn Thị Hoa");
  });

  it("reports a missing code and drops the row", () => {
    const { rows, issues } = parseEmployeeList("\tNguyễn Văn Bình");
    expect(rows).toEqual([]);
    expect(issues).toEqual([{ line: 1, message: "Thiếu mã CBNV" }]);
  });

  it("reports a missing name and drops the row", () => {
    const { rows, issues } = parseEmployeeList("HP-0156\tA");
    expect(rows).toEqual([]);
    expect(issues).toEqual([{ line: 1, message: "Thiếu họ tên" }]);
  });

  it("reports a duplicate code and keeps the first occurrence", () => {
    const text = ["HP-0157\tNguyễn Văn A", "hp0157\tNguyễn Văn B"].join("\n");
    const { rows, issues } = parseEmployeeList(text);
    expect(rows).toHaveLength(1);
    expect(rows[0].fullName).toBe("Nguyễn Văn A");
    expect(issues).toEqual([{ line: 2, message: "Mã HP0157 đã có ở dòng 1" }]);
  });

  it("reports a malformed email", () => {
    const { rows, issues } = parseEmployeeList("HP-0158\tLý Thị Nga\tNhân viên\tKho\tnga(at)ctyhp.vn");
    expect(rows).toEqual([]);
    expect(issues).toEqual([{ line: 1, message: "Email không hợp lệ: nga(at)ctyhp.vn" }]);
  });

  it("ignores columns past the fifth", () => {
    const { rows } = parseEmployeeList("HP-0159\tBùi Văn Sơn\tThợ\tCơ khí\t\tghi chú thêm");
    expect(rows[0].department).toBe("Cơ khí");
  });

  it("returns nothing for empty input", () => {
    expect(parseEmployeeList("   \n\n")).toEqual({ rows: [], issues: [] });
  });

  it("does not mistake a name starting with 'Mai' for a header", () => {
    const { rows } = parseEmployeeList("HP-0160\tMai Thị Hồng");
    expect(rows).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/employees.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/domain/employees"`.

- [ ] **Step 3: Write the implementation**

Create `lib/domain/employees.ts`:

```ts
/**
 * Turning a pasted staff list into rows the database will accept.
 *
 * HR pastes out of Excel, so the input is tab-separated with a header row, a
 * BOM, CRLF endings, and the occasional duplicate. Every one of those is a
 * parsing problem, not a database problem, so it is absorbed here where it can
 * be tested without a network.
 *
 * Column order is fixed and documented on the import screen:
 *   code · full name · job title · department · email
 */

import { normalizeEmployeeCode } from "./codes";

export type EmployeeImportRow = {
  code: string;
  fullName: string;
  title: string | null;
  department: string | null;
  email: string | null;
};

export type ImportIssue = { line: number; message: string };

export type ParsedImport = { rows: EmployeeImportRow[]; issues: ImportIssue[] };

/**
 * A first cell equal to one of these means the line is a header. Exact match,
 * not a substring: "Mai Thị Hồng" contains "ma" and is a person, not a heading.
 */
const HEADER_FIRST_CELLS = new Set([
  "mã cbnv",
  "ma cbnv",
  "mã",
  "ma",
  "mã nv",
  "manv",
  "mã số",
  "ma so",
  "code",
  "employee code",
]);

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Excel pastes use tabs; a saved CSV may use commas or semicolons. */
function delimiterOf(line: string): string {
  if (line.includes("\t")) return "\t";
  if (line.includes(";")) return ";";
  return ",";
}

function splitCells(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch !== '"') {
        current += ch;
      } else if (line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        quoted = false;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      cells.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current);

  return cells.map((cell) => cell.trim());
}

function blankToNull(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

export function parseEmployeeList(text: string): ParsedImport {
  const rows: EmployeeImportRow[] = [];
  const issues: ImportIssue[] = [];
  const seenAtLine = new Map<string, number>();

  const lines = text.replace(/^﻿/, "").split(/\r\n|\r|\n/);
  let headerChecked = false;

  lines.forEach((raw, index) => {
    const lineNumber = index + 1;
    if (raw.trim() === "") return;

    const cells = splitCells(raw, delimiterOf(raw));

    if (!headerChecked) {
      headerChecked = true;
      if (HEADER_FIRST_CELLS.has((cells[0] ?? "").toLowerCase())) return;
    }

    const code = normalizeEmployeeCode(cells[0] ?? "");
    if (code === "") {
      issues.push({ line: lineNumber, message: "Thiếu mã CBNV" });
      return;
    }

    const fullName = (cells[1] ?? "").replace(/\s+/g, " ").trim();
    if (fullName.length < 2) {
      issues.push({ line: lineNumber, message: "Thiếu họ tên" });
      return;
    }

    const email = (cells[4] ?? "").trim().toLowerCase();
    if (email !== "" && !EMAIL.test(email)) {
      issues.push({ line: lineNumber, message: `Email không hợp lệ: ${email}` });
      return;
    }

    const firstSeen = seenAtLine.get(code);
    if (firstSeen !== undefined) {
      issues.push({ line: lineNumber, message: `Mã ${code} đã có ở dòng ${firstSeen}` });
      return;
    }
    seenAtLine.set(code, lineNumber);

    rows.push({
      code,
      fullName,
      title: blankToNull(cells[2]),
      department: blankToNull(cells[3]),
      email: email === "" ? null : email,
    });
  });

  return { rows, issues };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/employees.test.ts`
Expected: PASS — 13 tests.

Then run the whole suite so nothing else moved: `npm test`
Expected: PASS — 76 tests (63 existing plus 13).

- [ ] **Step 5: Commit**

```bash
git add lib/domain/employees.ts tests/unit/employees.test.ts
git commit -m "Parse a pasted staff list into importable rows"
```

---

### Task 2: Database functions for import and name search

**Files:**
- Create: `supabase/migrations/0003_employee_import.sql`
- Create: `scripts/verify-employees.mjs`
- Modify: `package.json` — add the `verify:employees` script

**Interfaces:**
- Consumes: `lg_employee`, `lg_audit`, `lg_current_role()` from `0001_foundation.sql`
- Produces:
  - `lg_import_employees(p_rows jsonb) returns jsonb` — `{"inserted": n, "updated": n}`; raises unless the caller is C&B
  - `lg_search_employees(p_query text) returns table (id uuid, full_name text, title text, department text)` — no code column, max 8 rows, needs 2 characters, accent-insensitive

- [ ] **Step 1: Write the failing verification script**

Create `scripts/verify-employees.mjs`:

```js
// End-to-end check of the employee import and the public name search, against
// the real database. Everything runs inside one transaction that is rolled back,
// so the run leaves no residue and can be repeated.
//
// Run: node --env-file=.env.local scripts/verify-employees.mjs
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
  if (condition) {
    passed++;
    console.log(`ok   ${name}`);
  } else {
    failed++;
    console.log(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** Act as a signed-in person: Supabase reads auth.jwt() from this setting. */
async function actAs(email) {
  await client.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ email }),
  ]);
}

const ROWS = [
  { code: "ZZTEST01", fullName: "Nguyễn Văn Bình", title: "Công nhân", department: "Sản xuất", email: null },
  { code: "ZZTEST02", fullName: "Trần Thị Lan", title: "Công nhân", department: "Sản xuất", email: null },
];

async function main() {
  await client.connect();
  await client.query("begin");

  // C&B may import.
  await actAs("anhkhoa@ctyhp.vn");
  const first = await client.query("select lg_import_employees($1::jsonb) as r", [JSON.stringify(ROWS)]);
  check("import inserts new rows", first.rows[0].r.inserted === 2, JSON.stringify(first.rows[0].r));

  // Re-importing the same codes updates instead of duplicating.
  const again = await client.query("select lg_import_employees($1::jsonb) as r", [
    JSON.stringify([{ ...ROWS[0], title: "Tổ trưởng" }]),
  ]);
  check("re-import updates in place", again.rows[0].r.updated === 1, JSON.stringify(again.rows[0].r));

  const title = await client.query("select title from lg_employee where code = 'ZZTEST01'");
  check("the update took effect", title.rows[0].title === "Tổ trưởng", title.rows[0].title);

  const audited = await client.query(
    "select count(*)::int as n from lg_audit where entity = 'lg_employee' and action = 'import'",
  );
  check("the import is audited", audited.rows[0].n >= 2, `n=${audited.rows[0].n}`);

  // An approver is not C&B and must be refused.
  await actAs("dieu@ctyhp.vn");
  let refused = false;
  try {
    await client.query("savepoint s1");
    await client.query("select lg_import_employees($1::jsonb)", [JSON.stringify(ROWS)]);
  } catch {
    refused = true;
  } finally {
    await client.query("rollback to savepoint s1");
  }
  check("an approver cannot import", refused);

  // The public search: accent-insensitive, bounded, and no code column.
  const search = await client.query("select * from lg_search_employees('binh')");
  check("search finds a name typed without diacritics", search.rows.length === 1, JSON.stringify(search.rows));
  check(
    "search never returns the employee code",
    search.rows.length > 0 && !Object.keys(search.rows[0]).includes("code"),
    Object.keys(search.rows[0] ?? {}).join(","),
  );

  const tooShort = await client.query("select * from lg_search_employees('n')");
  check("search needs at least two characters", tooShort.rows.length === 0);

  // "th" matches Trần Thị Lan, so this asserts the cap on a query that really
  // returns rows — a one-character query would pass the check by returning none.
  const capped = await client.query("select count(*)::int as n from lg_search_employees('th')");
  check("search is bounded to 8 rows", capped.rows[0].n > 0 && capped.rows[0].n <= 8, `n=${capped.rows[0].n}`);

  // Someone without a code cannot be filed for, so they must not be findable.
  await actAs("anhkhoa@ctyhp.vn");
  await client.query(
    "insert into lg_employee (code, full_name, active) values (null, 'Người Chưa Có Mã', true)",
  );
  const noCode = await client.query("select * from lg_search_employees('chua co ma')");
  check("an employee with no code is not searchable", noCode.rows.length === 0);

  await client.query("rollback");
  console.log(`\n${passed} đạt, ${failed} không đạt.`);
  process.exitCode = failed === 0 ? 0 : 1;
}

main()
  .catch((err) => {
    console.error("\nLỗi:", err.message);
    process.exitCode = 1;
  })
  .finally(() => client.end());
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --env-file=.env.local scripts/verify-employees.mjs`
Expected: FAIL — `Lỗi: function lg_import_employees(jsonb) does not exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0003_employee_import.sql`:

```sql
-- Employee master data: an import path for C&B, and a name search for the
-- public form (PRD sections XIV and X, rule 2).
--
-- Both are SECURITY DEFINER functions rather than table policies. The import
-- needs a role check that a policy cannot express as clearly, and the search
-- must return names *without* codes — the code is what stands in for a password
-- on the public form, so it never leaves the database.
--
-- Supabase installs extensions into the `extensions` schema, so every function
-- here puts it on the search path before using unaccent().

create extension if not exists unaccent with schema extensions;

create function lg_import_employees(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_inserted int := 0;
  v_updated  int := 0;
  v_actor    text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if lg_current_role() is distinct from 'cnb' then
    raise exception 'Chỉ C&B được nhập danh sách nhân sự';
  end if;

  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'Dữ liệu nhập phải là một mảng';
  end if;

  if jsonb_array_length(p_rows) > 5000 then
    raise exception 'Một lần nhập tối đa 5000 dòng';
  end if;

  with incoming as (
    select
      upper(btrim(r ->> 'code'))                                as code,
      btrim(r ->> 'fullName')                                   as full_name,
      nullif(btrim(coalesce(r ->> 'title', '')), '')            as title,
      nullif(btrim(coalesce(r ->> 'department', '')), '')        as department,
      nullif(lower(btrim(coalesce(r ->> 'email', ''))), '')      as email
    from jsonb_array_elements(p_rows) as r
  ),
  upserted as (
    insert into lg_employee (code, full_name, email, title, department, active, synced_at)
    select code, full_name, email, title, department, true, now()
    from incoming
    where code <> '' and full_name <> ''
    on conflict (code) do update
      set full_name  = excluded.full_name,
          email      = excluded.email,
          title      = excluded.title,
          department = excluded.department,
          active     = true,
          synced_at  = now()
    -- xmax is zero on a fresh insert and non-zero when the row was updated.
    returning (xmax = 0) as was_insert
  )
  select
    coalesce(count(*) filter (where was_insert), 0),
    coalesce(count(*) filter (where not was_insert), 0)
  into v_inserted, v_updated
  from upserted;

  insert into lg_audit (entity, entity_id, action, actor, detail)
  values (
    'lg_employee',
    'import',
    'import',
    coalesce(nullif(v_actor, ''), 'unknown'),
    jsonb_build_object(
      'inserted', v_inserted,
      'updated', v_updated,
      'rows', jsonb_array_length(p_rows)
    )
  );

  return jsonb_build_object('inserted', v_inserted, 'updated', v_updated);
end;
$$;

comment on function lg_import_employees(jsonb) is
  'Upsert staff rows by employee code. C&B only. Deactivates nobody.';

revoke all on function lg_import_employees(jsonb) from public;
grant execute on function lg_import_employees(jsonb) to authenticated;

-- The public form's name picker. Deliberately narrow: two characters minimum,
-- at most eight rows, no employee code, and nobody who has no code — a person
-- without a code cannot file anyway, so listing them would only confuse.
create function lg_search_employees(p_query text)
returns table (id uuid, full_name text, title text, department text)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select e.id, e.full_name, e.title, e.department
  from lg_employee e
  where e.active
    and e.code is not null
    and length(btrim(coalesce(p_query, ''))) >= 2
    and unaccent(lower(e.full_name)) like '%' || unaccent(lower(btrim(p_query))) || '%'
  order by e.full_name
  limit 8;
$$;

comment on function lg_search_employees(text) is
  'Name search for the public form. Never returns the employee code.';

revoke all on function lg_search_employees(text) from public;
grant execute on function lg_search_employees(text) to anon, authenticated;
```

- [ ] **Step 4: Apply it and run the verification**

Run: `npm run migrate`
Expected: `apply 0003_employee_import.sql ... ok`

Run: `npm run migrate` a second time
Expected: `skip  0003_employee_import.sql (đã áp dụng)`

Run: `node --env-file=.env.local scripts/verify-employees.mjs`
Expected: `10 đạt, 0 không đạt.`

- [ ] **Step 5: Add the npm script and commit**

In `package.json`, inside `"scripts"`, after the `"migrate"` line:

```json
    "verify:employees": "node --env-file=.env.local scripts/verify-employees.mjs",
```

Run: `npm run verify:employees`
Expected: `10 đạt, 0 không đạt.`

```bash
git add supabase/migrations/0003_employee_import.sql scripts/verify-employees.mjs package.json
git commit -m "Add employee import and public name search functions"
```

---

### Task 3: Server-side import service and action

**Files:**
- Create: `lib/services/employees.ts`
- Create: `app/admin/(guarded)/nhan-su/actions.ts`

**Interfaces:**
- Consumes: `parseEmployeeList`, `EmployeeImportRow`, `ImportIssue` from `lib/domain/employees.ts`; `createSupabaseServerClient` from `lib/db/server.ts`; `requireRole` from `lib/auth.ts`; `lg_import_employees` from migration 0003
- Produces:
  - `importEmployees(rows: EmployeeImportRow[]): Promise<{ inserted: number; updated: number }>`
  - `listEmployees(limit?: number): Promise<EmployeeSummary[]>` where `EmployeeSummary = { id: string; code: string | null; full_name: string; title: string | null; department: string | null; active: boolean }`
  - `type ImportState = { ok: boolean; message: string; issues: ImportIssue[] }`
  - `importEmployeeList(previous: ImportState, formData: FormData): Promise<ImportState>` — a Server Action for `useActionState`
  - `EMPTY_IMPORT_STATE: ImportState`

- [ ] **Step 1: Write the service**

Create `lib/services/employees.ts`:

```ts
import "server-only";
import { createSupabaseServerClient } from "@/lib/db/server";
import type { EmployeeImportRow } from "@/lib/domain/employees";

export type ImportOutcome = { inserted: number; updated: number };

export type EmployeeSummary = {
  id: string;
  code: string | null;
  full_name: string;
  title: string | null;
  department: string | null;
  active: boolean;
};

/**
 * Hands the parsed rows to the database function, which is where the C&B check
 * lives. Acting as the signed-in user is deliberate: the service-role client
 * would bypass that check.
 */
export async function importEmployees(rows: EmployeeImportRow[]): Promise<ImportOutcome> {
  const sb = await createSupabaseServerClient();
  const { data, error } = await sb.rpc("lg_import_employees", { p_rows: rows });
  if (error) throw new Error(error.message);
  const outcome = data as ImportOutcome | null;
  if (!outcome) throw new Error("Nhập danh sách không trả về kết quả");
  return outcome;
}

/** The list shown under the import box. Named columns only — never select *. */
export async function listEmployees(limit = 50): Promise<EmployeeSummary[]> {
  const sb = await createSupabaseServerClient();
  const { data, error } = await sb
    .from("lg_employee")
    .select("id, code, full_name, title, department, active")
    .order("full_name")
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as EmployeeSummary[];
}

/** Total headcount, for the "showing N of M" line. */
export async function countEmployees(): Promise<number> {
  const sb = await createSupabaseServerClient();
  const { count, error } = await sb
    .from("lg_employee")
    .select("id", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return count ?? 0;
}
```

- [ ] **Step 2: Write the Server Action**

Create `app/admin/(guarded)/nhan-su/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { parseEmployeeList, type ImportIssue } from "@/lib/domain/employees";
import { importEmployees } from "@/lib/services/employees";

export type ImportState = {
  ok: boolean;
  message: string;
  issues: ImportIssue[];
};

export const EMPTY_IMPORT_STATE: ImportState = { ok: false, message: "", issues: [] };

/**
 * Parse first, then write. Rows that fail parsing are reported by line and
 * skipped rather than failing the whole paste — HR would otherwise have to find
 * one bad row in five hundred by hand.
 */
export async function importEmployeeList(
  _previous: ImportState,
  formData: FormData,
): Promise<ImportState> {
  await requireRole("cnb");

  const text = String(formData.get("list") ?? "");
  const { rows, issues } = parseEmployeeList(text);

  if (rows.length === 0) {
    return {
      ok: false,
      message: "Không có dòng nào hợp lệ để nhập. Kiểm tra lại các dòng bên dưới.",
      issues,
    };
  }

  try {
    const { inserted, updated } = await importEmployees(rows);
    revalidatePath("/admin/nhan-su");
    const skipped = issues.length > 0 ? ` Bỏ qua ${issues.length} dòng.` : "";
    return {
      ok: true,
      message: `Đã nhập ${inserted} người mới, cập nhật ${updated} người.${skipped}`,
      issues,
    };
  } catch (cause) {
    return {
      ok: false,
      message: cause instanceof Error ? cause.message : "Nhập danh sách không thành công.",
      issues,
    };
  }
}
```

- [ ] **Step 3: Verify it typechecks and lints**

Run: `npm run typecheck`
Expected: no output, exit 0.

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/services/employees.ts "app/admin/(guarded)/nhan-su/actions.ts"
git commit -m "Add the employee import service and server action"
```

---

### Task 4: The import screen

**Files:**
- Create: `app/admin/(guarded)/nhan-su/page.tsx`
- Create: `components/admin/EmployeeImportPanel.tsx`
- Modify: `components/AdminShell.tsx` — add the nav entry
- Modify: `AGENTS.md` — mark step 2's interim path done

**Interfaces:**
- Consumes: `listEmployees`, `countEmployees` from `lib/services/employees.ts`; `importEmployeeList`, `EMPTY_IMPORT_STATE`, `ImportState` from `./actions`; `requireRole` from `lib/auth.ts`
- Produces: the route `/admin/nhan-su`, C&B only

- [ ] **Step 1: Write the client panel**

Create `components/admin/EmployeeImportPanel.tsx`:

```tsx
"use client";
import { useActionState } from "react";
import { Alert, Button, Card, Space, Table, Typography } from "antd";
import {
  EMPTY_IMPORT_STATE,
  importEmployeeList,
  type ImportState,
} from "@/app/admin/(guarded)/nhan-su/actions";
import type { EmployeeSummary } from "@/lib/services/employees";

const { Title, Paragraph, Text } = Typography;

const SAMPLE = "HP-0148\tNguyễn Văn Bình\tCông nhân\tSản xuất\nHP-0149\tTrần Thị Lan\tCông nhân\tSản xuất";

export default function EmployeeImportPanel({
  employees,
  total,
}: {
  employees: EmployeeSummary[];
  total: number;
}) {
  const [state, submit, pending] = useActionState<ImportState, FormData>(
    importEmployeeList,
    EMPTY_IMPORT_STATE,
  );

  return (
    <Space direction="vertical" size="middle" style={{ display: "flex" }}>
      <div>
        <Title level={3} style={{ marginBottom: 4 }}>
          Danh sách nhân sự
        </Title>
        <Text type="secondary">
          Dán từ Excel năm cột theo thứ tự: mã CBNV · họ và tên · chức vụ · phòng ban · email.
          Dòng tiêu đề bỏ được. Nhập lại cùng mã là cập nhật, không tạo trùng.
        </Text>
      </div>

      <Card size="small" title="Dán danh sách">
        <form action={submit}>
          <Space direction="vertical" size="small" style={{ display: "flex" }}>
            <textarea
              name="list"
              rows={8}
              defaultValue=""
              placeholder={SAMPLE}
              aria-label="Danh sách nhân sự dán từ Excel"
              style={{
                width: "100%",
                fontFamily: '"Cascadia Mono", Consolas, ui-monospace, monospace',
                fontSize: 13,
                padding: 8,
                border: "1px solid #dbe1ea",
                borderRadius: 6,
                resize: "vertical",
              }}
            />
            <Button type="primary" htmlType="submit" loading={pending}>
              Nhập danh sách
            </Button>
          </Space>
        </form>
      </Card>

      {state.message ? (
        <Alert
          type={state.ok ? "success" : "error"}
          showIcon
          message={state.ok ? "Đã nhập" : "Chưa nhập được"}
          description={state.message}
        />
      ) : null}

      {state.issues.length > 0 ? (
        <Card size="small" title={`${state.issues.length} dòng bị bỏ qua`}>
          <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
            {state.issues.map((issue) => (
              <li key={`${issue.line}-${issue.message}`}>
                <Text>
                  Dòng {issue.line}: {issue.message}
                </Text>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card size="small" title={`Đang có ${total} người · hiện ${employees.length} dòng đầu`}>
        <Table<EmployeeSummary>
          size="small"
          rowKey="id"
          dataSource={employees}
          pagination={false}
          scroll={{ x: true }}
          locale={{ emptyText: "Chưa có ai trong danh sách. Dán danh sách ở trên để bắt đầu." }}
          columns={[
            { title: "Mã CBNV", dataIndex: "code", width: 120 },
            { title: "Họ và tên", dataIndex: "full_name" },
            { title: "Chức vụ", dataIndex: "title" },
            { title: "Phòng ban", dataIndex: "department" },
          ]}
        />
      </Card>

      <Paragraph type="secondary" style={{ marginBottom: 0 }}>
        Mã CBNV là thứ form công khai dùng để đối chiếu tên, nên người chưa có mã sẽ không gửi được
        đơn và không hiện ra khi tìm tên.
      </Paragraph>
    </Space>
  );
}
```

- [ ] **Step 2: Write the page and the nav entry**

Create `app/admin/(guarded)/nhan-su/page.tsx`:

```tsx
import { requireRole } from "@/lib/auth";
import { countEmployees, listEmployees } from "@/lib/services/employees";
import EmployeeImportPanel from "@/components/admin/EmployeeImportPanel";

export const metadata = { title: "Nhân sự — Quản trị CTYHP" };

export default async function EmployeesPage() {
  await requireRole("cnb");
  const [employees, total] = await Promise.all([listEmployees(), countEmployees()]);
  return <EmployeeImportPanel employees={employees} total={total} />;
}
```

In `components/AdminShell.tsx`, add one entry to `NAV`, after the `cham-cong` line:

```tsx
  { key: "/admin/nhan-su", label: "Nhân sự", roles: ["cnb"] },
```

- [ ] **Step 3: Verify the four gates and the render**

Run: `npm test`
Expected: PASS, including `rsc-antd.test.ts` — the page is a Server Component and must not read an Ant Design sub-component; the markup lives in the client panel.

Run: `npm run typecheck` · `npm run lint` · `npm run build`
Expected: all clean. In the build's route table, confirm `/admin/nhan-su` appears as `ƒ` (dynamic).

Check the budget: `/` and `/don` First Load JS must stay **≤ 60 KB** and `/admin/nhan-su` **≤ 320 KB**. If the admin route exceeds it, the Table import is the first thing to look at.

Run the dev server, then:

```bash
rm -rf .next && npm run dev
```

Note the port it takes — the accounting app often holds 3000 — then:

```bash
node scripts/smoke-pages.mjs http://localhost:PORT
```

Expected: every route ok, including `/admin/nhan-su` redirecting to `/admin/dang-nhap` while signed out.

- [ ] **Step 4: Update the build-order note**

In `AGENTS.md`, under "Build order", replace the step 2 line with:

```markdown
2. Directory sync and employee codes; roles for supervisors — **interim path done**
   (P1: C&B pastes the provisional list at `/admin/nhan-su`; the Google Directory
   sync that replaces it is P9)
```

And in the "State of the build" list, add to what exists for real:

```markdown
- Employee master data: paste-import for C&B, and a bounded public name search
  that never returns an employee code.
```

- [ ] **Step 5: Commit**

```bash
git add "app/admin/(guarded)/nhan-su/page.tsx" components/admin/EmployeeImportPanel.tsx components/AdminShell.tsx AGENTS.md
git commit -m "Add the staff list import screen for C&B"
```

---

## Phase exit criteria

- [ ] `npm run build` · `npm test` · `npm run typecheck` · `npm run lint` all clean, output pasted
- [ ] `npm run verify:employees` reports `10 đạt, 0 không đạt`
- [ ] `scripts/smoke-pages.mjs` passes on every route
- [ ] First Load JS: public routes ≤ 60 KB, `/admin/*` ≤ 320 KB
- [ ] A real paste of the provisional staff list has been imported once, by C&B's own account, and the row count matches the file
- [ ] PRD rule 2 is covered by a named test (`does not mistake a name starting with 'Mai' for a header` plus the search checks in `verify-employees.mjs`)

## Notes for whoever runs P2 next

`lg_search_employees` is the only way the public form learns a name, and it
returns `id` — so the form sends an employee **id** plus the typed code, and
`lg_submit_request` compares that code against `lg_employee.code` server-side.
Never send the code to the browser.
