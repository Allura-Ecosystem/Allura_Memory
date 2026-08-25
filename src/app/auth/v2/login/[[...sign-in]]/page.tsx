import { isClerkEnabled } from "@/lib/auth/config";
import ClerkSignIn from "@/app/clerk-sign-in";
import { AUTH_LOGIN_PATH, sanitizeRedirectTarget } from "@/lib/auth/redirect-target";

interface LoginPageProps {
  searchParams: Promise<{ redirect_url?: string | string[] }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const redirectTarget = sanitizeRedirectTarget((await searchParams).redirect_url);
  const clerkEnabled = isClerkEnabled();

  if (!clerkEnabled) {
    return (
      <main>
        <h1>{process.env.NODE_ENV === "production" ? "Authentication unavailable" : "Development authentication is active"}</h1>
        <p>Clerk sign-in requires Clerk configuration.</p>
      </main>
    );
  }

  return (
    <main>
      <ClerkSignIn
        fallbackRedirectUrl={redirectTarget}
        forceRedirectUrl={redirectTarget}
        path={AUTH_LOGIN_PATH}
        routing="path"
      />
    </main>
  );
}
