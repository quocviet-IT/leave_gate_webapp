// Request every static route against a running server and fail on any that does
// not answer the way its zone should.
//
// This catches what build, typecheck, lint and unit tests cannot: a page that
// throws only when it actually renders. The accounting app lost a day to exactly
// that — a Server Component reading an Ant Design sub-component — so this net
// exists from the first commit here.
//
// Expectations per zone (PRD section III):
//   public zone  /, /don, /tra-cuu   → 200, nobody signs in
//   guard booth  /bao-ve             → 200, the PIN gate lives inside the page
//   admin zone   /admin/*            → a redirect to /admin/dang-nhap when not
//                                      signed in; 200 is also fine if it is
//                                      /admin/dang-nhap itself
//
// Run (dev or preview server must already be up):
//   node scripts/smoke-pages.mjs [baseUrl]
import { readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, "..", "app");

const base = process.argv.slice(2).find((a) => a.startsWith("http")) ?? "http://localhost:3000";

/**
 * Every static route under app/. Route groups in brackets do not appear in the
 * URL; dynamic segments are skipped because they need a real record.
 */
function discoverRoutes(dir = appDir, prefix = "") {
  const routes = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry.startsWith("[")) continue; // needs a real token or id
      const next = entry.startsWith("(") && entry.endsWith(")") ? prefix : `${prefix}/${entry}`;
      routes.push(...discoverRoutes(full, next));
    } else if (entry === "page.tsx") {
      routes.push(prefix === "" ? "/" : prefix);
    }
  }
  return routes;
}

function expectationFor(route) {
  if (route.startsWith("/admin") && route !== "/admin/dang-nhap" && route !== "/admin/khong-du-quyen") {
    return "redirect-to-sign-in";
  }
  return "ok";
}

const routes = discoverRoutes().sort();
console.log(`Kiểm ${routes.length} đường dẫn trên ${base}\n`);

let failed = 0;

for (const route of routes) {
  const expectation = expectationFor(route);
  let outcome;
  try {
    const res = await fetch(`${base}${route}`, { redirect: "manual" });
    const location = res.headers.get("location") ?? "";
    if (expectation === "redirect-to-sign-in") {
      const redirected = res.status >= 300 && res.status < 400 && location.includes("/admin/dang-nhap");
      outcome = redirected
        ? { ok: true, note: `${res.status} → ${location}` }
        : {
            ok: false,
            note:
              res.status === 500
                ? "500 — thường là chưa cấu hình .env.local cho Supabase"
                : `${res.status} ${location}`,
          };
    } else {
      const body = res.ok ? await res.text() : "";
      const boundary = /Application error|Unhandled Runtime Error|__next_error__/.test(body);
      outcome = res.ok && !boundary
        ? { ok: true, note: String(res.status) }
        : { ok: false, note: boundary ? "200 nhưng render lỗi" : String(res.status) };
    }
  } catch (err) {
    outcome = { ok: false, note: err.message };
  }

  if (!outcome.ok) failed++;
  console.log(`${outcome.ok ? "ok  " : "FAIL"} ${route.padEnd(26)} ${outcome.note}`);
}

console.log(
  failed === 0
    ? `\nTất cả ${routes.length} đường dẫn đạt.`
    : `\n${failed}/${routes.length} đường dẫn KHÔNG đạt.`,
);
process.exitCode = failed === 0 ? 0 : 1;
