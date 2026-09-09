export type ConnectionGuide = Readonly<{
  endpoint: string;
  transport: "streamable-http";
  steps: readonly [string, string, string];
  authorizationHeader: string;
}>;

/**
 * Public-safe client guidance. This deliberately contains placeholders only:
 * credentials are issued by the server and shown once in the portal client.
 */
export function buildConnectionGuide(endpoint: string): ConnectionGuide {
  return {
    endpoint,
    transport: "streamable-http",
    steps: [
      "Sign in through Cloudflare Access with your approved work account.",
      "Create or obtain a least-privilege Allura MCP credential from an administrator.",
      "Add the endpoint and credential to your MCP client; store the credential in that client's secure store.",
    ],
    authorizationHeader: "Authorization: Bearer <your Allura MCP credential>",
  };
}
