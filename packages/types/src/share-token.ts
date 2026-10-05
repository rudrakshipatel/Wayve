/**
 * Share tokens: 32 bytes from a CSPRNG, base64url-encoded without padding (43 chars).
 * Only the SHA-256 hex digest is persisted; the raw token is shown to the owner once.
 */
export const SHARE_TOKEN_BYTES = 32;
export const SHARE_TOKEN_LENGTH = 43;
export const SHARE_TOKEN_PREFIX_LENGTH = 6;

const SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function isWellFormedShareToken(value: unknown): value is string {
  return typeof value === "string" && SHARE_TOKEN_PATTERN.test(value);
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out +=
      alphabet[(n >> 18) & 63]! +
      alphabet[(n >> 12) & 63]! +
      alphabet[(n >> 6) & 63]! +
      alphabet[n & 63]!;
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = (bytes[i] ?? 0) << 16;
    out += alphabet[(n >> 18) & 63]! + alphabet[(n >> 12) & 63]!;
  } else if (rest === 2) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8);
    out += alphabet[(n >> 18) & 63]! + alphabet[(n >> 12) & 63]! + alphabet[(n >> 6) & 63]!;
  }
  return out;
}

/** Minimal Web Crypto surface, available in browsers, Node >= 19, Deno and Hermes polyfills. */
interface WebCryptoLike {
  getRandomValues(array: Uint8Array): Uint8Array;
  readonly subtle: { digest(algorithm: "SHA-256", data: Uint8Array): Promise<ArrayBuffer> };
}

interface Utf8Encoder {
  encode(input: string): Uint8Array;
}

function webCrypto(): WebCryptoLike {
  const c = (globalThis as { crypto?: WebCryptoLike }).crypto;
  if (!c?.getRandomValues) {
    throw new Error("A Web Crypto implementation is required to generate share tokens");
  }
  return c;
}

/** Generates a new share token. Must run server-side (edge function). */
export function generateShareToken(): string {
  const bytes = new Uint8Array(SHARE_TOKEN_BYTES);
  webCrypto().getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

/** Random, URL-safe realtime channel key (independent of the share token). */
export function generateChannelKey(): string {
  const bytes = new Uint8Array(18);
  webCrypto().getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

/** Lowercase hex SHA-256 of the token, matching `encode(sha256(token), 'hex')` in Postgres. */
export async function hashShareToken(token: string): Promise<string> {
  const Encoder = (globalThis as unknown as { TextEncoder: new () => Utf8Encoder }).TextEncoder;
  const data = new Encoder().encode(token);
  const digest = await webCrypto().subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function shareTokenPrefix(token: string): string {
  return token.slice(0, SHARE_TOKEN_PREFIX_LENGTH);
}

export function buildShareUrl(baseUrl: string, token: string): string {
  if (!isWellFormedShareToken(token)) throw new Error("Malformed share token");
  return `${baseUrl.replace(/\/+$/, "")}/journey/${token}`;
}

/** Extracts a token from a share URL or bare token; returns null when malformed. */
export function parseShareToken(input: string): string | null {
  const trimmed = input.trim();
  const candidate = /\/journey\/([^/?#]+)/.exec(trimmed)?.[1] ?? trimmed;
  return isWellFormedShareToken(candidate) ? candidate : null;
}

/** Random seed for deterministic simulation variation (not a secret). */
export function generateSeed(): string {
  const bytes = new Uint8Array(12);
  webCrypto().getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}
