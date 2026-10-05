import { describe, expect, it } from "vitest";
import type { WaveRepository } from "../repository.ts";
import type { HandlerContext } from "../context.ts";
import { createDeleteAccount } from "./delete-account.ts";

const ctx = (userId: string | null): HandlerContext => ({
  repo: { consumeRateLimit: () => Promise.resolve(true) } as unknown as WaveRepository,
  mapbox: null,
  config: { shareBaseUrl: "https://wave.test", allowedOrigins: [] },
  now: () => 0,
  userId,
  clientIp: "x",
});

describe("delete-account", () => {
  it("requires sign-in and explicit confirmation", async () => {
    const deleted: string[] = [];
    const handler = createDeleteAccount((id) => {
      deleted.push(id);
      return Promise.resolve();
    });
    await expect(handler(ctx(null), { confirm: "DELETE" })).rejects.toMatchObject({ status: 401 });
    await expect(handler(ctx("u1"), {})).rejects.toMatchObject({ status: 400 });
    await expect(handler(ctx("u1"), { confirm: "DELETE" })).resolves.toEqual({ deleted: true });
    expect(deleted).toEqual(["u1"]);
  });
});
