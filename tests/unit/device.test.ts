import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { deviceHash } from "@/lib/device";

function headers(init: Record<string, string>): Headers {
  return new Headers(init);
}

describe("device throttle key", () => {
  const a = headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8", "user-agent": "Chrome" });

  it("is 32 hex characters", async () => {
    expect(await deviceHash(a, "2026-07-30")).toMatch(/^[0-9a-f]{32}$/);
  });

  it("is stable for the same device on the same day", async () => {
    expect(await deviceHash(a, "2026-07-30")).toBe(await deviceHash(a, "2026-07-30"));
  });

  it("rotates daily, so yesterday's key cannot be replayed", async () => {
    expect(await deviceHash(a, "2026-07-30")).not.toBe(await deviceHash(a, "2026-07-31"));
  });

  it("uses the first address in x-forwarded-for, not the proxy chain", async () => {
    const b = headers({ "x-forwarded-for": "1.2.3.4, 9.9.9.9", "user-agent": "Chrome" });
    expect(await deviceHash(b, "2026-07-30")).toBe(await deviceHash(a, "2026-07-30"));
  });

  it("separates two different devices", async () => {
    const b = headers({ "x-forwarded-for": "1.2.3.5", "user-agent": "Chrome" });
    expect(await deviceHash(b, "2026-07-30")).not.toBe(await deviceHash(a, "2026-07-30"));
  });

  it("still returns a key when the headers are missing", async () => {
    expect(await deviceHash(headers({}), "2026-07-30")).toMatch(/^[0-9a-f]{32}$/);
  });
});
