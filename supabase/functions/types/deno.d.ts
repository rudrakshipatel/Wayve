// Type shim so Deno entrypoints typecheck under Node's tsc. Not loaded by Deno.
declare namespace Deno {
  function serve(handler: (request: Request) => Response | Promise<Response>): unknown;
  const env: { get(key: string): string | undefined };
}
