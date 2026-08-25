// Creates or updates the admin-zone accounts, and makes lg_app_user agree with
// them. Deliberately a script rather than a migration: a migration is committed
// to a public repository and must never carry a password.
//
// Run:  node --env-file=.env.local scripts/create-admin-accounts.mjs <duyet-pw> <nhansu-pw>
//
// Safe to re-run. An account that already exists has its password reset to the
// one given, so this doubles as the "forgot the password" tool.
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

const [duyetPassword, nhansuPassword] = process.argv.slice(2);

if (!duyetPassword || !nhansuPassword) {
  console.error("Cần hai mật khẩu: node ... scripts/create-admin-accounts.mjs <duyet> <nhansu>");
  process.exit(1);
}
if (duyetPassword.length < 8 || nhansuPassword.length < 8) {
  console.error("Mật khẩu phải từ 8 ký tự.");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dbUrl = process.env.SUPABASE_DB_URL;
if (!url || !serviceKey || !dbUrl) {
  console.error("Thiếu NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY hoặc SUPABASE_DB_URL.");
  process.exit(1);
}

const ACCOUNTS = [
  { email: "duyet@ctyhp.vn", password: duyetPassword, role: "approver", fullName: "Người duyệt" },
  { email: "nhansu@ctyhp.vn", password: nhansuPassword, role: "cnb", fullName: "C&B Nhân sự" },
];

const auth = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** The id of an existing account with this address, or null. */
async function findUser(email) {
  // listUsers is paginated; two accounts fit on the first page many times over,
  // but paging anyway costs nothing and does not lie when the project grows.
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await auth.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (hit) return hit.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

const db = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

async function main() {
  await db.connect();

  for (const account of ACCOUNTS) {
    const existing = await findUser(account.email);

    if (existing) {
      const { error } = await auth.auth.admin.updateUserById(existing, {
        password: account.password,
        email_confirm: true,
      });
      if (error) throw new Error(`${account.email}: ${error.message}`);
      console.log(`đặt lại mật khẩu  ${account.email}`);
    } else {
      const { error } = await auth.auth.admin.createUser({
        email: account.email,
        password: account.password,
        email_confirm: true,
      });
      if (error) throw new Error(`${account.email}: ${error.message}`);
      console.log(`tạo tài khoản     ${account.email}`);
    }

    await db.query(
      `insert into lg_app_user (email, role, full_name, active)
       values ($1, $2::lg_app_role, $3, true)
       on conflict (email) do update
         set role = excluded.role, full_name = excluded.full_name, active = true`,
      [account.email, account.role, account.fullName],
    );
    console.log(`  vai trò ${account.role} trong lg_app_user`);
  }

  // Anyone left over is from the four-approver era and can no longer sign in —
  // there is no Supabase account behind those addresses. Leaving them would be
  // a role granted to nobody, which reads as a role granted to someone.
  const keep = ACCOUNTS.map((a) => a.email);
  const stale = await db.query(
    `delete from lg_app_user where email <> all($1::text[]) returning email, role`,
    [keep],
  );
  for (const row of stale.rows) {
    console.log(`gỡ dòng cũ        ${row.email} (${row.role})`);
  }

  const final = await db.query(`select email, role, full_name from lg_app_user order by role`);
  console.log("\nlg_app_user giờ có:");
  for (const row of final.rows) {
    console.log(`  ${row.role.padEnd(9)} ${row.email.padEnd(20)} ${row.full_name}`);
  }

  await db.end();
}

main().catch(async (err) => {
  console.error("\nLỗi:", err.message);
  await db.end().catch(() => {});
  process.exitCode = 1;
});
