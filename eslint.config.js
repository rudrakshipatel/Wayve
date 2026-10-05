// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  {
    ignores: ["**/node_modules/**", "**/dist/**", "**/.next/**", "**/.expo/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      "no-console": "error",
      "@typescript-eslint/prefer-nullish-coalescing": [
        "error",
        { ignorePrimitives: { boolean: true } },
      ],
      // `noUncheckedIndexedAccess` is on; `!` marks index reads already bounds-checked.
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
  {
    files: ["apps/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },
  {
    // Edge functions log server-side errors to the platform log.
    files: ["supabase/functions/**/*.ts"],
    rules: { "no-console": ["error", { allow: ["error"] }] },
  },
  {
    // CommonJS tool configs (Metro, Babel, Tailwind).
    files: ["apps/mobile/*.js"],
    languageOptions: {
      sourceType: "commonjs",
      globals: {
        require: "readonly",
        module: "writable",
        __dirname: "readonly",
        process: "readonly",
      },
    },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    // Node build/test scripts (ESM).
    files: ["apps/*/scripts/**/*.mjs", "supabase/functions/scripts/**/*.mjs"],
    languageOptions: { globals: { process: "readonly", console: "readonly" } },
    rules: { "no-console": "off" },
  },
  {
    files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
    ...tseslint.configs.disableTypeChecked,
  },
);
