// Measure first-load JavaScript per route against the zone budgets in
// docs/superpowers/plans/2026-07-30-roadmap.md.
//
// Why this exists: the Turbopack build prints no per-route JS sizes, so the
// budget in the roadmap was unverifiable — and the first time it was measured,
// the public zone turned out to be shipping Ant Design from the root layout.
// Anything that cannot be measured drifts.
//
// What is counted: every <script src> the server-rendered HTML executes, gzipped
// from the file on disk. `noModule` polyfills are reported separately because a
// current browser never downloads them.
//
// Routes needing a session (everything under /admin except the sign-in and
// no-access pages) answer with a redirect and are reported as skipped.
//
// Run against a *production* server — `npm run build && npx next start -p 3100`:
//   node scripts/measure-js.mjs http://localhost:3100
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const nextDir = join(here, "..", ".next");

const base = process.argv.slice(2).find((a) => a.startsWith("http")) ?? "http://localhost:3000";

/** Budgets in KB of gzipped first-load JS, by zone (roadmap, "Performance"). */
const BUDGETS = [
  { match: (r) => r.startsWith("/admin"), zone: "admin", kb: 420 },
  { match: (r) => r.startsWith("/bao-ve"), zone: "booth", kb: 330 },
  { match: () => true, zone: "public", kb: 160 },
];

const ROUTES = [
  "/",
  "/don",
  `/don/xong?code=NP-2607-0148&token=${"a".repeat(32)}`,
  "/tra-cuu",
  `/tra-cuu/${"a".repeat(32)}`,
  `/tra-cuu/${"a".repeat(32)}/in`,
  "/bao-ve",
  "/admin/dang-nhap",
  "/admin/khong-du-quyen",
  "/admin",
  "/admin/nhan-su",
  "/admin/duyet-don",
  "/admin/cham-cong",
];

function budgetFor(route) {
  return BUDGETS.find((b) => b.match(route));
}

function gzipKb(url) {
  try {
    const bytes = gzipSync(readFileSync(join(nextDir, url.replace(/^\/_next\//, ""))));
    return bytes.length / 1024;
  } catch {
    return 0;
  }
}

/** Every distinct <script src> in the HTML, split by whether it is noModule. */
function scriptsIn(html) {
  const modern = new Set();
  const legacy = new Set();
  for (const match of html.matchAll(/<script\b([^>]*?)\/?>/g)) {
    const attrs = match[1];
    const src = /src="(\/_next\/static\/[^"]+\.js)"/.exec(attrs)?.[1];
    if (!src) continue;
    (/\bnomodule\b/i.test(attrs) ? legacy : modern).add(src);
  }
  return { modern: [...modern], legacy: [...legacy] };
}

let failed = 0;
let skipped = 0;

console.log(`First-load JS on ${base}\n`);

for (const route of ROUTES) {
  const routePath = route.split("?")[0];
  const budget = budgetFor(routePath);
  let res;
  try {
    res = await fetch(base + route, { redirect: "manual" });
  } catch (err) {
      console.log(`FAIL ${routePath.padEnd(24)} ${err.message}`);
    failed++;
    continue;
  }

  if (res.status >= 300 && res.status < 400) {
    skipped++;
    console.log(`skip ${routePath.padEnd(24)} cần đăng nhập (${res.status})`);
    continue;
  }

  const html = await res.text();
  const { modern, legacy } = scriptsIn(html);
  const modernKb = modern.reduce((sum, url) => sum + gzipKb(url), 0);
  const legacyKb = legacy.reduce((sum, url) => sum + gzipKb(url), 0);

  const over = modernKb > budget.kb;
  if (over) failed++;
  const round = (n) => Math.round(n * 10) / 10;
  console.log(
    `${over ? "OVER" : "ok  "} ${routePath.padEnd(24)} ${String(round(modernKb)).padStart(6)} KB / ` +
      `${budget.kb} KB ${budget.zone}` +
      (legacyKb > 0 ? `  (+${round(legacyKb)} KB noModule, not sent to current browsers)` : ""),
  );
}

console.log(
  failed === 0
    ? `\nTất cả trong ngân sách.${skipped > 0 ? ` ${skipped} route cần đăng nhập, chưa đo.` : ""}`
    : `\n${failed} route vượt ngân sách.`,
);
process.exitCode = failed === 0 ? 0 : 1;
