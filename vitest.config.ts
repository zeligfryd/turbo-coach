import { defineConfig } from "vitest/config";
import path from "path";
import { loadEnv } from "vite";

/**
 * Tests under __tests__/evaluation call the Anthropic API for real: they ask a
 * model to produce a pacing plan and then assert on what comes back. That makes
 * them slow (minutes, not seconds), billed, and able to fail for reasons that
 * have nothing to do with the code — an expired key or an empty credit balance
 * turns the whole suite red.
 *
 * So they are out of the default run everywhere: `npm test`, CI, and an IDE
 * picking up this config all skip them. `npm run test:eval` sets RUN_EVAL and
 * is the only way in.
 *
 * The switch lives here rather than in the npm script because an exclude in the
 * config would also filter the files out when test:eval names them explicitly —
 * CLI paths filter the collected set, they do not add back to it.
 */
const RUN_EVAL = process.env.RUN_EVAL === "1";

export default defineConfig(({ mode }) => ({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: {
    globals: true,
    include: ["__tests__/**/*.test.ts"],
    exclude: ["node_modules", ".next", ...(RUN_EVAL ? [] : ["__tests__/evaluation/**"])],
    env: loadEnv(mode, process.cwd(), ""),
  },
}));
