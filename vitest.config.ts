import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    setupFiles: ["./tests/setup.ts"],
    pool: "forks",
    reporters: "verbose",
    include: ["./tests/**/*.test.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    testTimeout: 420_000,
    bail: 3,
  },
});
