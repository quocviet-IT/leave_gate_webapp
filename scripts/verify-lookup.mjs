// End-to-end verification for private lookup, withdrawal and actual return.
// Everything runs in one transaction and is rolled back.
//
// Run: npm run verify:lookup
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
  await client.query("savepoint lookup_check");
  try {
    await client.query(sql, params);
    await client.query("rollback to savepoint lookup_check");
    return false;
  } catch {
    await client.query("rollback to savepoint lookup_check");
    return true;
  }
}

async function file(employeeId, kind, detail, device) {
  const result = await client.query(
    "select lg_submit_request($1::uuid, $2::lg_request_kind, $3::jsonb, $4::int, $5) as r",
    [employeeId, kind, JSON.stringify(detail), 180, device],
  );
  return result.rows[0].r;
}

async function main() {
  await client.connect();
  await client.query("begin");

  const employee = await client.query(
    `insert into lg_employee (code, full_name, title, department, active)
     values ('ZZLOOK01', 'Nguyễn Văn Tra Cứu', 'Công nhân', 'Sản xuất', true)
     returning id`,
  );
  const employeeId = employee.rows[0].id;

  const leave = await file(
    employeeId,
    "leave",
    {
      fromDate: "2026-07-30",
      toDate: "2026-07-30",
      halfDay: null,
      reason: "annual",
      reasonText: "",
      note: "Về quê",
      handoverEmployeeId: employeeId,
      makeupDate: null,
    },
    "lookup-leave",
  );

  const lookup = await client.query("select lg_lookup_by_token($1) as r", [leave.token]);
  const detail = lookup.rows[0].r;
  check("a private token returns the request", detail.code === leave.code, JSON.stringify(detail));
  check("private lookup includes the employee name", detail.employee.fullName === "Nguyễn Văn Tra Cứu");
  check("private lookup includes leave detail", detail.detail.reason === "annual");
  check("private lookup never returns the employee number", !JSON.stringify(detail).includes("ZZLOOK01"));
  check("private lookup never returns its own token", !JSON.stringify(detail).includes(leave.token));

  const unknown = await client.query("select lg_lookup_by_token($1) as r", ["a".repeat(32)]);
  check("an unknown token returns nothing", unknown.rows[0].r === null);

  const withdrawn = await client.query("select lg_withdraw_request($1, $2) as r", [
    leave.token,
    "Không còn nhu cầu",
  ]);
  check("a pending request can be withdrawn", withdrawn.rows[0].r.status === "withdrawn");
  const withdrawnRow = await client.query(
    "select status, withdrawn_at, withdraw_reason from lg_request where code = $1",
    [leave.code],
  );
  check(
    "withdrawal records time and reason",
    withdrawnRow.rows[0].status === "withdrawn" &&
      withdrawnRow.rows[0].withdrawn_at &&
      withdrawnRow.rows[0].withdraw_reason === "Không còn nhu cầu",
  );
  const withdrawAudit = await client.query(
    "select 1 from lg_audit where entity_id = (select id::text from lg_request where code = $1) and action = 'withdraw'",
    [leave.code],
  );
  check("withdrawal is audited", withdrawAudit.rowCount === 1);

  const gate = await file(
    employeeId,
    "gate",
    {
      reason: "business_trip",
      reasonText: "",
      note: "Đi công tác",
      outAt: "2026-07-30T10:00:00+07:00",
      expectedInAt: "2026-07-30T14:00:00+07:00",
    },
    "lookup-gate",
  );
  await client.query("update lg_request set status = 'approved' where code = $1", [gate.code]);

  const actual = await client.query(
    `select lg_set_actual_return(
       $1, $2::timestamptz, $3::int, $4, now() + interval '1 day'
     ) as r`,
    [gate.token, "2026-07-30T14:20:00+07:00", 20, "Chờ kết quả công việc"],
  );
  check("an approved gate pass accepts an actual return", actual.rows[0].r.code === gate.code);
  const gateRow = await client.query(
    `select actual_in_source, drift_minutes, drift_reason
     from lg_gate_detail g join lg_request r on r.id = g.request_id where r.code = $1`,
    [gate.code],
  );
  check(
    "actual return stores source, drift and reason",
    gateRow.rows[0].actual_in_source === "employee" &&
      gateRow.rows[0].drift_minutes === 20 &&
      gateRow.rows[0].drift_reason === "Chờ kết quả công việc",
  );

  const lateReasonMissing = await file(
    employeeId,
    "gate",
    {
      reason: "business_trip",
      reasonText: "",
      note: "Đi công tác lần hai",
      outAt: "2026-07-31T10:00:00+07:00",
      expectedInAt: "2026-07-31T14:00:00+07:00",
    },
    "lookup-gate-2",
  );
  await client.query("update lg_request set status = 'approved' where code = $1", [
    lateReasonMissing.code,
  ]);
  check(
    "a drift over 15 minutes needs a reason",
    await expectRaise(
      `select lg_set_actual_return(
         $1, $2::timestamptz, $3::int, $4, now() + interval '1 day'
       )`,
      [lateReasonMissing.token, "2026-07-31T14:20:00+07:00", 20, ""],
    ),
  );

  const expired = await file(
    employeeId,
    "gate",
    {
      reason: "leave",
      reasonText: "",
      note: "Về việc riêng",
      outAt: "2026-08-01T10:00:00+07:00",
      expectedInAt: "2026-08-01T14:00:00+07:00",
    },
    "lookup-gate-3",
  );
  await client.query("update lg_request set status = 'approved' where code = $1", [expired.code]);
  check(
    "an expired actual-return window is refused",
    await expectRaise(
      `select lg_set_actual_return(
         $1, $2::timestamptz, $3::int, $4, now() - interval '1 minute'
       )`,
      [expired.token, "2026-08-01T14:00:00+07:00", 0, ""],
    ),
  );

  const future = await file(
    employeeId,
    "gate",
    {
      reason: "leave",
      reasonText: "",
      note: "Ra ngoài việc riêng",
      outAt: "2026-08-02T10:00:00+07:00",
      expectedInAt: "2026-08-02T14:00:00+07:00",
    },
    "lookup-gate-4",
  );
  await client.query("update lg_request set status = 'approved' where code = $1", [future.code]);
  check(
    "a return time in the future is refused",
    await expectRaise(
      `select lg_set_actual_return(
         $1, now() + interval '2 days', $2::int, $3, now() + interval '3 days'
       )`,
      [future.token, 0, "Nhập nhầm ngày"],
    ),
  );
  check(
    "a return time a couple of minutes ahead still passes, for clock skew",
    !(await expectRaise(
      `select lg_set_actual_return(
         $1, now() + interval '2 minutes', $2::int, $3, now() + interval '1 day'
       )`,
      [future.token, 0, ""],
    )),
  );

  const grants = await client.query(
    `select
       has_function_privilege('anon', 'lg_lookup_by_token(text)', 'execute') as anon_lookup,
       has_function_privilege('anon', 'lg_withdraw_request(text,text)', 'execute') as anon_withdraw,
       has_function_privilege(
         'anon',
         'lg_set_actual_return(text,timestamptz,integer,text,timestamptz)',
         'execute'
       ) as anon_return`,
  );
  check(
    "anon cannot call private-link functions directly",
    grants.rows[0].anon_lookup === false &&
      grants.rows[0].anon_withdraw === false &&
      grants.rows[0].anon_return === false,
  );

  await client.query("rollback");
  console.log(`\n${passed} đạt, ${failed} không đạt.`);
  process.exitCode = failed === 0 ? 0 : 1;
}

main()
  .catch((error) => {
    console.error("\nLỗi:", error.message);
    process.exitCode = 1;
  })
  .finally(() => client.end());
