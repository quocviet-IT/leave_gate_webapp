// Render the two lookup depths against a running server, with real data.
//
// The check seeds one leave request and one approved gate pass, renders every
// page that shows them, then deletes both. Seeding is the point: `verify:lookup`
// rolls its transaction back, so nothing it creates is ever visible over HTTP,
// and a page that throws at render time would otherwise pass unnoticed.
//
// Run: npm run smoke:lookup -- http://localhost:3117
import pg from "pg";

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("SUPABASE_DB_URL chưa được đặt.");
  process.exit(1);
}

const base =
  process.argv.slice(2).find((arg) => arg.startsWith("http")) ?? "http://localhost:3000";
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

const EMPLOYEE_CODE = "ZZSMOKE1";
const EMPLOYEE_NAME = "Trần Thị Khói Kiểm";

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

function noRenderError(html) {
  return !/Application error|Unhandled Runtime Error|__next_error__/.test(html);
}

async function get(path) {
  const response = await fetch(`${base}${path}`);
  return { status: response.status, html: await response.text() };
}

async function file(employeeId, kind, detail, minutes, device) {
  const result = await client.query(
    "select lg_submit_request($1::uuid, $2::lg_request_kind, $3::jsonb, $4::int, $5) as r",
    [employeeId, kind, JSON.stringify(detail), minutes, device],
  );
  return result.rows[0].r;
}

/** Deletes the seeded rows in foreign-key order. Safe to run twice. */
async function cleanUp() {
  await client.query(
    `with seeded as (
       select r.id from lg_request r
       join lg_employee e on e.id = r.employee_id
       where e.code = $1
     )
     delete from lg_audit
     where entity = 'lg_request' and entity_id in (select id::text from seeded)`,
    [EMPLOYEE_CODE],
  );
  for (const table of ["lg_hours_adjustment", "lg_timesheet", "lg_leave_detail", "lg_gate_detail"]) {
    await client.query(
      `delete from ${table}
       where request_id in (
         select r.id from lg_request r
         join lg_employee e on e.id = r.employee_id
         where e.code = $1
       )`,
      [EMPLOYEE_CODE],
    );
  }
  await client.query(
    `delete from lg_request
     where employee_id in (select id from lg_employee where code = $1)`,
    [EMPLOYEE_CODE],
  );
  // The throttle log also points at the employee row, so it has to go first.
  await client.query(
    `delete from lg_submit_attempt
     where employee_id in (select id from lg_employee where code = $1)`,
    [EMPLOYEE_CODE],
  );
  await client.query("delete from lg_employee where code = $1", [EMPLOYEE_CODE]);
}

