import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Ant Design ships "use client", so a Server Component that imports it receives
 * client-reference proxies. Reading a static sub-component off one of those
 * proxies — `Typography.Title`, `Form.Item`, `Input.TextArea` — throws at render
 * time, and passes build, typecheck and lint on the way there. It cost a day on
 * the accounting app; this test carries the rule over so it cannot happen here.
 */
const COMPOUND_OWNERS = [
  "Typography",
  "Form",
  "Input",
  "Select",
  "Card",
  "Table",
  "Space",
  "Menu",
  "Dropdown",
  "Badge",
  "Descriptions",
  "Tabs",
  "Layout",
  "Modal",
  "Collapse",
  "Radio",
  "Checkbox",
  "Steps",
  "Avatar",
  "Statistic",
  "Breadcrumb",
  "Timeline",
  "List",
  "Upload",
  "Tree",
  "Segmented",
  "DatePicker",
  "TimePicker",
  "Empty",
  "Anchor",
  "Flex",
];

const COMPOUND_ACCESS = new RegExp(`\\b(${COMPOUND_OWNERS.join("|")})\\.[A-Z]\\w*`, "g");

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...tsxFiles(full));
    else if (entry.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const ROOT = process.cwd();
const files = [...tsxFiles(join(ROOT, "app")), ...tsxFiles(join(ROOT, "components"))];

function isClientComponent(source: string): boolean {
  return /^\s*["']use client["']/.test(source);
}

describe("Server Components and Ant Design", () => {
  it("finds files to check", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it("never reads an Ant Design sub-component from a Server Component", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      if (isClientComponent(source)) continue;
      if (!/from ["']antd["']/.test(source)) continue;
      const hits = source.match(COMPOUND_ACCESS);
      if (hits) {
        offenders.push(`${relative(ROOT, file)} → ${[...new Set(hits)].join(", ")}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
