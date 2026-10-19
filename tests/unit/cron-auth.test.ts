import { describe, expect, it } from "vitest";
import { cronAuthorisation } from "@/lib/cron-auth";

/**
 * The scheduled routes have no session, so this comparison is the whole guard.
 * The three answers are deliberately distinct: "not configured" says the job
 * never ran, where a 401 would suggest somebody called it wrongly.
 */
describe("who may run a scheduled job", () => {
  const SECRET = "a-long-random-secret-value";

  it("nobody, while the secret is unset", () => {
    expect(cronAuthorisation(undefined, `Bearer ${SECRET}`)).toBe("unconfigured");
    expect(cronAuthorisation("", `Bearer ${SECRET}`)).toBe("unconfigured");
    expect(cronAuthorisation("   ", `Bearer ${SECRET}`)).toBe("unconfigured");
  });

  it("nobody, while the secret is still the example from .env.local.example", () => {
    expect(cronAuthorisation("replace-with-a-long-random-secret", "Bearer replace-with-a-long-random-secret")).toBe(
      "unconfigured",
    );
  });

  it("only a caller carrying the exact bearer token", () => {
    expect(cronAuthorisation(SECRET, `Bearer ${SECRET}`)).toBe("allowed");
  });

  it("nobody with no header, the wrong token, or the right token said wrongly", () => {
    expect(cronAuthorisation(SECRET, null)).toBe("denied");
    expect(cronAuthorisation(SECRET, "")).toBe("denied");
    expect(cronAuthorisation(SECRET, "Bearer wrong")).toBe("denied");
    expect(cronAuthorisation(SECRET, SECRET)).toBe("denied");
    expect(cronAuthorisation(SECRET, `bearer ${SECRET}`)).toBe("denied");
    expect(cronAuthorisation(SECRET, `Bearer ${SECRET} `)).toBe("denied");
  });

  it("and a secret with stray whitespace still works, since env files collect it", () => {
    expect(cronAuthorisation(`  ${SECRET}  `, `Bearer ${SECRET}`)).toBe("allowed");
  });
});