async function main() {
  await client.connect();
  // A previous run that died before its finally block would block the insert.
  await cleanUp();

  const employee = await client.query(
    `insert into lg_employee (code, full_name, title, department, active)
     values ($1, $2, 'Công nhân', 'Sản xuất', true)
     returning id`,
    [EMPLOYEE_CODE, EMPLOYEE_NAME],
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
      note: "Về quê giỗ ông",
      handoverEmployeeId: employeeId,
      makeupDate: null,
    },
    480,
    "smoke-leave",
  );

  // The gate pass is approved and left without a real return time, so the
  // private page renders the actual-return form rather than skipping past it.
  const gate = await file(
    employeeId,
    "gate",
    {
      reason: "business_trip",
      reasonText: "",
      note: "Giao hàng cho khách",
      outAt: "2026-07-30T09:00:00+07:00",
      expectedInAt: "2026-07-30T12:00:00+07:00",
    },
    180,
    "smoke-gate",
  );
  await client.query(
    `update lg_request
     set status = 'approved',
         decided_by_email = 'smoke@ctyhp.vn',
         decided_at = now()
     where code = $1`,
    [gate.code],
  );

  const leavePage = await get(`/tra-cuu/${leave.token}`);
  check("private leave lookup renders", leavePage.status === 200, String(leavePage.status));
  check("private leave lookup has no render boundary error", noRenderError(leavePage.html));
  check("private leave lookup shows its request code", leavePage.html.includes(leave.code));
  check("private leave lookup shows the employee name", leavePage.html.includes(EMPLOYEE_NAME));
  check("private leave lookup offers withdrawal", leavePage.html.includes("Rút đơn"));
  check(
    "private leave lookup never leaks the employee number",
    !leavePage.html.includes(EMPLOYEE_CODE),
  );

  // A second gate pass still inside its window, so the actual-return form is
  // rendered rather than skipped. Both branches carry a client component, and a
  // branch that never renders is a branch that was never checked.
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const openGate = await file(
    employeeId,
    "gate",
    {
      reason: "other",
      reasonText: "Khám bệnh",
      note: "Khám định kỳ",
      outAt: twoHoursAgo,
      expectedInAt: oneHourAgo,
    },
    60,
    "smoke-gate-open",
  );
  await client.query(
    `update lg_request
     set status = 'approved',
         decided_by_email = 'smoke@ctyhp.vn',
         decided_at = now()
     where code = $1`,
    [openGate.code],
  );

  const openGatePage = await get(`/tra-cuu/${openGate.token}`);
  check("open gate lookup renders", openGatePage.status === 200, String(openGatePage.status));
  check("open gate lookup has no render boundary error", noRenderError(openGatePage.html));
  check(
    "an approved gate pass inside its window offers the actual-return form",
    openGatePage.html.includes("Giờ vào lại thực tế") &&
      openGatePage.html.includes("Lưu giờ vào lại"),
  );

  const gatePage = await get(`/tra-cuu/${gate.token}`);
  check("private gate lookup renders", gatePage.status === 200, String(gatePage.status));
  check("private gate lookup has no render boundary error", noRenderError(gatePage.html));
  check("private gate lookup shows its request code", gatePage.html.includes(gate.code));
  check(
    "an approved gate pass past its deadline locks the actual-return field",
    gatePage.html.includes("Đã hết hạn nhập giờ vào lại"),
    "kiểm tra này giả định giờ dự kiến vào lại đã quá hạn",
  );

  // The printable sheet — PRD section IX. Only an approved request prints: a
  // sheet with an empty approval box is what the app exists to stop.
  const printPending = await get(`/tra-cuu/${leave.token}/in`);
  check("a pending request refuses to print", printPending.html.includes("Chưa in được"));
  check("and the refusal renders cleanly", noRenderError(printPending.html));

  const printApproved = await get(`/tra-cuu/${gate.token}/in`);
  check("an approved gate pass prints", printApproved.status === 200, String(printApproved.status));
  check("with the paper form's own heading", printApproved.html.includes("GIẤY XIN PHÉP RA VÀO CỔNG"));
  check(
    "and the four signature boxes",
    printApproved.html.includes("Bảo vệ tiếp nhận") && printApproved.html.includes("CBNV đăng ký"),
  );
  check("and no render boundary error", noRenderError(printApproved.html));

  const printUnknown = await get(`/tra-cuu/${"b".repeat(32)}/in`);
  check("an unknown token prints nothing", printUnknown.html.includes("Không tìm thấy đơn"));

  const unknown = await get(`/tra-cuu/${"a".repeat(32)}`);
  check("an unknown token shows the not-found state", unknown.html.includes("Không tìm thấy đơn"));
  check("an unknown token has no render boundary error", noRenderError(unknown.html));

  const status = await get(`/tra-cuu?ma=${encodeURIComponent(leave.code)}`);
  check("status-only route renders", status.status === 200, String(status.status));
  check("status-only route has no render boundary error", noRenderError(status.html));
  check("status-only route shows the status", status.html.includes("Chờ duyệt"));
  check("status-only route never shows the employee name", !status.html.includes(EMPLOYEE_NAME));
  check("status-only route never shows the leave reason", !status.html.includes("Về quê giỗ ông"));
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
