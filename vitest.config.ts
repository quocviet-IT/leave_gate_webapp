import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      // Rendering a client component pulls in the server actions it calls, and
      // those reach `server-only`, which throws outside a Server Component.
      // Next.js is what actually enforces that boundary at build time; here it
      // would only stop the render tests from running.
      "server-only": new URL("./tests/stubs/server-only.ts", import.meta.url).pathname,
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
});
