import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Vite resolves the `@/*` alias from tsconfig.json natively.
  resolve: { tsconfigPaths: true },
  test: {
    // lib/ is pure server-side logic — no DOM needed. Add `environment:
    // "jsdom"` (plus @vitejs/plugin-react) if/when we test React components.
    environment: "node",
    include: ["**/*.test.ts"],
    alias: {
      // `server-only` throws if imported outside a React Server Component.
      // Stub it so server modules (prometheus.ts, synthetics.ts) can be
      // unit-tested directly.
      "server-only": fileURLToPath(
        new URL("./test/stubs/server-only.ts", import.meta.url),
      ),
    },
  },
});
