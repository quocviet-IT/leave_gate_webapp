// End-to-end verification for the SLA reminder bookkeeping — PRD sections VI
// and VII. One transaction, rolled back.
//
// The clock itself is unit-tested in tests/unit/sla.test.ts; what this checks
// is that the database hands out each nudge exactly once and stops offering
// them the moment somebody claims the request.
//
// Run: npm run verify:reminders
import pg from "pg";

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("SUPABASE_DB_URL chưa được đặt (dùng node --env-file=.env.local).");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
let passed = 0;
let failed = 0;

const DIEU = "zz.dieu@ctyhp.vn";

function check(name, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`ok   ${name}`);
  } else {
    failed++;
    console.log(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** Runs the statement inside a savepoint so a raise does not abort the run. */
async function raises(sql, params) {
  await client.query("savepoint sla_check");
  try {
    await client.query(sql, params);
    await client.query("rollback to savepoint sla_check");
    return null;
  } catch (cause) {
    await client.query("rollback to savepoint sla_check");
    return cause.message;
  }
}

async function waiting() {
  const result = await client.query("select lg_requests_awaiting_decision() as r");
  return result.rows[0].r;
}

async function main() {
  await client.connect();
  await client.query("begin");

  await client.query(
    `insert into lg_app_user (email, full_name, role, active)
     values ($1, 'Chị Diệu', 'approver', true)`,
    [DIEU],
  );

  const employee = await client.query(
    `insert into lg_employee (code, full_name, title, department, active)
     values ('ZZSLA001', 'Bùi Văn Chờ Duyệt', 'Công nhân', 'Sản xuất', true)
     returning id`,
  );
  const employeeId = employee.rows[0].id;

  const filed = await client.query(
    `select lg_submit_request('', '', '', 'leave'::lg_request_kind, $2::jsonb, 480, 'sla-1', $1::uuid) as r`,
    [
      employeeId,
      JSON.stringify({
        fromDate: "2026-07-30",
        toDate: "2026-07-30",
        halfDay: null,
        reason: "annual",
        reasonText: "",
        note: "Việc riêng",
        handoverEmployeeId: employeeId,
        makeupDate: null,
      }),
    ],
  );
  const code = filed.rows[0].r.code;
  const request = await client.query("select id, version from lg_request where code = $1", [code]);
  const requestId = request.rows[0].id;

  // ------------------------------------------------------- what is waiting
  let list = await waiting();
  const mine = list.find((row) => row.code === code);
  check("a pending request is on the waiting list", mine !== undefined);
  check("with the figures the message needs", mine?.fullName === "Bùi Văn Chờ Duyệt" &&
    mine?.remindersSent === 0 && mine?.computedMinutes === 480, JSON.stringify(mine));
  check(
    "and no leave reason — the room does not need one",
    !JSON.stringify(mine ?? {}).includes("Việc riêng"),
    JSON.stringify(mine ?? {}),
  );

  // ------------------------------------------------------ one nudge, once
  const first = await client.query("select lg_claim_reminder($1::uuid, 1::smallint) as r", [
    requestId,
  ]);
  check("the first stage can be claimed", first.rows[0].r === true);

  const again = await client.query("select lg_claim_reminder($1::uuid, 1::smallint) as r", [
    requestId,
  ]);
  check("and never twice — a second run posts nothing", again.rows[0].r === false);

  list = await waiting();
  check(
    "the waiting list now says one nudge has gone",
    list.find((row) => row.code === code)?.remindersSent === 1,
  );

  const second = await client.query("select lg_claim_reminder($1::uuid, 2::smallint) as r", [
    requestId,
  ]);
  check("the second stage is still available", second.rows[0].r === true);

  const secondAgain = await client.query("select lg_claim_reminder($1::uuid, 2::smallint) as r", [
    requestId,
  ]);
  check("and it too goes only once", secondAgain.rows[0].r === false);

  const backwards = await client.query("select lg_claim_reminder($1::uuid, 1::smallint) as r", [
    requestId,
  ]);
  check("a stage already passed cannot be claimed again", backwards.rows[0].r === false);

  const audit = await client.query(
    "select count(*)::int as n from lg_audit where entity_id = $1 and action = 'sla_reminder'",
    [requestId],
  );
  check("both nudges are audited, and only twice", audit.rows[0].n === 2);

  // ------------------------------------------------- a claim stops the clock
  const claimed = await client.query(
    `select lg_submit_request('', '', '', 'leave'::lg_request_kind, $2::jsonb, 480, 'sla-2', $1::uuid) as r`,
    [
      employeeId,
      JSON.stringify({
        fromDate: "2026-07-31",
        toDate: "2026-07-31",
        halfDay: null,
        reason: "annual",
        reasonText: "",
        note: "Việc riêng",
        handoverEmployeeId: employeeId,
        makeupDate: null,
      }),
    ],
  );
  const claimedRow = await client.query("select id, version from lg_request where code = $1", [
    claimed.rows[0].r.code,
  ]);
  await client.query("select lg_claim_request($1::uuid, $2::int, $3, 30)", [
    claimedRow.rows[0].id,
    claimedRow.rows[0].version,
    DIEU,
  ]);

  list = await waiting();
  check(
    "a claimed request drops off the waiting list — the clock stops",
    !list.some((row) => row.code === claimed.rows[0].r.code),
  );
  const claimedNudge = await client.query("select lg_claim_reminder($1::uuid, 1::smallint) as r", [
    claimedRow.rows[0].id,
  ]);
  check("and no nudge can be claimed for it", claimedNudge.rows[0].r === false);

  // ------------------------------------------------------ decided requests
  await client.query("select lg_decide_request($1::uuid, $2::int, $3, 'approved', null, 30)", [
    requestId,
    (await client.query("select version from lg_request where id = $1", [requestId])).rows[0]
      .version,
    DIEU,
  ]);
  list = await waiting();
  check("a decided request is off the list too", !list.some((row) => row.code === code));

  const badStage = await raises("select lg_claim_reminder($1::uuid, 3::smallint)", [requestId]);
  check("there are only two stages", badStage !== null, String(badStage));

  // ------------------------------------------------------- the approvers
  const names = await client.query("select lg_approver_names() as r");
  check("the approver names are available for the second nudge", names.rows[0].r.includes("Chị Diệu"));

  // ---------------------------------------------------------- the grants
  const grants = await client.query(
    `select
       has_function_privilege('anon', 'lg_requests_awaiting_decision()', 'execute') as anon_list,
       has_function_privilege('anon', 'lg_claim_reminder(uuid,smallint)', 'execute') as anon_claim,
       has_function_privilege('authenticated', 'lg_claim_reminder(uuid,smallint)', 'execute') as auth_claim`,
  );
  const g = grants.rows[0];
  check(
    "no browser can drive the reminder run",
    !g.anon_list && !g.anon_claim && !g.auth_claim,
    JSON.stringify(g),
  );
}

try {
  await main();
} finally {
  await client.query("rollback").catch(() => {});
  await client.end();
}

console.log(`\n${passed} đạt, ${failed} không đạt.`);
process.exit(failed === 0 ? 0 : 1);
