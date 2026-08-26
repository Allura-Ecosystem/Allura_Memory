const DEFAULT_REDIRECT_TARGET = "/dashboard/curator";
export const AUTH_LOGIN_PATH = "/auth/v2/login";

export function sanitizeRedirectTarget(
  value: string | string[] | null | undefined,
  fallback = DEFAULT_REDIRECT_TARGET,
): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (
    typeof candidate !== "string" ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(candidate)
  ) {
    return fallback;
  }

  try {
    const parsed = new URL(candidate, "https://allura.local");
    return parsed.origin === "https://allura.local"
      ? `${parsed.pathname}${parsed.search}${parsed.hash}`
      : fallback;
  } catch {
    return fallback;
  }
}
