// End-to-end verification for filing on behalf and the overview counts —
// PRD rule 6 and section XII. One transaction, rolled back.
//
// Run: npm run verify:supervisor
import pg from "pg";

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("SUPABASE_DB_URL chưa được đặt (dùng node --env-file=.env.local).");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
let passed = 0;
let failed = 0;

const QUAN = "zz.quan@ctyhp.vn"; // supervisor of Xưởng A
const LAN = "zz.lan@ctyhp.vn"; // supervisor of a workshop with nobody in it
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
  await client.query("savepoint sup_check");
  try {
    await client.query(sql, params);
    await client.query("rollback to savepoint sup_check");
    return null;
  } catch (cause) {
    await client.query("rollback to savepoint sup_check");
    return cause.message;
  }
}

const LEAVE_DETAIL = {
  fromDate: "2026-07-30",
  toDate: "2026-07-30",
  halfDay: null,
  reason: "annual",
  reasonText: "",
  note: "Việc gia đình",
  makeupDate: null,
};

function onBehalf(employeeId, email, device) {
  return client.query(
    `select lg_submit_on_behalf($1::uuid, 'leave'::lg_request_kind, $2::jsonb, 480, $3, $4) as r`,
    [employeeId, JSON.stringify({ ...LEAVE_DETAIL, handoverEmployeeId: employeeId }), device, email],
  );
}

