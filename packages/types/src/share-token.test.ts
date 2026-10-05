import { describe, expect, it } from "vitest";
import {
  SHARE_TOKEN_LENGTH,
  buildShareUrl,
  bytesToBase64Url,
  generateChannelKey,
  generateShareToken,
  hashShareToken,
  isWellFormedShareToken,
  parseShareToken,
  shareTokenPrefix,
} from "./share-token.ts";

const enc = (s: string): Uint8Array => Uint8Array.from(s, (c) => c.charCodeAt(0));

describe("base64url", () => {
  it("matches RFC 4648 vectors without padding", () => {
    expect(bytesToBase64Url(enc(""))).toBe("");
    expect(bytesToBase64Url(enc("f"))).toBe("Zg");
    expect(bytesToBase64Url(enc("fo"))).toBe("Zm8");
    expect(bytesToBase64Url(enc("foo"))).toBe("Zm9v");
    expect(bytesToBase64Url(enc("foob"))).toBe("Zm9vYg");
    expect(bytesToBase64Url(new Uint8Array([0xfb, 0xff]))).toBe("-_8");
  });
});

describe("share tokens", () => {
  it("generates well-formed, unique tokens", () => {
    const tokens = new Set(Array.from({ length: 500 }, generateShareToken));
    expect(tokens.size).toBe(500);
    for (const t of tokens) {
      expect(t).toHaveLength(SHARE_TOKEN_LENGTH);
      expect(isWellFormedShareToken(t)).toBe(true);
    }
  });
  it("generates channel keys independent of tokens", () => {
    expect(generateChannelKey()).toMatch(/^[A-Za-z0-9_-]{24}$/);
  });
  it("rejects malformed tokens", () => {
    expect(isWellFormedShareToken("short")).toBe(false);
    expect(isWellFormedShareToken(`${"a".repeat(42)}=`)).toBe(false);
    expect(isWellFormedShareToken(`${"a".repeat(42)}/`)).toBe(false);
    expect(isWellFormedShareToken("a".repeat(44))).toBe(false);
    expect(isWellFormedShareToken(42)).toBe(false);
    expect(isWellFormedShareToken(null)).toBe(false);
  });
  it("hashes with SHA-256 hex", async () => {
    await expect(hashShareToken("abc")).resolves.toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
  it("builds and parses share URLs", () => {
    const token = generateShareToken();
    const url = buildShareUrl("https://wave.app/", token);
    expect(url).toBe(`https://wave.app/journey/${token}`);
    expect(parseShareToken(url)).toBe(token);
    expect(parseShareToken(`${url}?utm=x#map`)).toBe(token);
    expect(parseShareToken(token)).toBe(token);
    expect(parseShareToken("https://wave.app/journey/../../etc")).toBeNull();
    expect(() => buildShareUrl("https://wave.app", "nope")).toThrow();
    expect(shareTokenPrefix(token)).toBe(token.slice(0, 6));
  });
});
