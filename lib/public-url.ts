type HeaderReader = { get(name: string): string | null };

function withoutTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

/**
 * Resolve the public origin used inside QR codes.
 *
 * Prefer deployment-owned environment values. Request headers are only the
 * local-development fallback, where Vercel variables do not exist.
 */
export function publicOrigin(headers: HeaderReader): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return withoutTrailingSlash(new URL(configured).origin);

  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (productionHost) return `https://${withoutTrailingSlash(productionHost)}`;

  const deploymentHost = process.env.VERCEL_URL?.trim();
  if (deploymentHost) return `https://${withoutTrailingSlash(deploymentHost)}`;

  const forwardedHost = headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || headers.get("host")?.trim() || "localhost:3000";
  const forwardedProtocol = headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProtocol === "https" ? "https" : "http";
  return `${protocol}://${host}`;
}

export function absolutePublicUrl(headers: HeaderReader, path: string): string {
  if (!path.startsWith("/")) throw new Error("Đường dẫn công khai phải bắt đầu bằng /");
  return new URL(path, `${publicOrigin(headers)}/`).toString();
}
