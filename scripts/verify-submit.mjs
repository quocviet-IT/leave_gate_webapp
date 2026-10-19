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
    "select lg_submit_request('', '', '', 'leave', $2::jsonb, $3::int, $4, $1::uuid) as r",
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
    "select lg_submit_request('', '', '', 'leave', $2::jsonb, $3::int, $4, $1::uuid)",
    [employeeId, JSON.stringify(LEAVE), 480, "device-a"],
  );
  check("a second filing from the same device within a minute is refused", throttled);

  // Five a day per employee: four more from other devices, then the sixth fails.
  for (let i = 2; i <= 5; i++) {
    await client.query("select lg_submit_request('', '', '', 'leave', $2::jsonb, $3::int, $4, $1::uuid)", [
      employeeId,
      JSON.stringify(LEAVE),
      480,
      `device-${i}`,
    ]);
  }
  const capped = await expectRaise(
    "select lg_submit_request('', '', '', 'leave', $2::jsonb, $3::int, $4, $1::uuid)",
    [employeeId, JSON.stringify(LEAVE), 480, "device-6"],
  );
  check("a sixth filing in one day is refused", capped);

  // A leaver cannot be filed for, even with a valid id.
  await client.query("update lg_employee set active = false where id = $1", [employeeId]);
  const inactive = await expectRaise(
    "select lg_submit_request('', '', '', 'leave', $2::jsonb, $3::int, $4, $1::uuid)",
    [employeeId, JSON.stringify(LEAVE), 480, "device-7"],
  );
  check("an inactive employee cannot be filed for", inactive);

  // ---------------------------------------------------------------------
  // The typed-name path (board decision, 2026-08-25). No employee id at all:
  // the name, department and title are whatever the person wrote.
  // ---------------------------------------------------------------------
  // A name nothing real will ever be filed under. The daily limit counts rows
  // in lg_submit_attempt, and that table keeps committed rows from real
  // filings and from verify:e2e — so a realistic name here makes the run
  // depend on what happened earlier today. It did: "Tạ Quốc Việt" had already
  // been used through the live form, and the limit tripped four requests early.
  const TYPED = ["Zz Kiểm Thử Gõ Tay", "Xưởng ZZ", "Công nhân"];
  const typedLeave = { ...LEAVE, handoverName: "Nguyễn Văn Bình" };

  const typedFiled = await client.query(
    "select lg_submit_request($1, $2, $3, 'leave', $4::jsonb, 480, $5) as r",
    [...TYPED, JSON.stringify(typedLeave), "typed-1"],
  );
  check(
    "a request can be filed under a typed name, with no staff row behind it",
    /^NP-\d{4}-\d{4}$/.test(typedFiled.rows[0].r.code ?? ""),
    typedFiled.rows[0].r.code,
  );

  const typedRow = await client.query(
    "select employee_id, employee_snapshot from lg_request where code = $1",
    [typedFiled.rows[0].r.code],
  );
  check("and it points at no staff row", typedRow.rows[0].employee_id === null);
  check(
    "the typed name, department and title are what the snapshot keeps",
    typedRow.rows[0].employee_snapshot.full_name === TYPED[0] &&
      typedRow.rows[0].employee_snapshot.department === TYPED[1] &&
      typedRow.rows[0].employee_snapshot.title === TYPED[2],
    JSON.stringify(typedRow.rows[0].employee_snapshot),
  );
  check(
    "and the snapshot records that it was typed rather than chosen",
    typedRow.rows[0].employee_snapshot.typed === true,
  );

  const typedHandover = await client.query(
    `select l.handover_name from lg_leave_detail l
     join lg_request r on r.id = l.request_id where r.code = $1`,
    [typedFiled.rows[0].r.code],
  );
  check(
    "the handover is kept as typed too",
    typedHandover.rows[0].handover_name === "Nguyễn Văn Bình",
    String(typedHandover.rows[0].handover_name),
  );

  check(
    "a blank name is refused",
    await expectRaise("select lg_submit_request('', $1, $2, 'leave', $3::jsonb, 480, $4)", [
      "Xưởng A",
      "Công nhân",
      JSON.stringify(typedLeave),
      "typed-blank",
    ]),
  );
  check(
    "a one-letter name is refused",
    await expectRaise("select lg_submit_request('A', $1, $2, 'leave', $3::jsonb, 480, $4)", [
      "Xưởng A",
      "Công nhân",
      JSON.stringify(typedLeave),
      "typed-short",
    ]),
  );
  check(
    "a missing department is refused — the approver routes on it",
    await expectRaise("select lg_submit_request($1, '', $2, 'leave', $3::jsonb, 480, $4)", [
      TYPED[0],
      TYPED[2],
      JSON.stringify(typedLeave),
      "typed-nodept",
    ]),
  );
  check(
    "a missing job title is refused — it is on the paper form the approver reads",
    await expectRaise("select lg_submit_request($1, $2, '', 'leave', $3::jsonb, 480, $4)", [
      TYPED[0],
      TYPED[1],
      JSON.stringify(typedLeave),
      "typed-notitle",
    ]),
  );

  // The handover is optional now, matching the blank line for it on paper.
  const noHandover = { ...LEAVE };
  delete noHandover.handoverEmployeeId;
  const filedBlank = await client.query(
    "select lg_submit_request($1, $2, $3, 'leave', $4::jsonb, 480, $5) as r",
    ["Đỗ Thị Không Bàn Giao", "Xưởng C", "Công nhân", JSON.stringify(noHandover), "typed-nohand"],
  );
  check(
    "a leave application with no handover is accepted",
    /^NP-\d{4}-\d{4}$/.test(filedBlank.rows[0].r.code ?? ""),
    filedBlank.rows[0].r.code,
  );
  const blankHandover = await client.query(
    `select l.handover_name from lg_leave_detail l
     join lg_request r on r.id = l.request_id where r.code = $1`,
    [filedBlank.rows[0].r.code],
  );
  check(
    "and it stores no handover rather than an empty string",
    blankHandover.rows[0].handover_name === null,
    String(blankHandover.rows[0].handover_name),
  );

  // Five a day still holds, now counted per name rather than per staff row.
  // Counted from what is already there rather than from zero, so a stray
  // committed row under this name cannot make the run fail or falsely pass.
  const already = await client.query(
    `select count(*)::int as n from lg_submit_attempt
     where name_key = lg_name_key($1)
       and (at at time zone 'Asia/Ho_Chi_Minh')::date = (now() at time zone 'Asia/Ho_Chi_Minh')::date`,
    [TYPED[0]],
  );
  check(
    "the test name starts the day unused, or the limits below prove nothing",
    already.rows[0].n === 1,
    `đã có ${already.rows[0].n} lần gửi dưới tên kiểm thử`,
  );

  for (let i = 2; i <= 5; i++) {
    await client.query("select lg_submit_request($1, $2, $3, 'leave', $4::jsonb, 480, $5)", [
      ...TYPED,
      JSON.stringify(typedLeave),
      `typed-${i}`,
    ]);
  }
  check(
    "a sixth request under one typed name is refused",
    await expectRaise("select lg_submit_request($1, $2, $3, 'leave', $4::jsonb, 480, $5)", [
      ...TYPED,
      JSON.stringify(typedLeave),
      "typed-6",
    ]),
  );
  check(
    "and case and spacing do not make it a different name",
    await expectRaise("select lg_submit_request($1, $2, $3, 'leave', $4::jsonb, 480, $5)", [
      "  zz  kiểm   thử  gõ tay ",
      TYPED[1],
      TYPED[2],
      JSON.stringify(typedLeave),
      "typed-7",
    ]),
  );
  check(
    "but a genuinely different name is not caught by somebody else's limit",
    (
      await client.query("select lg_submit_request($1, $2, $3, 'leave', $4::jsonb, 480, $5) as r", [
        "Lê Thị Hoa",
        "Xưởng B",
        "Tổ trưởng",
        JSON.stringify(typedLeave),
        "typed-other",
      ])
    ).rows[0].r.code !== undefined,
  );

  // anon must not be able to reach the write path at all.
  const grants = await client.query(
    `select has_function_privilege('anon', 'lg_submit_request(text, text, text, lg_request_kind, jsonb, integer, text, uuid)', 'execute') as anon_can`,
  );
  check("anon cannot execute lg_submit_request", grants.rows[0].anon_can === false);

  // The whole privilege surface, not just the one function. Supabase's default
  // privileges grant EXECUTE straight to anon, so a new function is public unless
  // a migration says otherwise — exactly how lg_submit_request slipped through.
  // One function, since 0017. The public form types a name rather than
  // searching the staff list, so lg_search_employees lost its browser caller
  // and its anon grant with it.
  const ALLOWED_FOR_ANON = ["lg_status_by_code"];
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
    "anon reaches only the one function the public form needs",
    unexpected.length === 0,
    `còn gọi được: ${unexpected.join(", ")}`,
  );

  // And the one it does keep must still work, or /tra-cuu is broken.
  const stillWorks = await client.query(
    `select has_function_privilege('anon', 'lg_search_employees(text)', 'execute') as search,
            has_function_privilege('anon', 'lg_status_by_code(text)', 'execute') as status`,
  );
  check(
    "anon keeps the status lookup",
    stillWorks.rows[0].status === true,
    JSON.stringify(stillWorks.rows[0]),
  );
  check(
    "and has lost the name search it no longer calls",
    stillWorks.rows[0].search === false,
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
