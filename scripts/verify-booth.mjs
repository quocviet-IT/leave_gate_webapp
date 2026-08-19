// End-to-end verification for the gate booth — PRD section VIII, rules 13, 14
// and 19. Everything runs in one transaction and is rolled back.
//
// Run: npm run verify:booth
import pg from "pg";
import { randomBytes } from "node:crypto";

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("SUPABASE_DB_URL chưa được đặt (dùng node --env-file=.env.local).");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
let passed = 0;
let failed = 0;

const BOOTH_NAME = "ZZ Bốt kiểm thử";
const PIN = "8317";

function token() {
  return randomBytes(32).toString("hex");
}

function check(name, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`ok   ${name}`);
  } else {
    failed++;
    console.log(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function raises(sql, params) {
  await client.query("savepoint booth_check");
  try {
    await client.query(sql, params);
    await client.query("rollback to savepoint booth_check");
    return null;
  } catch (cause) {
    await client.query("rollback to savepoint booth_check");
    return cause.message;
  }
}

/** A gate pass leaving today, so it lands on the booth's board. */
async function gatePass(employeeId, device, hoursFromNow = 0) {
  const result = await client.query(
    `select lg_submit_request($1::uuid, 'gate'::lg_request_kind, $2::jsonb, 180, $3) as r`,
    [
      employeeId,
      JSON.stringify({
        reason: "business_trip",
        reasonText: "",
        note: "Giao hàng cho khách",
        outAt: new Date(Date.now() + hoursFromNow * 3600_000).toISOString(),
        expectedInAt: new Date(Date.now() + (hoursFromNow + 3) * 3600_000).toISOString(),
      }),
      device,
    ],
  );
  const filed = result.rows[0].r;
  await client.query("update lg_request set status = 'approved' where code = $1", [filed.code]);
  const row = await client.query("select id from lg_request where code = $1", [filed.code]);
  return { ...filed, id: row.rows[0].id };
}

async function gateRow(requestId) {
  const result = await client.query(
    `select booth_out_at, booth_in_at, actual_in_at, actual_in_source, drift_minutes, drift_reason
     from lg_gate_detail where request_id = $1`,
    [requestId],
  );
  return result.rows[0];
}

async function main() {
  await client.connect();
  await client.query("begin");

  const employee = await client.query(
    `insert into lg_employee (code, full_name, title, department, active)
     values ('ZZBOOTH1', 'Đỗ Thị Ra Cổng', 'Công nhân', 'Sản xuất', true)
     returning id`,
  );
  const employeeId = employee.rows[0].id;

  // ------------------------------------------------------------ the PIN
  await client.query("select lg_set_booth_pin($1, $2, $3)", [BOOTH_NAME, PIN, "khoa@ctyhp.vn"]);
  check("C&B can set a booth PIN", true);

  const shortPin = await raises("select lg_set_booth_pin($1, $2, $3)", [
    BOOTH_NAME,
    "12",
    "khoa@ctyhp.vn",
  ]);
  check("a PIN under four characters is refused", shortPin !== null);

  const stored = await client.query("select pin_hash from lg_booth where name = $1", [BOOTH_NAME]);
  check(
    "the PIN is never stored in clear",
    stored.rows[0].pin_hash !== PIN && stored.rows[0].pin_hash.startsWith("$2"),
    stored.rows[0].pin_hash.slice(0, 8),
  );

  // -------------------------------------------------------- signing in
  const wrong = await client.query("select lg_booth_sign_in($1, $2, 30) as r", ["0000", token()]);
  check("a wrong PIN buys no session", wrong.rows[0].r === null);

  const boothToken = token();
  const signedIn = await client.query("select lg_booth_sign_in($1, $2, 30) as r", [PIN, boothToken]);
  check("the right PIN opens a session", signedIn.rows[0].r?.name === BOOTH_NAME);

  const session = await client.query("select lg_booth_session_booth($1) as r", [boothToken]);
  check("the session token identifies the booth", session.rows[0].r?.name === BOOTH_NAME);

  const madeUp = await client.query("select lg_booth_session_booth($1) as r", ["f".repeat(64)]);
  check("a made-up token identifies nothing", madeUp.rows[0].r === null);

  // ------------------------------------------------------- today's board
  const today = await gatePass(employeeId, "booth-today");
  const board = await client.query("select lg_booth_today($1) as r", [boothToken]);
  const rows = board.rows[0].r.rows;
  check("today's gate pass is on the board", rows.some((r) => r.code === today.code));
  check(
    "the board carries no reason and no note — rules 14 and 19",
    !JSON.stringify(rows).includes("Giao hàng cho khách") &&
      !JSON.stringify(rows).includes("business_trip"),
    JSON.stringify(rows[0] ?? {}),
  );

  const leaveRequest = await client.query(
    `select lg_submit_request($1::uuid, 'leave'::lg_request_kind, $2::jsonb, 480, $3) as r`,
    [
      employeeId,
      JSON.stringify({
        fromDate: "2026-07-30",
        toDate: "2026-07-30",
        halfDay: null,
        reason: "sick",
        reasonText: "",
        note: "Đi khám",
        handoverEmployeeId: employeeId,
        makeupDate: null,
      }),
      "booth-leave",
    ],
  );
  await client.query("update lg_request set status = 'approved' where code = $1", [
    leaveRequest.rows[0].r.code,
  ]);
  const board2 = await client.query("select lg_booth_today($1) as r", [boothToken]);
  check(
    "a leave request never reaches the booth",
    !board2.rows[0].r.rows.some((r) => r.code === leaveRequest.rows[0].r.code),
  );

  const undecided = await gatePass(employeeId, "booth-pending");
  await client.query("update lg_request set status = 'pending', decided_at = null where code = $1", [
    undecided.code,
  ]);
  const board3 = await client.query("select lg_booth_today($1) as r", [boothToken]);
  check(
    "an undecided gate pass never reaches the booth",
    !board3.rows[0].r.rows.some((r) => r.code === undecided.code),
  );

  const noSession = await raises("select lg_booth_today($1)", ["a".repeat(64)]);
  check("the board is refused without a live session", noSession !== null);

  // --------------------------------------------------------- the two taps
  const inFirst = await raises("select lg_booth_stamp($1, $2::uuid, 'in')", [
    boothToken,
    today.id,
  ]);
  check("Cho vào before Cho ra is refused", inFirst !== null);
  check(
    "and the refusal explains the order",
    (inFirst ?? "").includes("Cho ra trước"),
    inFirst ?? "",
  );

  await client.query("select lg_booth_stamp($1, $2::uuid, 'out')", [boothToken, today.id]);
  let detail = await gateRow(today.id);
  check("Cho ra records the exit", detail.booth_out_at !== null);
  check("Cho ra does not touch the payroll figure", detail.actual_in_at === null);

  const twice = await raises("select lg_booth_stamp($1, $2::uuid, 'out')", [boothToken, today.id]);
  check("Cho ra twice is refused", twice !== null);

  await client.query("select lg_booth_stamp($1, $2::uuid, 'in')", [boothToken, today.id]);
  detail = await gateRow(today.id);
  check("Cho vào records the return", detail.booth_in_at !== null);
  check(
    "and the guard's time becomes the payroll figure — rule 13",
    detail.actual_in_source === "booth" &&
      detail.actual_in_at.getTime() === detail.booth_in_at.getTime(),
    JSON.stringify(detail),
  );
  check(
    "with the drift computed against the expected return",
    typeof detail.drift_minutes === "number",
    String(detail.drift_minutes),
  );

  // Rule 13 again, from the other direction: the booth overrides what the
  // employee had already entered.
  const overridden = await gatePass(employeeId, "booth-override");
  await client.query(
    `update lg_gate_detail
     set actual_in_at = now() - interval '1 hour',
         actual_in_source = 'employee',
         drift_minutes = -60,
         drift_reason = 'Về sớm'
     where request_id = $1`,
    [overridden.id],
  );
  await client.query("select lg_booth_stamp($1, $2::uuid, 'out')", [boothToken, overridden.id]);
  await client.query("select lg_booth_stamp($1, $2::uuid, 'in')", [boothToken, overridden.id]);
  const overrode = await gateRow(overridden.id);
  check(
    "the booth overrides what the employee entered",
    overrode.actual_in_source === "booth" &&
      overrode.actual_in_at.getTime() === overrode.booth_in_at.getTime(),
  );
  check("and keeps the employee's reason for the record", overrode.drift_reason === "Về sớm");

  // ------------------------------------------------------------- the undo
  await client.query("select lg_booth_undo($1, $2::uuid, 'in', 5)", [boothToken, today.id]);
  detail = await gateRow(today.id);
  check(
    "undoing Cho vào clears the return and the payroll figure it set",
    detail.booth_in_at === null && detail.actual_in_at === null && detail.actual_in_source === null,
    JSON.stringify(detail),
  );

  await client.query("select lg_booth_undo($1, $2::uuid, 'out', 5)", [boothToken, today.id]);
  detail = await gateRow(today.id);
  check("undoing Cho ra clears the exit", detail.booth_out_at === null);

  await client.query("select lg_booth_stamp($1, $2::uuid, 'out')", [boothToken, today.id]);
  // now() is the transaction's start time and does not move, so a window of
  // zero would compare an instant with itself. Age the tap instead — which is
  // what actually happens at the gate.
  await client.query(
    "update lg_gate_detail set booth_out_at = now() - interval '10 minutes' where request_id = $1",
    [today.id],
  );
  const tooLate = await raises("select lg_booth_undo($1, $2::uuid, 'out', 5)", [
    boothToken,
    today.id,
  ]);
  check("past the undo window it is refused", tooLate !== null);
  check(
    "and points at C&B",
    (tooLate ?? "").includes("C&B"),
    tooLate ?? "",
  );

  const nothingToUndo = await raises("select lg_booth_undo($1, $2::uuid, 'in', 5)", [
    boothToken,
    today.id,
  ]);
  check("undoing a tap that never happened is refused", nothingToUndo !== null);

  // ----------------------------------------------------------- signing out
  await client.query("select lg_booth_sign_out($1)", [boothToken]);
  const goneSession = await client.query("select lg_booth_session_booth($1) as r", [boothToken]);
  check("signing out ends the session", goneSession.rows[0].r === null);

  const liveToken = token();
  await client.query("select lg_booth_sign_in($1, $2, 30) as r", [PIN, liveToken]);
  await client.query("select lg_set_booth_pin($1, $2, $3)", [BOOTH_NAME, "9264", "khoa@ctyhp.vn"]);
  const afterPinChange = await client.query("select lg_booth_session_booth($1) as r", [liveToken]);
  check("changing the PIN locks every booth machine out", afterPinChange.rows[0].r === null);

  // ------------------------------------------------------------ the grants
  const grants = await client.query(
    `select
       has_function_privilege('anon', 'lg_booth_sign_in(text,text,integer)', 'execute') as anon_sign_in,
       has_function_privilege('anon', 'lg_booth_today(text)', 'execute') as anon_today,
       has_function_privilege('anon', 'lg_booth_stamp(text,uuid,text)', 'execute') as anon_stamp,
       has_function_privilege('authenticated', 'lg_booth_stamp(text,uuid,text)', 'execute') as auth_stamp`,
  );
  const g = grants.rows[0];
  check(
    "no browser can call the booth functions directly",
    !g.anon_sign_in && !g.anon_today && !g.anon_stamp && !g.auth_stamp,
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
