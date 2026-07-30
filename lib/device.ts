import "server-only";

/**
 * A coarse key for throttling the public form.
 *
 * It is not identity and must not be treated as such: a whole workshop behind one
 * router shares an address, and a determined person changes theirs. It exists to
 * stop the accidental double-tap and the crude flood, which is what rule 3 asks
 * of it. The day is mixed in so a key cannot be replayed across days, and the
 * result is a hash so the audit log never carries a raw address.
 */
export async function deviceHash(headers: Headers, todayIct: string): Promise<string> {
  const forwarded = headers.get("x-forwarded-for") ?? "";
  const address = forwarded.split(",")[0]?.trim() || "unknown";
  const agent = headers.get("user-agent") ?? "unknown";
  const material = `${address}|${agent}|${todayIct}`;

  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
  return [...new Uint8Array(digest)]
    .slice(0, 16)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
