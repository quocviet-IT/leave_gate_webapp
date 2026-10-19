// End-to-end check of the employee import and the public name search, against
// the real database. Everything runs inside one transaction that is rolled back,
// so the run leaves no residue and can be repeated.
//
// Run: npm run verify:employees
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

/** Act as a signed-in person: Supabase reads auth.jwt() from this setting. */
async function actAs(email) {
  await client.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ email }),
  ]);
}

const ROWS = [
  { code: "ZZTEST01", fullName: "Nguyễn Văn Bình", title: "Công nhân", department: "Sản xuất", email: null },
  { code: "ZZTEST02", fullName: "Trần Thị Lan", title: "Công nhân", department: "Sản xuất", email: null },
];

async function main() {
  await client.connect();
  await client.query("begin");

  // C&B may import.
  await actAs("nhansu@ctyhp.vn");
  const first = await client.query("select lg_import_employees($1::jsonb) as r", [JSON.stringify(ROWS)]);
  check("import inserts new rows", first.rows[0].r.inserted === 2, JSON.stringify(first.rows[0].r));

  // Re-importing the same codes updates instead of duplicating.
  const again = await client.query("select lg_import_employees($1::jsonb) as r", [
    JSON.stringify([{ ...ROWS[0], title: "Tổ trưởng" }]),
  ]);
  check("re-import updates in place", again.rows[0].r.updated === 1, JSON.stringify(again.rows[0].r));

  const title = await client.query("select title from lg_employee where code = 'ZZTEST01'");
  check("the update took effect", title.rows[0].title === "Tổ trưởng", title.rows[0].title);

  const audited = await client.query(
    "select count(*)::int as n from lg_audit where entity = 'lg_employee' and action = 'import'",
  );
  check("the import is audited", audited.rows[0].n >= 2, `n=${audited.rows[0].n}`);

  // An approver is not C&B and must be refused.
  await actAs("duyet@ctyhp.vn");
  let refused = false;
  try {
    await client.query("savepoint s1");
    await client.query("select lg_import_employees($1::jsonb)", [JSON.stringify(ROWS)]);
  } catch {
    refused = true;
  } finally {
    await client.query("rollback to savepoint s1");
  }
  check("an approver cannot import", refused);

  // The public search: accent-insensitive, bounded, and no employee number.
  const search = await client.query("select * from lg_search_employees('binh')");
  check("search finds a name typed without diacritics", search.rows.length === 1, JSON.stringify(search.rows));
  check(
    "search never returns the employee number",
    search.rows.length > 0 && !Object.keys(search.rows[0]).includes("code"),
    Object.keys(search.rows[0] ?? {}).join(","),
  );

  const tooShort = await client.query("select * from lg_search_employees('n')");
  check("search needs at least two characters", tooShort.rows.length === 0);

  // "th" matches Trần Thị Lan, so this asserts the cap on a query that really
  // returns rows — a one-character query would pass the check by returning none.
  const capped = await client.query("select count(*)::int as n from lg_search_employees('th')");
  check("search is bounded to 8 rows", capped.rows[0].n > 0 && capped.rows[0].n <= 8, `n=${capped.rows[0].n}`);

  // A leaver must not be filed for, so they drop out of the picker.
  await actAs("nhansu@ctyhp.vn");
  await client.query("update lg_employee set active = false where code = 'ZZTEST02'");
  const leaver = await client.query("select * from lg_search_employees('lan')");
  check("an inactive employee is not searchable", leaver.rows.length === 0, JSON.stringify(leaver.rows));

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
