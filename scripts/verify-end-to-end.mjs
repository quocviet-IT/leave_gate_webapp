// One request, all the way through — PRD build step 11.
//
// File → approve → the guard's two taps → the timesheet, over the real database
// and against a running server, then delete everything it made. Unlike the
// verify:* scripts this one COMMITS: the whole point is that the pages the
// employee, the approver and the guard open are served over HTTP from data that
// really exists. A transaction rolled back would be invisible to all of them.
//
// Run: npm run verify:e2e -- http://localhost:3117
import pg from "pg";
import { randomBytes } from "node:crypto";

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("SUPABASE_DB_URL chưa được đặt (dùng node --env-file=.env.local).");
  process.exit(1);
}

const base =
  process.argv.slice(2).find((arg) => arg.startsWith("http")) ?? "http://localhost:3000";
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

const EMPLOYEE_CODE = "ZZE2E001";
const EMPLOYEE_NAME = "Ngô Thị Xuyên Suốt";
const BOOTH_NAME = "ZZ Bốt xuyên suốt";
const BOOTH_PIN = "4471";
const APPROVER = "zz.e2e.dieu@ctyhp.vn";
const CNB = "zz.e2e.khoa@ctyhp.vn";

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

function step(title) {
  console.log(`\n--- ${title}`);
}

async function get(path) {
  const response = await fetch(`${base}${path}`);
  return { status: response.status, html: await response.text() };
}

function clean(html) {
  return !/Application error|Unhandled Runtime Error|__next_error__/.test(html);
}

/** Removes everything this run created, in foreign-key order. Safe to re-run. */
async function cleanUp() {
  const scoped = `
    select r.id from lg_request r
    join lg_employee e on e.id = r.employee_id
    where e.code = $1`;
  await client.query(
    `delete from lg_audit where entity = 'lg_request' and entity_id in (select id::text from (${scoped}) s)`,
    [EMPLOYEE_CODE],
  );
  for (const table of ["lg_hours_adjustment", "lg_timesheet", "lg_leave_detail", "lg_gate_detail"]) {
    await client.query(`delete from ${table} where request_id in (${scoped})`, [EMPLOYEE_CODE]);
  }
  await client.query(
    "delete from lg_request where employee_id in (select id from lg_employee where code = $1)",
    [EMPLOYEE_CODE],
  );
  await client.query(
    "delete from lg_submit_attempt where employee_id in (select id from lg_employee where code = $1)",
    [EMPLOYEE_CODE],
  );
  await client.query("delete from lg_employee where code = $1", [EMPLOYEE_CODE]);
  await client.query(
    "delete from lg_booth_session where booth_id in (select id from lg_booth where name = $1)",
    [BOOTH_NAME],
  );
  await client.query(
    `delete from lg_audit where entity = 'lg_booth'
       and entity_id in (select id::text from lg_booth where name = $1)`,
    [BOOTH_NAME],
  );
  await client.query("delete from lg_booth where name = $1", [BOOTH_NAME]);
  await client.query("delete from lg_app_user where email in ($1, $2)", [APPROVER, CNB]);
}

