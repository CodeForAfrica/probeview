import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// `server-only` throws if imported outside a React Server Component. Stub it so
// server modules (prometheus.ts, synthetics.ts, and server components) can be
// imported in unit tests.
const serverOnly = fileURLToPath(
  new URL("./test/stubs/server-only.ts", import.meta.url),
);

export default defineConfig({
  // Vite resolves the `@/*` alias from tsconfig.json natively — components
  // import their helpers via `@/lib/...`.
  resolve: { tsconfigPaths: true },
  test: {
    // Coverage is configured once at the root and shared by both projects.
    coverage: {
      provider: "v8",
      include: ["lib/**/*.ts", "components/**/*.tsx"],
      exclude: ["**/*.test.ts", "**/*.test.tsx"],
      reporter: ["text", "html"],
    },
    projects: [
      {
        // Pure server-side logic — fast node environment, no DOM.
        extends: true,
        test: {
          name: "lib",
          environment: "node",
          include: ["lib/**/*.test.ts"],
          alias: { "server-only": serverOnly },
        },
      },
      {
        // React components — jsdom + Testing Library.
        extends: true,
        plugins: [react()],
        test: {
          name: "components",
          environment: "jsdom",
          // Node's experimental Web Storage global can shadow jsdom's
          // window.localStorage with `undefined` unless a persistence file is
          // configured. Component tests should use jsdom's browser storage.
          execArgv: ["--no-experimental-webstorage"],
          include: ["components/**/*.test.tsx", "app/**/*.test.tsx"],
          setupFiles: ["./test/setup.ts"],
          alias: { "server-only": serverOnly },
        },
      },
    ],
  },
});
