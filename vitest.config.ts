import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/test/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary"],
      reportsDirectory: "coverage",
      clean: true,
      include: ["packages/**/src/**/*.ts"],
      exclude: [
        "**/dist/**",
        "**/*.d.ts",
        "**/node_modules/**",
        "packages/extension/scripts/**",
        "packages/server/src/bin.ts",
        "packages/server/src/setup.ts",
        "packages/shared/src/types.ts",
      ],
    },
  },
});
