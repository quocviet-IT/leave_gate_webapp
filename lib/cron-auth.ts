/**
 * Who may run a scheduled job.
 *
 * The cron routes have no session to lean on, so the whole decision is this
 * one comparison — which makes it worth having somewhere it can be tested
 * rather than only reachable through a running server with the right
 * environment.
 *
 * An unset or example secret is its own answer: refusing with "not configured"
 * says the job never ran, where a 401 would suggest somebody called it wrongly.
 */
export type CronAuthorisation = "unconfigured" | "denied" | "allowed";

export function cronAuthorisation(
  secret: string | undefined,
  authorizationHeader: string | null,
): CronAuthorisation {
  const expected = (secret ?? "").trim();
  if (!expected || expected.startsWith("replace-with")) return "unconfigured";
  return authorizationHeader === `Bearer ${expected}` ? "allowed" : "denied";
}
