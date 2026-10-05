// Copies the shared @wave/* package sources into supabase/functions/_vendor so the
// Supabase bundler (which only sees supabase/functions) can resolve them through deno.json.
// Run before `supabase functions serve` / `supabase functions deploy`.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const functionsDir = path.resolve(here, "..");
const packagesDir = path.resolve(functionsDir, "../../packages");
const vendorDir = path.join(functionsDir, "_vendor");
const PACKAGES = ["types", "map-utils", "simulation-engine"];

fs.rmSync(vendorDir, { recursive: true, force: true });
for (const name of PACKAGES) {
  const src = path.join(packagesDir, name, "src");
  const dest = path.join(vendorDir, name);
  fs.cpSync(src, dest, {
    recursive: true,
    filter: (file) => !/\.test\.ts$|test-fixtures\.ts$/.test(file),
  });
}
console.log(`Vendored ${PACKAGES.join(", ")} into ${path.relative(process.cwd(), vendorDir)}`);
