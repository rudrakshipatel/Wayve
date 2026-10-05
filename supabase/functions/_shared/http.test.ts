import { describe, expect, it } from "vitest";
import { ApiError } from "./errors.ts";
import type { FunctionConfig, Handler } from "./context.ts";
import { clientIp, createServer } from "./http.ts";
import type { WaveRepository } from "./repository.ts";

const config: FunctionConfig = {
  shareBaseUrl: "https://wave.test",
  allowedOrigins: ["https://wave.test"],
};

function server<T>(handler: Handler<T>, log?: (m: string, e: unknown) => void) {
  return createServer({
    handler,
    methods: ["POST"],
    authenticate: (req) => Promise.resolve(req.headers.get("x-user")),
    config,
    context: () => ({
      repo: {} as WaveRepository,
      mapbox: null,
      config,
      now: () => 0,
      clientIp: "1.2.3.4",
    }),
    ...(log ? { log } : {}),
  });
}

const post = (body: string, headers: Record<string, string> = {}) =>
  new Request("https://fn.test/x", { method: "POST", body, headers });

describe("createServer", () => {
  it("answers CORS preflight for allowed origins only", async () => {
    const s = server(() => Promise.resolve({}));
    const ok = await s(
      new Request("https://fn.test/x", {
        method: "OPTIONS",
        headers: { origin: "https://wave.test" },
      }),
    );
    expect(ok.status).toBe(204);
    expect(ok.headers.get("access-control-allow-origin")).toBe("https://wave.test");
    const evil = await s(
      new Request("https://fn.test/x", {
        method: "OPTIONS",
        headers: { origin: "https://evil.test" },
      }),
    );
    expect(evil.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("passes the parsed body and user to the handler", async () => {
    const s = server((ctx, body) => Promise.resolve({ user: ctx.userId, body }));
    const res = await s(post('{"a":1}', { "x-user": "u1" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ user: "u1", body: { a: 1 } });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("rejects bad methods and bodies", async () => {
    const s = server(() => Promise.resolve({}));
    expect((await s(new Request("https://fn.test/x", { method: "GET" }))).status).toBe(405);
    const bad = await s(post("{nope"));
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({
      error: { code: "invalid_json", message: "Request body must be JSON" },
    });
    expect((await s(post(`"${"x".repeat(300_000)}"`))).status).toBe(413);
  });

  it("returns ApiErrors and masks unexpected errors", async () => {
    const logged: unknown[] = [];
    const known = server(() => Promise.reject(new ApiError(409, "nope", "Not now")));
    expect(await (await known(post("{}"))).json()).toEqual({
      error: { code: "nope", message: "Not now" },
    });
    const unknown = server(
      () => Promise.reject(new Error("connection string postgres://secret")),
      (_m, e) => logged.push(e),
    );
    const res = await unknown(post("{}"));
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("secret");
    expect(logged).toHaveLength(1);
  });
});

describe("clientIp", () => {
  it("uses the first forwarded address", () => {
    const req = new Request("https://fn.test", {
      headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" },
    });
    expect(clientIp(req)).toBe("203.0.113.9");
    expect(clientIp(new Request("https://fn.test"))).toBe("unknown");
  });
});
