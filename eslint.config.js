// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";

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
      // `noUncheckedIndexedAccess` is on; `!` marks index reads already bounds-checked.
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
  {
    // Edge functions log server-side errors to the platform log.
    files: ["supabase/functions/**/*.ts"],
    rules: { "no-console": ["error", { allow: ["error"] }] },
  },
  {
    files: ["**/*.js"],
    ...tseslint.configs.disableTypeChecked,
  },
);
