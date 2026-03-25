import { defineConfig } from "vitest/config";
import path from "path";
import { loadEnv } from "vite";

export default defineConfig(({ mode }) => ({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: {
    globals: true,
    include: ["__tests__/**/*.test.ts"],
    exclude: ["node_modules", ".next"],
    env: loadEnv(mode, process.cwd(), ""),
  },
}));
