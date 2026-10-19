// Signs in to the guard booth with its real PIN and opens the board over HTTP.
//
// `smoke-pages.mjs` only ever sees the PIN prompt, so it proves the route
// answers and nothing about what is behind it. This is the booth's counterpart
// to verify:admin: a real PIN, a real session, and the board rendered.
//
// It exchanges the PIN through `lg_booth_sign_in` — the same call the sign-in
// Server Action makes — rather than driving the form, because Next 16 keeps the
// action id in the client bundle where a script cannot read it. The form itself
// is covered by `tests/unit/booth-render.test.tsx`.
//
// It also asserts what the booth must never show. PRD rules 14 and 19: a guard
// sees a name, a time and a code, and never why somebody is leaving.
//
// Run: node --env-file=.env.local scripts/verify-booth-signin.mjs <base-url> <PIN>
import { randomBytes } from "node:crypto";
import pg from "pg";

const [baseArg, pin] = process.argv.slice(2);
const base = (baseArg ?? "http://localhost:3100").replace(/\/$/, "");

if (!pin) {
  console.error("Cần: node ... verify-booth-signin.mjs <base-url> <PIN>");
  process.exit(1);
}
const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("SUPABASE_DB_URL chưa được đặt (dùng node --env-file=.env.local).");
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

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

/** What the Server Action does: a random token, exchanged for a session. */
async function exchange(candidate) {
  const token = randomBytes(32).toString("hex");
  const result = await client.query("select lg_booth_sign_in($1, $2, 30) as booth", [
    candidate,
    token,
  ]);
  return { booth: result.rows[0].booth, token };
}

async function open(path, token) {
  const response = await fetch(`${base}${path}`, {
    headers: token ? { cookie: `lg_booth=${token}` } : {},
    redirect: "manual",
  });
  return { status: response.status, body: await response.text() };
}

async function main() {
  console.log(`Kiểm chốt bảo vệ trên ${base}\n`);
  await client.connect();

  const locked = await open("/bao-ve", null);
  check("chưa nhập PIN thì chỉ thấy ô nhập PIN", locked.body.includes("PIN"), String(locked.status));
  check(
    "và chưa thấy bảng hôm nay",
    !locked.body.includes("Cho ra") && !locked.body.includes("Cho vào"),
  );

  const wrong = await exchange("000000");
  check("PIN sai không mở được phiên", wrong.booth === null, JSON.stringify(wrong.booth));

  const right = await exchange(pin);
  check("PIN đúng mở được phiên", right.booth !== null, "PIN bị từ chối");
  if (!right.booth) {
    await client.end();
    console.log(`\n${passed} đạt, ${failed} không đạt.`);
    process.exitCode = 1;
    return;
  }
  check("và phiên biết mình thuộc chốt nào", Boolean(right.booth.name), JSON.stringify(right.booth));

  const board = await open("/bao-ve", right.token);
  check("bảng hôm nay dựng được", board.status === 200, String(board.status));
  check("bảng xưng tên chốt", board.body.includes(right.booth.name), "không thấy tên chốt");
  check("không lỗi khi render", !board.body.includes("Application error"));

  // Rules 14 and 19. The board function selects its columns by name, so a
  // reason can only appear here if somebody widened it on purpose.
  const forbidden = ["Phép năm", "Ốm đau", "Tang chế", "Thai sản", "Không lương", "Diễn giải"];
  const leaked = forbidden.filter((word) => board.body.includes(word));
  check("không để lộ lý do nghỉ — quy tắc 14 và 19", leaked.length === 0, `thấy: ${leaked.join(", ")}`);

  // A cookie somebody made up matches no row, so it is the same as no cookie.
  const forged = await open("/bao-ve", randomBytes(32).toString("hex"));
  check(
    "cookie tự chế thì coi như chưa đăng nhập",
    forged.body.includes("PIN") && !forged.body.includes("Cho ra"),
    String(forged.status),
  );

  // Signing out must end it, or a lost machine stays signed in.
  await client.query("select lg_booth_sign_out($1)", [right.token]);
  const afterOut = await open("/bao-ve", right.token);
  check(
    "đăng xuất thì phiên hết hiệu lực ngay",
    afterOut.body.includes("PIN") && !afterOut.body.includes("Cho ra"),
    String(afterOut.status),
  );

  await client.end();
  console.log(`\n${passed} đạt, ${failed} không đạt.`);
  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch(async (err) => {
  console.error("\nLỗi:", err.message);
  await client.end().catch(() => {});
  process.exitCode = 1;
});
