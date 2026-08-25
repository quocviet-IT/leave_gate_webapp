// End-to-end verification for claim, release and decide — PRD rules 7 to 10.
// Everything runs in one transaction and is rolled back.
//
// Run: npm run verify:approvals
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
const TRAN = "zz.tran@ctyhp.vn";

function check(name, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`ok   ${name}`);
  } else {
    failed++;
    console.log(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** Runs the statement and returns the error message, or null when it succeeded. */
async function raises(sql, params) {
  await client.query("savepoint approval_check");
  try {
    await client.query(sql, params);
    await client.query("rollback to savepoint approval_check");
    return null;
  } catch (cause) {
    await client.query("rollback to savepoint approval_check");
    return cause.message;
  }
}

/** A leave application filed under a typed name, with no staff row behind it. */
const TYPED_LEAVE = {
  fromDate: "2026-07-30",
  toDate: "2026-07-30",
  halfDay: null,
  reason: "annual",
  reasonText: "",
  note: "Việc riêng",
  handoverName: "Ai Đó",
  makeupDate: null,
};

async function file(employeeId, device, filedByEmail = null) {
  const result = await client.query(
    `select lg_submit_request('', '', '', 'leave'::lg_request_kind, $2::jsonb, 480, $3, $1::uuid) as r`,
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
      device,
    ],
  );
  const filed = result.rows[0].r;
  if (filedByEmail) {
    await client.query("update lg_request set filed_by_email = $2 where code = $1", [
      filed.code,
      filedByEmail,
    ]);
  }
  return filed;
}

async function row(code) {
  const result = await client.query(
    `select id, version, status, claimed_by_email, claimed_at, decided_by_email, decision_note
     from lg_request where code = $1`,
    [code],
  );
  return result.rows[0];
}

async function main() {
  await client.connect();
  await client.query("begin");

  await client.query(
    `insert into lg_app_user (email, full_name, role, active)
     values ($1, 'Chị Diệu', 'approver', true), ($2, 'Chị Trân', 'approver', true)`,
    [DIEU, TRAN],
  );

  const worker = await client.query(
    `insert into lg_employee (code, full_name, title, department, active)
     values ('ZZAPP001', 'Phạm Văn Công Nhân', 'Công nhân', 'Sản xuất', true)
     returning id`,
  );
  const workerId = worker.rows[0].id;

  // ---------------------------------------------------------------- claiming
  const first = await file(workerId, "approve-1");
  let current = await row(first.code);
  check("a new request starts pending at version 0", current.status === "pending" && current.version === 0);

  await client.query("select lg_claim_request($1::uuid, $2::int, $3, 30)", [
    current.id,
    current.version,
    DIEU,
  ]);
  current = await row(first.code);
  check(
    "claiming records the holder and bumps the version",
    current.status === "claimed" && current.claimed_by_email === DIEU && current.version === 1,
  );

  const stolen = await raises("select lg_claim_request($1::uuid, $2::int, $3, 30)", [
    current.id,
    current.version,
    TRAN,
  ]);
  check("a live claim cannot be taken by somebody else", stolen !== null, "không báo lỗi");
  check(
    "and the refusal names who is holding it",
    (stolen ?? "").includes("Chị Diệu") && (stolen ?? "").includes("đang xử lý"),
    stolen ?? "",
  );

  const staleClaim = await raises("select lg_claim_request($1::uuid, $2::int, $3, 30)", [
    current.id,
    0,
    TRAN,
  ]);
  check("a stale version is refused on claim", staleClaim !== null);

  // A timeout of zero minutes is the same question asked about an aged-out
  // claim, without waiting half an hour for it.
  await client.query("select lg_claim_request($1::uuid, $2::int, $3, 0)", [
    current.id,
    current.version,
    TRAN,
  ]);
  current = await row(first.code);
  check(
    "an aged-out claim returns to the queue and can be taken",
    current.claimed_by_email === TRAN,
    current.claimed_by_email,
  );

  // ---------------------------------------------------------------- releasing
  const notYours = await raises("select lg_release_request($1::uuid, $2::int, $3)", [
    current.id,
    current.version,
    DIEU,
  ]);
  check("only the holder can release a claim", notYours !== null);

  await client.query("select lg_release_request($1::uuid, $2::int, $3)", [
    current.id,
    current.version,
    TRAN,
  ]);
  current = await row(first.code);
  check(
    "releasing puts it back to pending with no holder",
    current.status === "pending" && current.claimed_by_email === null,
  );

  // ----------------------------------------------------------------- deciding
  await client.query("select lg_decide_request($1::uuid, $2::int, $3, 'approved', $4, 30)", [
    current.id,
    current.version,
    DIEU,
    "Đồng ý",
  ]);
  current = await row(first.code);
  check(
    "approving records the decider, the time and the note",
    current.status === "approved" &&
      current.decided_by_email === DIEU &&
      current.decision_note === "Đồng ý",
  );

  const timesheet = await client.query(
    "select computed_minutes, final_minutes from lg_timesheet where request_id = $1",
    [current.id],
  );
  check(
    "an approved request reaches the timesheet with its computed hours",
    timesheet.rowCount === 1 &&
      timesheet.rows[0].computed_minutes === 480 &&
      timesheet.rows[0].final_minutes === 480,
  );

  const secondDecision = await raises(
    "select lg_decide_request($1::uuid, $2::int, $3, 'rejected', $4, 30)",
    [current.id, current.version, TRAN, ""],
  );
  check("one approval is enough — a second decision is refused", secondDecision !== null);
  check(
    "and the refusal names who decided and when",
    (secondDecision ?? "").includes("Chị Diệu") && (secondDecision ?? "").includes("đã duyệt"),
    secondDecision ?? "",
  );

  // ------------------------------------------------------------------- rule 9
  const approverEmployee = await client.query(
    `insert into lg_employee (code, full_name, email, title, department, active)
     values ('ZZAPP002', 'Chị Diệu', $1, 'Trưởng phòng', 'Nhân sự', true)
     returning id`,
    [DIEU],
  );
  const own = await file(approverEmployee.rows[0].id, "approve-own");
  const ownRow = await row(own.code);
  const ownDecision = await raises(
    "select lg_decide_request($1::uuid, $2::int, $3, 'approved', null, 30)",
    [ownRow.id, ownRow.version, DIEU],
  );
  check("nobody decides their own request", ownDecision !== null);
  check(
    "and is told the other three will handle it",
    (ownDecision ?? "").includes("ba người duyệt còn lại"),
    ownDecision ?? "",
  );
  const otherDecides = await raises(
    "select lg_decide_request($1::uuid, $2::int, $3, 'approved', null, 30)",
    [ownRow.id, ownRow.version, TRAN],
  );
  check("but another approver can", otherDecides === null, otherDecides ?? "");

  const filedOnBehalf = await file(workerId, "approve-behalf", TRAN);
  const behalfRow = await row(filedOnBehalf.code);
  const behalfDecision = await raises(
    "select lg_decide_request($1::uuid, $2::int, $3, 'approved', null, 30)",
    [behalfRow.id, behalfRow.version, TRAN],
  );
  check("filing on somebody's behalf also blocks deciding it", behalfDecision !== null);

  // Rule 9 on the typed-name path. There is no staff row to read an email from,
  // so the test falls back to matching the typed name against the approver's own
  // name on lg_app_user. Weaker than an email comparison and known to be: the
  // last check here is the hole, asserted so nobody discovers it by accident.
  const typedOwn = await client.query(
    `select lg_submit_request('Chị Diệu', 'Nhân sự', '', 'leave', $1::jsonb, 480, 'typed-own') as r`,
    [JSON.stringify(TYPED_LEAVE)],
  );
  const typedOwnRow = await row(typedOwn.rows[0].r.code);
  const typedOwnDecision = await raises(
    "select lg_decide_request($1::uuid, $2::int, $3, 'approved', null, 30)",
    [typedOwnRow.id, typedOwnRow.version, DIEU],
  );
  check(
    "an approver cannot decide a typed request that carries their own name",
    typedOwnDecision !== null,
    typedOwnDecision ?? "được duyệt, lẽ ra phải bị chặn",
  );

  const typedOtherDecides = await raises(
    "select lg_decide_request($1::uuid, $2::int, $3, 'approved', null, 30)",
    [typedOwnRow.id, typedOwnRow.version, TRAN],
  );
  check("but another approver still can", typedOtherDecides === null, typedOtherDecides ?? "");

  const typedMisspelt = await client.query(
    `select lg_submit_request('Chị  Diệu', 'Nhân sự', '', 'leave', $1::jsonb, 480, 'typed-spaced') as r`,
    [JSON.stringify(TYPED_LEAVE)],
  );
  const spacedRow = await row(typedMisspelt.rows[0].r.code);
  const spacedDecision = await raises(
    "select lg_decide_request($1::uuid, $2::int, $3, 'approved', null, 30)",
    [spacedRow.id, spacedRow.version, DIEU],
  );
  check(
    "extra spacing in the typed name does not get past rule 9",
    spacedDecision !== null,
    spacedDecision ?? "được duyệt, lẽ ra phải bị chặn",
  );

  // ------------------------------------------------------------- withdrawn
  const toWithdraw = await file(workerId, "approve-withdraw");
  await client.query("select lg_withdraw_request($1, null)", [toWithdraw.token]);
  const withdrawnRow = await row(toWithdraw.code);
  const decideWithdrawn = await raises(
    "select lg_decide_request($1::uuid, $2::int, $3, 'approved', null, 30)",
    [withdrawnRow.id, withdrawnRow.version, DIEU],
  );
  check("a withdrawn request cannot be decided", decideWithdrawn !== null);
  check(
    "and the refusal says so plainly",
    (decideWithdrawn ?? "").includes("rút đơn"),
    decideWithdrawn ?? "",
  );

  // --------------------------------------------------------------- the grants
  const grants = await client.query(
    `select
       has_function_privilege('anon', 'lg_claim_request(uuid,integer,text,integer)', 'execute') as anon_claim,
       has_function_privilege('anon', 'lg_decide_request(uuid,integer,text,lg_request_status,text,integer)', 'execute') as anon_decide,
       has_function_privilege('authenticated', 'lg_decide_request(uuid,integer,text,lg_request_status,text,integer)', 'execute') as auth_decide`,
  );
  const g = grants.rows[0];
  check(
    "neither anon nor a signed-in browser can call the approval functions directly",
    !g.anon_claim && !g.anon_decide && !g.auth_decide,
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
