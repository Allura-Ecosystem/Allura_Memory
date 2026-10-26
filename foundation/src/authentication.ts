import { createHash, verify, type KeyObject } from 'node:crypto';
import { AuthorityError, type PrincipalKind } from './authority.ts';

type HumanIdentity = Readonly<{ kind: 'human'; issuer: string; subject: string; expiresAt: number }>;
export type MachineCredential = Readonly<{
  kind: Exclude<PrincipalKind, 'human'>; principalId: string; groupId: string;
  workspaceId: string; actions: readonly string[]; expiresAt: number; revoked: boolean;
}>;
type MachineIdentity = MachineCredential & Readonly<{ credentialDigest: string }>;
export type Identity = HumanIdentity | MachineIdentity;
const verified = new WeakSet<object>();
export function isAuthenticated(value: object): value is Identity { return verified.has(value); }
function issue<T extends Identity>(value: T): T { Object.freeze(value); verified.add(value); return value; }
export type HumanConfig = Readonly<{ issuer: string; audience: string; keys: ReadonlyMap<string, KeyObject> }>;
function objectPart(part: string): Record<string, unknown> {
  if (!/^[A-Za-z0-9_-]+$/.test(part)) { throw new Error(); }
  const bytes = Buffer.from(part, 'base64url');
  if (bytes.toString('base64url') !== part) { throw new Error(); }
  const result: unknown = JSON.parse(bytes.toString('utf8'));
  if (!result || typeof result !== 'object' || Array.isArray(result)) { throw new Error(); }
  return result as Record<string, unknown>;
}
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const integer = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v);
export function authenticateHuman(tokens: { assertion?: string; cookie?: string }, config: HumanConfig, now = Math.floor(Date.now() / 1000)): HumanIdentity {
  try {
    if (!integer(now) || !text(config.audience) || !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(config.issuer)) { throw new Error(); }
    if (tokens.assertion !== undefined && tokens.cookie !== undefined && tokens.assertion !== tokens.cookie) { throw new Error(); }
    const token = tokens.assertion ?? tokens.cookie;
    if (!token || token.length > 16384) { throw new Error(); }
    const parts = token.split('.');
    if (parts.length !== 3) { throw new Error(); }
    const [head, body, signature] = parts as [string, string, string];
    const header = objectPart(head);
    if (header.alg !== 'RS256' || !text(header.kid) || header.jku !== undefined || header.jwk !== undefined || header.x5u !== undefined || header.crit !== undefined) { throw new Error(); }
    const key = config.keys.get(header.kid);
    if (!key || key.type !== 'public' || key.asymmetricKeyType !== 'rsa' || (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) { throw new Error(); }
    if (!/^[A-Za-z0-9_-]+$/.test(signature)) { throw new Error(); }
    const sigBytes = Buffer.from(signature, 'base64url');
    if (sigBytes.toString('base64url') !== signature || !verify('RSA-SHA256', Buffer.from(`${head}.${body}`), key, sigBytes)) { throw new Error(); }
    const payload = objectPart(body);
    const aud = payload.aud;
    const audienceMatches = aud === config.audience || (Array.isArray(aud) && aud.every(v => typeof v === 'string') && aud.includes(config.audience));
    if (payload.iss !== config.issuer || !audienceMatches || payload.type !== 'app' || !text(payload.sub) || !text(payload.email) ||
        payload.common_name !== undefined || payload.service_token_id !== undefined ||
        !integer(payload.exp) || !integer(payload.iat) || payload.exp <= now || payload.iat > now || payload.exp <= payload.iat ||
        (payload.nbf !== undefined && (!integer(payload.nbf) || payload.nbf > now))) { throw new Error(); }
    return issue({ kind: 'human', issuer: config.issuer, subject: payload.sub, expiresAt: payload.exp });
  } catch { throw new AuthorityError('unauthenticated'); }
}
export async function authenticateMachine(token: string, lookup: (digest: string) => Promise<MachineCredential | null>, now = Math.floor(Date.now() / 1000)): Promise<Identity> {
  try {
    // 256-bit or stronger opaque random tokens, never JWT/browser credentials.
    if (!/^[A-Za-z0-9_-]{43,128}$/.test(token) || !integer(now)) { throw new Error(); }
    const credentialDigest = createHash('sha256').update(token).digest('hex');
    const credential = await lookup(credentialDigest);
    if (!credential || !['service', 'device', 'worker'].includes(credential.kind) || credential.revoked !== false || !integer(credential.expiresAt) || credential.expiresAt <= now || !Array.isArray(credential.actions) || !credential.actions.every(text)) { throw new Error(); }
    return issue({ ...credential, credentialDigest, actions: Object.freeze([...credential.actions]) });
  } catch { throw new AuthorityError('unauthenticated'); }
}
export function requireSameOrigin(expected: string, origin: string | null, fetchSite: string | null): void {
  try {
    const url = new URL(expected);
    if (url.origin !== expected || url.protocol !== 'https:' || origin !== expected || fetchSite !== 'same-origin') { throw new Error(); }
  } catch { throw new AuthorityError('forbidden'); }
}
export function safeReturnTarget(target: string): string {
  try {
    const decoded = decodeURIComponent(target);
    if (!decoded.startsWith('/') || decoded.startsWith('//') || /[\\\x00-\x20]/.test(decoded)) { return '/memory'; }
    const url = new URL(decoded, 'https://local.invalid');
    if (url.origin !== 'https://local.invalid' || /^\/auth(?:\/|$)/i.test(url.pathname)) { return '/memory'; }
    return target;
  } catch { return '/memory'; }
}
