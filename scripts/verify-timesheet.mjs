// End-to-end verification for the timesheet — PRD section XI, rules 16 and 17.
// Everything runs in one transaction and is rolled back.
//
// Run: npm run verify:timesheet
import pg from "pg";

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("SUPABASE_DB_URL chưa được đặt (dùng node --env-file=.env.local).");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
let passed = 0;
let failed = 0;

const KHOA = "zz.khoa@ctyhp.vn";
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

async function raises(sql, params) {
  await client.query("savepoint sheet_check");
  try {
    await client.query(sql, params);
    await client.query("rollback to savepoint sheet_check");
    return null;
  } catch (cause) {
    await client.query("rollback to savepoint sheet_check");
    return cause.message;
  }
}

async function sheet(requestId) {
  const result = await client.query(
    "select computed_minutes, final_minutes, marked_at, marked_by_email from lg_timesheet where request_id = $1",
    [requestId],
  );
  return result.rows[0];
}

async function main() {
  await client.connect();
  await client.query("begin");

  await client.query(
    `insert into lg_app_user (email, full_name, role, active) values
       ($1, 'Chị Khoa', 'cnb', true),
       ($2, 'Chị Diệu', 'approver', true)`,
    [KHOA, DIEU],
  );

  const employee = await client.query(
    `insert into lg_employee (code, full_name, title, department, active)
     values ('ZZSHEET1', 'Vũ Thị Chấm Công', 'Công nhân', 'Sản xuất', true)
     returning id`,
  );
  const employeeId = employee.rows[0].id;

  const filed = await client.query(
    `select lg_submit_request('', '', '', 'leave'::lg_request_kind, $2::jsonb, 480, 'sheet-1', $1::uuid) as r`,
    [
      employeeId,
      JSON.stringify({
        fromDate: "2026-07-30",
        toDate: "2026-07-30",
        halfDay: null,
        reason: "annual",
        reasonText: "",
        note: "Về quê",
        handoverEmployeeId: employeeId,
        makeupDate: null,
      }),
    ],
  );
  const code = filed.rows[0].r.code;
  const found = await client.query("select id, version from lg_request where code = $1", [code]);
  const requestId = found.rows[0].id;

  // Approving is what puts a row on the timesheet at all.
  await client.query("select lg_decide_request($1::uuid, $2::int, $3, 'approved', null, 30)", [
    requestId,
    found.rows[0].version,
    DIEU,
  ]);
  let current = await sheet(requestId);
  check(
    "approving puts the request on the timesheet, final equal to computed",
    current.computed_minutes === 480 && current.final_minutes === 480,
    JSON.stringify(current),
  );

  // ---------------------------------------------------------------- rule 16
  const noReason = await raises("select lg_set_final_hours($1::uuid, $2::int, $3, $4)", [
    requestId,
    240,
    "",
    KHOA,
  ]);
  check("changing the final hours with no reason is refused", noReason !== null);

  const shortReason = await raises("select lg_set_final_hours($1::uuid, $2::int, $3, $4)", [
    requestId,
    240,
    "sai giờ",
    KHOA,
  ]);
  check("a reason under ten characters is refused", shortReason !== null);
  check(
    "and the refusal says how long it has to be",
    (shortReason ?? "").includes("10 ký tự"),
    shortReason ?? "",
  );

  await client.query("select lg_set_final_hours($1::uuid, $2::int, $3, $4)", [
    requestId,
    240,
    "Nghỉ nửa ngày theo xác nhận quản đốc",
    KHOA,
  ]);
  current = await sheet(requestId);
  check("a reason of ten characters or more saves the change", current.final_minutes === 240);
  check("and the computed hours are untouched — rule 17", current.computed_minutes === 480);

  const trail = await client.query(
    `select old_minutes, new_minutes, reason, changed_by
     from lg_hours_adjustment where request_id = $1 order by changed_at`,
    [requestId],
  );
  check(
    "the edit trail keeps the old value, the new value, the reason and the editor",
    trail.rowCount === 1 &&
      trail.rows[0].old_minutes === 480 &&
      trail.rows[0].new_minutes === 240 &&
      trail.rows[0].reason.startsWith("Nghỉ nửa ngày") &&
      trail.rows[0].changed_by === KHOA,
    JSON.stringify(trail.rows),
  );

  // Putting the figure back is not an adjustment to justify.
  await client.query("select lg_set_final_hours($1::uuid, $2::int, $3, $4)", [
    requestId,
    480,
    "",
    KHOA,
  ]);
  current = await sheet(requestId);
  check("putting the hours back needs no reason", current.final_minutes === 480);
  const trailAfter = await client.query(
    "select count(*)::int as n from lg_hours_adjustment where request_id = $1",
    [requestId],
  );
  check("but it is still written to the trail", trailAfter.rows[0].n === 2);

  const noChange = await client.query("select lg_set_final_hours($1::uuid, $2::int, $3, $4) as r", [
    requestId,
    480,
    "",
    KHOA,
  ]);
  check("saving the same figure again changes nothing", noChange.rows[0].r !== null);
  const trailSame = await client.query(
    "select count(*)::int as n from lg_hours_adjustment where request_id = $1",
    [requestId],
  );
  check("and writes no empty row to the trail", trailSame.rows[0].n === 2);

  // ------------------------------------------------------------- who may edit
  const approverEdit = await raises("select lg_set_final_hours($1::uuid, $2::int, $3, $4)", [
    requestId,
    240,
    "Người duyệt thử sửa giờ chốt",
    DIEU,
  ]);
  check("an approver cannot edit the final hours", approverEdit !== null);
  check(
    "and is told it is C&B's column",
    (approverEdit ?? "").includes("C&B"),
    approverEdit ?? "",
  );

  const strangerEdit = await raises("select lg_set_final_hours($1::uuid, $2::int, $3, $4)", [
    requestId,
    240,
    "Người lạ thử sửa giờ chốt",
    "khong-ai@ctyhp.vn",
  ]);
  check("nor can an account holding no role", strangerEdit !== null);

  // ------------------------------------------------------------ marking done
  await client.query("select lg_mark_timesheet($1::uuid, $2, true)", [requestId, KHOA]);
  current = await sheet(requestId);
  check(
    "marking records who marked it and when",
    current.marked_at !== null && current.marked_by_email === KHOA,
  );

  await client.query("select lg_mark_timesheet($1::uuid, $2, false)", [requestId, KHOA]);
  current = await sheet(requestId);
  check("and it can be taken back", current.marked_at === null && current.marked_by_email === null);

  const approverMark = await raises("select lg_mark_timesheet($1::uuid, $2, true)", [
    requestId,
    DIEU,
  ]);
  check("an approver cannot mark a row done", approverMark !== null);

  // ------------------------------------------------------- rejected requests
  const rejected = await client.query(
    `select lg_submit_request('', '', '', 'leave'::lg_request_kind, $2::jsonb, 480, 'sheet-2', $1::uuid) as r`,
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
  const rejectedRow = await client.query("select id, version from lg_request where code = $1", [
    rejected.rows[0].r.code,
  ]);
  await client.query("select lg_decide_request($1::uuid, $2::int, $3, 'rejected', null, 30)", [
    rejectedRow.rows[0].id,
    rejectedRow.rows[0].version,
    DIEU,
  ]);
  const rejectedSheet = await client.query(
    "select count(*)::int as n from lg_timesheet where request_id = $1",
    [rejectedRow.rows[0].id],
  );
  check("a rejected request never reaches the timesheet", rejectedSheet.rows[0].n === 0);

  // ------------------------------------------------------------- the grants
  const grants = await client.query(
    `select
       has_function_privilege('anon', 'lg_set_final_hours(uuid,integer,text,text)', 'execute') as anon_edit,
       has_function_privilege('authenticated', 'lg_set_final_hours(uuid,integer,text,text)', 'execute') as auth_edit,
       has_function_privilege('anon', 'lg_mark_timesheet(uuid,text,boolean)', 'execute') as anon_mark`,
  );
  const g = grants.rows[0];
  check(
    "no browser can call the timesheet functions directly",
    !g.anon_edit && !g.auth_edit && !g.anon_mark,
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
