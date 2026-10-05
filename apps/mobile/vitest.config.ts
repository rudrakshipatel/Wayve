import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["stores/**/*.test.ts", "lib/**/*.test.ts", "components/**/*.test.ts"] },
});
