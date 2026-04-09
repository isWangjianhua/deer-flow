import { defineConfig, devices } from "@playwright/test";

const useExistingServer = process.env.PLAYWRIGHT_USE_EXISTING_SERVER === "1";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:3001",
    trace: "on-first-retry",
  },
  webServer: useExistingServer
    ? undefined
    : {
        command: "pnpm dev --port 3001",
        port: 3001,
        reuseExistingServer: !process.env.CI,
        env: {
          BETTER_AUTH_SECRET: "test-secret",
          NEXT_PUBLIC_AUTH_E2E_MOCK: "1",
        },
      },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
