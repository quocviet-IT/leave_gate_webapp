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
  if (condition) {
    passed++;
    console.log(`ok   ${name}`);
  } else {
    failed++;
    console.log(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
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
  check(
    "the computed hours are stored",
    row.rows[0].computed_minutes === 1440,
    String(row.rows[0].computed_minutes),
  );
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

  // The whole privilege surface, not just the one function. Supabase's default
  // privileges grant EXECUTE straight to anon, so a new function is public unless
  // a migration says otherwise — exactly how lg_submit_request slipped through.
  const ALLOWED_FOR_ANON = ["lg_search_employees", "lg_status_by_code"];
  const surface = await client.query(`
    select p.proname as fn
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like 'lg_%'
      and has_function_privilege('anon', p.oid, 'execute')
    order by p.proname
  `);
  const reachable = surface.rows.map((r) => r.fn);
  const unexpected = reachable.filter((fn) => !ALLOWED_FOR_ANON.includes(fn));
  check(
    "anon reaches only the two functions the public form needs",
    unexpected.length === 0,
    `còn gọi được: ${unexpected.join(", ")}`,
  );

  // And the two it does keep must still work, or the public form is broken.
  const stillWorks = await client.query(
    `select has_function_privilege('anon', 'lg_search_employees(text)', 'execute') as search,
            has_function_privilege('anon', 'lg_status_by_code(text)', 'execute') as status`,
  );
  check(
    "anon keeps the name search and the status lookup",
    stillWorks.rows[0].search === true && stillWorks.rows[0].status === true,
    JSON.stringify(stillWorks.rows[0]),
  );

  // The admin read policies call lg_current_role(), and a policy runs as the
  // querying role — so taking this grant away would break every admin screen.
  const policyHelper = await client.query(
    `select has_function_privilege('authenticated', 'lg_current_role()', 'execute') as can`,
  );
  check("authenticated keeps lg_current_role() for the RLS policies", policyHelper.rows[0].can === true);

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
