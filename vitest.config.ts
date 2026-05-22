import { defineConfig } from "vitest/config";
import path from "path";

/**
 * Vitest configuration.
 *
 * Mirrors the "@/*" → "./src/*" path alias from tsconfig.json so that test
 * files can import modules that themselves use "@/" internal imports without
 * the Node.js module resolver throwing ERR_MODULE_NOT_FOUND.
 *
 * The existing fee-calculator and sanitize-metadata tests pass without this
 * because their source files have no "@/" imports.  resolve-template.ts
 * imports "@/lib/format-address" which requires this alias to be wired up.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    // Use the same environment as before (no special setup needed).
    environment: "node",
  },
});
