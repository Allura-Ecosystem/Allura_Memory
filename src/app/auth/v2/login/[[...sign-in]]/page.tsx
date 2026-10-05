import { isCloudflareAccessEnabled } from "@/lib/auth/cloudflare-access";
import { isDevAuthActive } from "@/lib/auth/config";

/**
 * Informational login surface.
 *
 * Production authentication is Cloudflare Access, which this application
 * cannot trigger from inside the request. There is no local sign-in form. The
 * page only reports the current truth so a denial redirect can terminate.
 */
export default function LoginPage() {
  const heading = process.env.NODE_ENV === "production"
    ? isCloudflareAccessEnabled()
      ? "Cloudflare Access authentication required"
      : "Authentication unavailable"
    : isDevAuthActive()
      ? "Development authentication is active"
      : "Development authentication unavailable";

  const detail = process.env.NODE_ENV === "production"
    ? isCloudflareAccessEnabled()
      ? "Sign in through your organization's Cloudflare Access policy, then reload this page."
      : "Cloudflare Access is required and not enabled for this deployment. Contact the operator."
    : isDevAuthActive()
      ? "Requests outside production are served by the explicitly enabled DevAuthProvider."
      : "Enable ALLURA_DEV_AUTH_ENABLED=true outside production, or use Cloudflare Access.";

  return (
    <main>
      <h1>{heading}</h1>
      <p>{detail}</p>
    </main>
  );
}