import { describe, expect, it } from "vitest";
import {
  formatRequestCode,
  generateLookupToken,
  isLookupToken,
  isRequestCode,
  kindOfRequestCode,
  lookupPath,
  normalizeEmployeeCode,
  normalizeRequestCode,
} from "@/lib/domain/codes";

describe("request codes", () => {
  const submitted = new Date("2026-07-30T09:12:00+07:00");

  it("reads like the PRD example", () => {
    expect(formatRequestCode("leave", submitted, 148)).toBe("NP-2607-0148");
    expect(formatRequestCode("gate", submitted, 311)).toBe("RC-2607-0311");
  });

  it("uses the ICT month, not UTC", () => {
    // 23:30 on 31 July in Vietnam is still July, though it is 16:30 UTC.
    expect(formatRequestCode("leave", new Date("2026-07-31T23:30:00+07:00"), 1)).toBe(
      "NP-2607-0001",
    );
    // 00:30 on 1 August in Vietnam is August, though UTC still says 31 July.
    expect(formatRequestCode("leave", new Date("2026-08-01T00:30:00+07:00"), 1)).toBe(
      "NP-2608-0001",
    );
  });

  it("refuses a sequence it cannot format", () => {
    expect(() => formatRequestCode("leave", submitted, 0)).toThrow();
    expect(() => formatRequestCode("leave", submitted, 10_000)).toThrow();
    expect(() => formatRequestCode("leave", submitted, 1.5)).toThrow();
  });

  it("accepts what people actually type", () => {
    expect(normalizeRequestCode("np 2607 0148")).toBe("NP-2607-0148");
    expect(normalizeRequestCode("np26070148")).toBe("NP-2607-0148");
    expect(isRequestCode("  rc-2607-0311 ")).toBe(true);
    expect(isRequestCode("XX-2607-0311")).toBe(false);
    expect(isRequestCode("NP-2607-148")).toBe(false);
  });

  it("knows which form a code belongs to", () => {
    expect(kindOfRequestCode("NP-2607-0148")).toBe("leave");
    expect(kindOfRequestCode("rc 2607 0311")).toBe("gate");
    expect(kindOfRequestCode("hello")).toBe(null);
  });
});

describe("lookup tokens", () => {
  it("are 32 hex characters", () => {
    const token = generateLookupToken();
    expect(token).toHaveLength(32);
    expect(isLookupToken(token)).toBe(true);
  });

  it("differ every time", () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generateLookupToken()));
    expect(tokens.size).toBe(50);
  });

  it("reject anything that is not a token", () => {
    expect(isLookupToken("abc")).toBe(false);
    expect(isLookupToken("Z".repeat(32))).toBe(false);
    expect(isLookupToken("a".repeat(31))).toBe(false);
  });

  it("build the lookup path", () => {
    expect(lookupPath("a".repeat(32))).toBe(`/tra-cuu/${"a".repeat(32)}`);
  });
});

describe("employee codes — HR's row key, never a credential", () => {
  it("ignore case, spaces and separators so one person is one row", () => {
    expect(normalizeEmployeeCode(" hp-0148 ")).toBe("HP0148");
    expect(normalizeEmployeeCode("hp 0148")).toBe("HP0148");
    expect(normalizeEmployeeCode("HP–0148")).toBe("HP0148");
  });

  it("returns an empty string for an empty code, so the caller must handle it", () => {
    expect(normalizeEmployeeCode("   ")).toBe("");
  });
});