async function main() {
  await client.connect();
  await client.query("begin");

  await client.query(
    `insert into lg_app_user (email, full_name, role, department, active) values
       ($1, 'Anh Quân', 'supervisor', 'Xưởng A',      true),
       ($2, 'Chị Lan',  'supervisor', 'Xưởng Đã Đóng', true),
       ($3, 'Chị Diệu', 'approver',   null,           true)`,
    [QUAN, LAN, DIEU],
  );

  // 0001 already refuses a supervisor with no workshop, which is why
  // lg_submit_on_behalf's "no department" branch should never be reached.
  const supervisorWithoutWorkshop = await raises(
    `insert into lg_app_user (email, full_name, role, department) values ($1, 'Không xưởng', 'supervisor', null)`,
    ["zz.khongxuong@ctyhp.vn"],
  );
  check(
    "the database refuses a supervisor with no workshop at all",
    supervisorWithoutWorkshop !== null,
  );

  const people = await client.query(
    `insert into lg_employee (code, full_name, title, department, active) values
       ('ZZSUP001', 'Trần Văn Xưởng A', 'Công nhân', 'Xưởng A', true),
       ('ZZSUP002', 'Lý Thị Xưởng B',   'Công nhân', 'Xưởng B', true),
       ('ZZSUP003', 'Hồ Văn Nghỉ Việc', 'Công nhân', 'Xưởng A', false)
     returning id, code`,
  );
  const byCode = Object.fromEntries(people.rows.map((r) => [r.code, r.id]));

  // ------------------------------------------------------ who is on the list
  const list = await client.query("select lg_supervisor_employees($1) as r", [QUAN]);
  const names = list.rows[0].r.map((p) => p.fullName);
  check("the list holds this supervisor's own workshop", names.includes("Trần Văn Xưởng A"));
  check("and nobody from another workshop", !names.includes("Lý Thị Xưởng B"));
  check("and nobody who has left", !names.includes("Hồ Văn Nghỉ Việc"));
  check(
    "and never the employee number",
    !JSON.stringify(list.rows[0].r).includes("ZZSUP001"),
    JSON.stringify(list.rows[0].r),
  );

  const emptyList = await client.query("select lg_supervisor_employees($1) as r", [LAN]);
  check(
    "a supervisor whose workshop holds nobody gets an empty list, not everybody",
    Array.isArray(emptyList.rows[0].r) && emptyList.rows[0].r.length === 0,
  );

  const approverList = await client.query("select lg_supervisor_employees($1) as r", [DIEU]);
  check("an approver gets no list at all", approverList.rows[0].r.length === 0);

  // ------------------------------------------------------------- rule 6
  const filed = await onBehalf(byCode.ZZSUP001, QUAN, "sup-1");
  check("a supervisor files for their own workshop", typeof filed.rows[0].r.code === "string");

  const stored = await client.query(
    "select filed_by_email, status, computed_minutes from lg_request where code = $1",
    [filed.rows[0].r.code],
  );
  check(
    "and the request records who filed it, still pending",
    stored.rows[0].filed_by_email === QUAN && stored.rows[0].status === "pending",
    JSON.stringify(stored.rows[0]),
  );

  const otherWorkshop = await raises(
    `select lg_submit_on_behalf($1::uuid, 'leave'::lg_request_kind, $2::jsonb, 480, $3, $4)`,
    [byCode.ZZSUP002, JSON.stringify({ ...LEAVE_DETAIL, handoverEmployeeId: byCode.ZZSUP002 }), "sup-2", QUAN],
  );
  check("filing for another workshop is refused", otherWorkshop !== null);
  check(
    "and says why",
    (otherWorkshop ?? "").includes("xưởng của mình"),
    otherWorkshop ?? "",
  );

  const wrongWorkshop = await raises(
    `select lg_submit_on_behalf($1::uuid, 'leave'::lg_request_kind, $2::jsonb, 480, $3, $4)`,
    [byCode.ZZSUP001, JSON.stringify({ ...LEAVE_DETAIL, handoverEmployeeId: byCode.ZZSUP001 }), "sup-3", LAN],
  );
  check("a supervisor cannot file for a workshop that is not theirs", wrongWorkshop !== null);

  const approverFiling = await raises(
    `select lg_submit_on_behalf($1::uuid, 'leave'::lg_request_kind, $2::jsonb, 480, $3, $4)`,
    [byCode.ZZSUP001, JSON.stringify({ ...LEAVE_DETAIL, handoverEmployeeId: byCode.ZZSUP001 }), "sup-4", QUAN.replace("quan", "khong-ai")],
  );
  check("an unknown account cannot file on behalf", approverFiling !== null);

  const inactive = await raises(
    `select lg_submit_on_behalf($1::uuid, 'leave'::lg_request_kind, $2::jsonb, 480, $3, $4)`,
    [byCode.ZZSUP003, JSON.stringify({ ...LEAVE_DETAIL, handoverEmployeeId: byCode.ZZSUP003 }), "sup-5", QUAN],
  );
  check("filing for somebody who has left is refused", inactive !== null);

  // ---------------------------------------------------------- the overview
  const before = await client.query("select lg_overview($1::date, $2::date) as r", [
    "2026-07-01",
    "2026-07-31",
  ]);
  check("the overview counts the pending request", before.rows[0].r.pending >= 1);
  check(
    "and carries no name and no reason",
    !JSON.stringify(before.rows[0].r).includes("Trần Văn") &&
      !JSON.stringify(before.rows[0].r).includes("Việc gia đình"),
    JSON.stringify(before.rows[0].r),
  );

  const request = await client.query("select id, version from lg_request where code = $1", [
    filed.rows[0].r.code,
  ]);
  await client.query("select lg_decide_request($1::uuid, $2::int, $3, 'approved', null, 30)", [
    request.rows[0].id,
    request.rows[0].version,
    DIEU,
  ]);

  const after = await client.query("select lg_overview($1::date, $2::date) as r", [
    "2026-07-01",
    "2026-07-31",
  ]);
  check(
    "approving moves the hours into the period total",
    after.rows[0].r.leaveMinutes >= 480,
    JSON.stringify(after.rows[0].r),
  );
  check("and the row shows as not yet marked", after.rows[0].r.unmarked >= 1);

  const outside = await client.query("select lg_overview($1::date, $2::date) as r", [
    "2026-09-01",
    "2026-09-30",
  ]);
  check(
    "a period with nothing in it reports zero hours",
    Number(outside.rows[0].r.leaveMinutes) === 0,
    JSON.stringify(outside.rows[0].r),
  );

  // ------------------------------------------------------------- the grants
  const grants = await client.query(
    `select
       has_function_privilege('anon', 'lg_submit_on_behalf(uuid,lg_request_kind,jsonb,integer,text,text)', 'execute') as anon_file,
       has_function_privilege('authenticated', 'lg_submit_on_behalf(uuid,lg_request_kind,jsonb,integer,text,text)', 'execute') as auth_file,
       has_function_privilege('anon', 'lg_supervisor_employees(text)', 'execute') as anon_list,
       has_function_privilege('anon', 'lg_overview(date,date)', 'execute') as anon_overview`,
  );
  const g = grants.rows[0];
  check(
    "no browser can call these directly",
    !g.anon_file && !g.auth_file && !g.anon_list && !g.anon_overview,
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
