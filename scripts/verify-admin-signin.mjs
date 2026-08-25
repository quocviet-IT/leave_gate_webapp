// Signs in with each issued account and opens the admin screens over HTTP.
//
// This is the check nobody could run before 2026-08-25: the zone was behind a
// Google provider that was never enabled, so `smoke-pages.mjs` only ever saw
// the redirect and no screen inside `/admin` had been rendered by a real
// session. It asserts both halves of the guard — that each role reaches its own
// screens, and that it is turned away from the other role's.
//
// Run: node --env-file=.env.local scripts/verify-admin-signin.mjs <base-url> <duyet-pw> <nhansu-pw>
import { createClient } from "@supabase/supabase-js";

const [baseArg, duyetPassword, nhansuPassword] = process.argv.slice(2);
const base = (baseArg ?? "http://localhost:3100").replace(/\/$/, "");

if (!duyetPassword || !nhansuPassword) {
  console.error("Cần: node ... verify-admin-signin.mjs <base-url> <duyet-pw> <nhansu-pw>");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !anon) {
  console.error("Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  process.exit(1);
}

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

/** The project ref keys the session cookie that @supabase/ssr reads. */
const projectRef = new URL(url).hostname.split(".")[0];

/**
 * The cookie a browser would be holding after signing in. @supabase/ssr stores
 * the session as base64 JSON and splits it across numbered chunks once it grows
 * past its limit, so this has to chunk it the same way or the server reads a
 * truncated token and sees no session at all.
 */
function sessionCookies(session) {
  const name = `sb-${projectRef}-auth-token`;
  const value = `base64-${Buffer.from(JSON.stringify(session)).toString("base64")}`;
  const LIMIT = 3180;
  if (value.length <= LIMIT) return [`${name}=${value}`];

  const chunks = [];
  for (let i = 0; i < value.length; i += LIMIT) {
    chunks.push(`${name}.${chunks.length}=${value.slice(i, i + LIMIT)}`);
  }
  return chunks;
}

async function signIn(email, password) {
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`${email}: ${error.message}`);
  return sessionCookies(data.session).join("; ");
}

async function open(path, cookie) {
  const response = await fetch(`${base}${path}`, {
    headers: cookie ? { cookie } : {},
    redirect: "manual",
  });
  const location = response.headers.get("location") ?? "";
  return { status: response.status, location, body: await response.text() };
}

async function main() {
  console.log(`Kiểm vùng quản trị trên ${base}\n`);

  // --- signed out --------------------------------------------------------
  const anonymous = await open("/admin/duyet-don", null);
  check(
    "chưa đăng nhập thì bị đưa về trang đăng nhập",
    anonymous.status === 307 && anonymous.location.includes("/admin/dang-nhap"),
    `${anonymous.status} → ${anonymous.location}`,
  );

  const form = await open("/admin/dang-nhap", null);
  check(
    "trang đăng nhập hỏi tên đăng nhập và mật khẩu, không phải nút Google",
    form.body.includes("Tên đăng nhập") &&
      form.body.includes("Mật khẩu") &&
      !form.body.includes("Google"),
  );

  // --- the approver ------------------------------------------------------
  const duyet = await signIn("duyet@ctyhp.vn", duyetPassword);
  check("người duyệt đăng nhập được", Boolean(duyet));

  const overview = await open("/admin", duyet);
  check("và mở được Tổng quan", overview.status === 200, String(overview.status));
  check(
    "màn hình xưng đúng vai trò",
    overview.body.includes("Người duyệt"),
    "không thấy nhãn vai trò",
  );

  const queue = await open("/admin/duyet-don", duyet);
  check("và mở được hàng chờ duyệt", queue.status === 200, String(queue.status));
  check(
    "hàng chờ dựng xong, không lỗi khi render",
    queue.body.includes("Hàng chờ duyệt") && !queue.body.includes("Application error"),
  );

  const sheetForApprover = await open("/admin/cham-cong", duyet);
  check(
    "nhưng không mở được Chấm công — đó là việc của C&B",
    sheetForApprover.status === 307 && sheetForApprover.location.includes("khong-du-quyen"),
    `${sheetForApprover.status} → ${sheetForApprover.location}`,
  );

  // --- C&B ---------------------------------------------------------------
  const nhansu = await signIn("nhansu@ctyhp.vn", nhansuPassword);
  check("C&B đăng nhập được", Boolean(nhansu));

  const sheet = await open("/admin/cham-cong", nhansu);
  check("và mở được Chấm công", sheet.status === 200, String(sheet.status));

  const staff = await open("/admin/nhan-su", nhansu);
  check("và mở được Nhân sự", staff.status === 200, String(staff.status));

  const queueForCnb = await open("/admin/duyet-don", nhansu);
  check(
    "nhưng không mở được hàng chờ duyệt — đó là việc của người duyệt",
    queueForCnb.status === 307 && queueForCnb.location.includes("khong-du-quyen"),
    `${queueForCnb.status} → ${queueForCnb.location}`,
  );

  // --- the removed screen ------------------------------------------------
  for (const [label, cookie] of [["người duyệt", duyet], ["C&B", nhansu]]) {
    const gone = await open("/admin/tao-don-ho", cookie);
    check(`màn Tạo đơn hộ đã gỡ (${label} mở ra 404)`, gone.status === 404, String(gone.status));
  }

  console.log(`\n${passed} đạt, ${failed} không đạt.`);
  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error("\nLỗi:", err.message);
  process.exitCode = 1;
});
