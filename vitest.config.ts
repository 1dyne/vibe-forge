import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@dalgeurak/schema": fileURLToPath(new URL("packages/schema/src/index.ts", import.meta.url)),
      "@dalgeurak/domain": fileURLToPath(new URL("packages/domain/src/index.ts", import.meta.url)),
      "@dalgeurak/rules": fileURLToPath(new URL("packages/rules/src/index.ts", import.meta.url)),
      "@dalgeurak/agents": fileURLToPath(new URL("packages/agents/src/index.ts", import.meta.url)),
      "@dalgeurak/db": fileURLToPath(new URL("packages/db/src/index.ts", import.meta.url))
    }
  },
  test: {
    root,
    environment: "node",
    include: ["tests/**/*.test.ts"]
  }
});
