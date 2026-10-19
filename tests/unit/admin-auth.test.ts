import { describe, expect, it } from "vitest";
import { ADMIN_ROLES, accountEmail, isAdminRole } from "@/lib/domain/admin-accounts";

/**
 * The admin zone stopped using Google on 2026-08-25 — the provider was never
 * enabled on the Supabase project, so nobody had ever signed in. Two issued
 * accounts replaced it, and a person types a username rather than an address.
 *
 * Supabase keys an account on an email, so something has to turn one into the
 * other. That is this module, and it is tested rather than inlined because
 * getting it wrong means a valid password against a wrong address: a refusal
 * that looks exactly like a typo.
 */

describe("a username becomes the address Supabase knows", () => {
  it("appends the company domain", () => {
    expect(accountEmail("duyet")).toBe("duyet@ctyhp.vn");
    expect(accountEmail("nhansu")).toBe("nhansu@ctyhp.vn");
  });

  it("ignores case and stray spaces, which a phone keyboard adds freely", () => {
    expect(accountEmail("  Duyet  ")).toBe("duyet@ctyhp.vn");
    expect(accountEmail("NHANSU")).toBe("nhansu@ctyhp.vn");
  });

  it("accepts a full address too, rather than doubling the domain", () => {
    expect(accountEmail("duyet@ctyhp.vn")).toBe("duyet@ctyhp.vn");
    expect(accountEmail("  Duyet@CTYHP.vn ")).toBe("duyet@ctyhp.vn");
  });

  it("refuses an address from outside the company instead of mangling it", () => {
    expect(accountEmail("ai-do@gmail.com")).toBeNull();
  });

  it("refuses an empty username rather than asking Supabase about @ctyhp.vn", () => {
    expect(accountEmail("")).toBeNull();
    expect(accountEmail("   ")).toBeNull();
  });

  it("refuses a username carrying an @ that is not the company domain", () => {
    expect(accountEmail("duyet@")).toBeNull();
    expect(accountEmail("a@b@ctyhp.vn")).toBeNull();
  });
});

describe("which roles the admin zone has", () => {
  it("exactly two, since the supervisor was removed", () => {
    expect([...ADMIN_ROLES]).toEqual(["approver", "cnb"]);
  });

  it("recognises them and nothing else", () => {
    expect(isAdminRole("approver")).toBe(true);
    expect(isAdminRole("cnb")).toBe(true);
    expect(isAdminRole("supervisor")).toBe(false);
    expect(isAdminRole("")).toBe(false);
  });
});