async function main() {
  await client.connect();
  await cleanUp();

  await client.query(
    `insert into lg_app_user (email, full_name, role, active) values
       ($1, 'Chị Diệu (E2E)', 'approver', true),
       ($2, 'Chị Khoa (E2E)', 'cnb', true)`,
    [APPROVER, CNB],
  );
  const employee = await client.query(
    `insert into lg_employee (code, full_name, title, department, active)
     values ($1, $2, 'Công nhân', 'Sản xuất', true) returning id`,
    [EMPLOYEE_CODE, EMPLOYEE_NAME],
  );
  const employeeId = employee.rows[0].id;

  // ------------------------------------------------------------ 1. filing
  step("1. Nhân viên gửi giấy ra vào cổng");
  const twoHoursAgo = new Date(Date.now() - 2 * 3600_000).toISOString();
  const inOneHour = new Date(Date.now() + 3600_000).toISOString();
  const filed = (
    await client.query(
      `select lg_submit_request('', '', '', 'gate'::lg_request_kind, $2::jsonb, 180, 'e2e-phone', $1::uuid) as r`,
      [
        employeeId,
        JSON.stringify({
          reason: "business_trip",
          reasonText: "",
          note: "Giao hàng cho khách ở Biên Hoà",
          outAt: twoHoursAgo,
          expectedInAt: inOneHour,
        }),
      ],
    )
  ).rows[0].r;
  check("filing returns a request code and a private token", /^RC-\d{4}-\d{4}$/.test(filed.code));

  const tracking = await get(`/tra-cuu/${filed.token}`);
  check("the employee's tracking page opens", tracking.status === 200 && clean(tracking.html));
  check("and shows the request as waiting", tracking.html.includes("Chờ duyệt"));

  const byCode = await get(`/tra-cuu?ma=${encodeURIComponent(filed.code)}`);
  check("the code alone answers with a status", byCode.html.includes("Chờ duyệt"));
  check("and never with the name", !byCode.html.includes(EMPLOYEE_NAME));

  const request = await client.query("select id, version from lg_request where code = $1", [
    filed.code,
  ]);
  const requestId = request.rows[0].id;

  // --------------------------------------------------------- 2. approving
  step("2. Người duyệt nhận và duyệt");
  await client.query("select lg_claim_request($1::uuid, $2::int, $3, 30)", [
    requestId,
    request.rows[0].version,
    APPROVER,
  ]);
  const claimed = await client.query("select version, status from lg_request where id = $1", [
    requestId,
  ]);
  check("claiming holds the request", claimed.rows[0].status === "claimed");

  await client.query("select lg_decide_request($1::uuid, $2::int, $3, 'approved', $4, 30)", [
    requestId,
    claimed.rows[0].version,
    APPROVER,
    "Đồng ý",
  ]);
  const approved = await client.query("select status, version from lg_request where id = $1", [
    requestId,
  ]);
  check("approving stands", approved.rows[0].status === "approved");

  const secondDecision = await client
    .query("select lg_decide_request($1::uuid, $2::int, $3, 'rejected', null, 30)", [
      requestId,
      approved.rows[0].version,
      CNB,
    ])
    .then(() => null)
    .catch((cause) => cause.message);
  check("and a second decision is refused", secondDecision !== null);

  const afterApproval = await get(`/tra-cuu/${filed.token}`);
  check("the employee's page now says approved", afterApproval.html.includes("Đã duyệt"));

  const printed = await get(`/tra-cuu/${filed.token}/in`);
  check(
    "and the paper form prints",
    printed.status === 200 && printed.html.includes("GIẤY XIN PHÉP RA VÀO CỔNG"),
  );

  // ------------------------------------------------------------- 3. the gate
  step("3. Bảo vệ bấm Cho ra và Cho vào");
  await client.query("select lg_set_booth_pin($1, $2, $3)", [BOOTH_NAME, BOOTH_PIN, CNB]);
  const boothToken = randomBytes(32).toString("hex");
  const signIn = await client.query("select lg_booth_sign_in($1, $2, 30) as r", [
    BOOTH_PIN,
    boothToken,
  ]);
  check("the booth opens with its PIN", signIn.rows[0].r?.name === BOOTH_NAME);

  const board = await client.query("select lg_booth_today($1) as r", [boothToken]);
  const onBoard = board.rows[0].r.rows.find((row) => row.code === filed.code);
  check("the approved gate pass is on today's board", onBoard !== undefined);
  check(
    "and the board carries no reason — rules 14 and 19",
    !JSON.stringify(board.rows[0].r.rows).includes("Biên Hoà"),
  );

  await client.query("select lg_booth_stamp($1, $2::uuid, 'out')", [boothToken, requestId]);
  await client.query("select lg_booth_stamp($1, $2::uuid, 'in')", [boothToken, requestId]);
  const stamped = await client.query(
    `select booth_out_at, booth_in_at, actual_in_at, actual_in_source, drift_minutes
     from lg_gate_detail where request_id = $1`,
    [requestId],
  );
  check(
    "both taps are recorded",
    stamped.rows[0].booth_out_at !== null && stamped.rows[0].booth_in_at !== null,
  );
  check(
    "and the guard's time becomes the payroll figure — rule 13",
    stamped.rows[0].actual_in_source === "booth" &&
      stamped.rows[0].actual_in_at.getTime() === stamped.rows[0].booth_in_at.getTime(),
  );

  const afterGate = await get(`/tra-cuu/${filed.token}`);
  check(
    "the employee sees the real return time",
    afterGate.html.includes("Giờ vào lại thực tế") && clean(afterGate.html),
  );

  // -------------------------------------------------------- 4. the timesheet
  step("4. Chấm công");
  const sheet = await client.query(
    "select computed_minutes, final_minutes, marked_at from lg_timesheet where request_id = $1",
    [requestId],
  );
  check(
    "the request reached the timesheet with its computed hours",
    sheet.rows[0].computed_minutes === 180 && sheet.rows[0].final_minutes === 180,
    JSON.stringify(sheet.rows[0]),
  );

  const noReason = await client
    .query("select lg_set_final_hours($1::uuid, 120::int, '', $2)", [requestId, CNB])
    .then(() => null)
    .catch((cause) => cause.message);
  check("editing the final hours without a reason is refused — rule 16", noReason !== null);

  await client.query("select lg_set_final_hours($1::uuid, 120::int, $2, $3)", [
    requestId,
    "Về sớm hơn dự kiến, xác nhận với quản đốc",
    CNB,
  ]);
  const edited = await client.query(
    "select computed_minutes, final_minutes from lg_timesheet where request_id = $1",
    [requestId],
  );
  check(
    "with a reason it saves, and the computed hours stay locked — rule 17",
    edited.rows[0].final_minutes === 120 && edited.rows[0].computed_minutes === 180,
  );

  const trail = await client.query(
    "select old_minutes, new_minutes, reason, changed_by from lg_hours_adjustment where request_id = $1",
    [requestId],
  );
  check(
    "and the edit trail names the old value, the new value and the editor",
    trail.rowCount === 1 && trail.rows[0].old_minutes === 180 && trail.rows[0].changed_by === CNB,
  );

  await client.query("select lg_mark_timesheet($1::uuid, $2, true)", [requestId, CNB]);
  const marked = await client.query(
    "select marked_at, marked_by_email from lg_timesheet where request_id = $1",
    [requestId],
  );
  check("marking it done records who and when", marked.rows[0].marked_by_email === CNB);

  // ---------------------------------------------------------- 5. the record
  step("5. Dấu vết để lại");
  const audit = await client.query(
    "select action from lg_audit where entity_id = $1 order by at",
    [requestId],
  );
  const actions = audit.rows.map((row) => row.action);
  for (const expected of [
    "submit",
    "claim",
    "decide",
    "booth_out",
    "booth_in",
    "set_final_hours",
    "timesheet_mark",
  ]) {
    check(`the audit log holds "${expected}"`, actions.includes(expected), actions.join(", "));
  }
}

try {
  await main();
} finally {
  await cleanUp().catch((cause) => {
    console.error(`Dọn dữ liệu kiểm thử thất bại: ${cause.message}`);
    failed++;
  });
  await client.end();
}

console.log(`\n${passed} đạt, ${failed} không đạt.`);
process.exit(failed === 0 ? 0 : 1);
