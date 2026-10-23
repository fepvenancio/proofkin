import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["@proofkin/core/testing/global-setup"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
