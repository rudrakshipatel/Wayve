import { describe, expect, it } from "vitest";
import { parseAuthCallback } from "./auth-callback";

describe("parseAuthCallback", () => {
  it("reads a PKCE code from a magic link or OAuth redirect", () => {
    expect(parseAuthCallback({ code: "abc" })).toEqual({ kind: "code", code: "abc" });
    expect(parseAuthCallback({ code: ["abc", "x"] })).toEqual({ kind: "code", code: "abc" });
  });
  it("reads token hashes from custom templates", () => {
    expect(parseAuthCallback({ token_hash: "h", type: "magiclink" })).toEqual({
      kind: "token_hash",
      tokenHash: "h",
      type: "magiclink",
    });
    expect(parseAuthCallback({ token_hash: "h", type: "bogus" })).toEqual({ kind: "none" });
  });
  it("surfaces errors such as expired links", () => {
    expect(
      parseAuthCallback({
        error: "access_denied",
        error_description: "Email+link+is+invalid+or+has+expired",
      }),
    ).toEqual({
      kind: "error",
      message: "Email link is invalid or has expired",
    });
  });
  it("ignores empty callbacks", () => {
    expect(parseAuthCallback({})).toEqual({ kind: "none" });
  });
});
