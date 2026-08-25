import "server-only";

/** Current server time, isolated from React render purity checks. */
export function serverNow(): Date {
  return new Date();
}
