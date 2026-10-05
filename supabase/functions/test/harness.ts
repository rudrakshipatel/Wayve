import pg from "pg";
import { straightLine } from "../_shared/routing.ts";
import type { MapboxClient } from "@wave/map-utils";
import { RpcError } from "../_shared/errors.ts";
import { createRepository, type RpcCaller, type WaveRepository } from "../_shared/repository.ts";
import type { FunctionConfig, Handler } from "../_shared/context.ts";
import { createServer } from "../_shared/http.ts";

export const DATABASE_URL = process.env["WAVE_TEST_DATABASE_URL"];

/** Calls SQL functions as `service_role`, like supabase-js with the service key does. */
export function pgRpc(pool: pg.Pool): RpcCaller {
  return async (fn, args) => {
    if (!/^[a-z_][a-z0-9_]*$/.test(fn)) throw new Error(`Invalid function name ${fn}`);
    const keys = Object.keys(args);
    const sql = `select to_jsonb(public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")})) as result`;
    const client = await pool.connect();
    try {
      await client.query("set role service_role");
      const values = keys.map((k) => {
        const v = args[k];
        return typeof v === "object" && v !== null ? JSON.stringify(v) : v;
      });
      const res = await client.query<{ result: unknown }>(sql, values);
      return res.rows[0]?.result ?? null;
    } catch (error) {
      const e = error as { code?: string; message?: string };
      if (e.code) throw new RpcError(e.code, e.message ?? "");
      throw error;
    } finally {
      await client.query("reset role").catch(() => undefined);
      client.release();
    }
  };
}

/** Deterministic stand-in for Mapbox Directions: a straight line, plus one detour alternative. */
export const fakeMapbox: MapboxClient = {
  searchPlaces: () => Promise.resolve([]),
  reverseGeocode: () => Promise.resolve(null),
  directions: (_profile, coords) => {
    const [a, b] = [coords[0]!, coords[coords.length - 1]!];
    const direct = straightLine(a, b, 100);
    const mid: [number, number] = [(a[0] + b[0]) / 2 + 0.01, (a[1] + b[1]) / 2];
    const detour = [...straightLine(a, mid, 100), ...straightLine(mid, b, 100).slice(1)];
    return Promise.resolve([
      { coordinates: direct, distanceM: 0, durationS: 0 },
      { coordinates: detour, distanceM: 0, durationS: 0 },
    ]);
  },
};

export const testConfig: FunctionConfig = {
  shareBaseUrl: "https://wave.test",
  allowedOrigins: ["https://wave.test"],
};

export interface Harness {
  readonly pool: pg.Pool;
  readonly repo: WaveRepository;
  call<T>(
    handler: Handler<T>,
    opts: { user?: string | null; body?: unknown; ip?: string; method?: string },
  ): Promise<{
    status: number;
    body: T & { error?: { code: string; message: string } };
    headers: Headers;
  }>;
  createUser(id: string): Promise<void>;
  sql<R extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<R[]>;
  close(): Promise<void>;
}

export function createHarness(url: string, now: () => number = () => Date.now()): Harness {
  const pool = new pg.Pool({ connectionString: url, max: 6 });
  const repo = createRepository(pgRpc(pool));
  return {
    pool,
    repo,
    async call(handler, { user = null, body, ip = "203.0.113.1", method = "POST" }) {
      const server = createServer({
        handler,
        methods: ["GET", "POST"],
        authenticate: () => Promise.resolve(user),
        config: testConfig,
        context: () => ({ repo, mapbox: fakeMapbox, config: testConfig, now, clientIp: ip }),
      });
      const response = await server(
        new Request("https://functions.test/fn", {
          method,
          headers: { "content-type": "application/json", origin: "https://wave.test" },
          ...(method === "POST" ? { body: JSON.stringify(body ?? {}) } : {}),
        }),
      );
      return {
        status: response.status,
        body: (await response.json()) as never,
        headers: response.headers,
      };
    },
    async createUser(id) {
      await pool.query("insert into auth.users (id, email) values ($1, $2)", [
        id,
        `${id}@example.com`,
      ]);
    },
    async sql(text, values = []) {
      return (await pool.query<never>(text, values)).rows;
    },
    close: () => pool.end(),
  };
}
