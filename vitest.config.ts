import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    // Ensure vi.stubEnv restores automatically; we also do vi.unstubAllEnvs()
    // in afterEach as belt-and-suspenders.
    unstubEnvs: true,
  },
});