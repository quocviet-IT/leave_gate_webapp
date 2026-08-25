import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A `"use server"` module may only export async functions. Next.js turns every
 * other export into a server *reference*, so an importer receives a function
 * where it expected the value: `EMPTY_FILE_STATE.errors` becomes `undefined`,
 * and the first `state.errors.x` read throws at render time.
 *
 * Build, typecheck and lint all pass on the way there — the declaration is
 * perfectly valid TypeScript — so only a rendered page catches it. It shipped
 * broken once in `/don`. Form state belongs in a sibling `action-state.ts`
 * carrying no directive.
 */
const ROOTS = ["app", "lib", "components"];

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      found.push(...sourceFiles(full));
    } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      found.push(full);
    }
  }
  return found;
}

function usesServerDirective(source: string): boolean {
  return /^\s*["']use server["'];/.test(source);
}

/** Exported names that are not `export async function` and not type-only. */
function nonFunctionExports(source: string): string[] {
  const offenders: string[] = [];
  const pattern = /^export\s+(?!async\s+function\b)(?!type\b)(?!interface\b)(.+)$/gm;
  for (const match of source.matchAll(pattern)) {
    const rest = match[1].trim();
    // `export { x }` re-exports and `export default` are equally unsafe here,
    // but a plain `const`/`let`/`class` is the shape that has actually bitten.
    if (/^(const|let|var|class|function|default|\{)/.test(rest)) {
      offenders.push(rest.split(/[\s=:({]/)[0] === "const" ? rest.slice(0, 60) : rest.slice(0, 60));
    }
  }
  return offenders;
}

describe('"use server" modules', () => {
  const files = ROOTS.flatMap((root) => sourceFiles(root));

  it("finds the action files it is supposed to guard", () => {
    const serverFiles = files.filter((file) => usesServerDirective(readFileSync(file, "utf8")));
    expect(serverFiles.length).toBeGreaterThan(0);
  });

  it("export nothing but async functions", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      if (!usesServerDirective(source)) continue;
      for (const bad of nonFunctionExports(source)) {
        offenders.push(`${relative(".", file)} → ${bad}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
