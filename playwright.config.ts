import { defineConfig, devices } from "@playwright/test";

const inCi = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./test/browser",
  fullyParallel: true,
  forbidOnly: inCi,
  retries: inCi ? 2 : 0,
  ...(inCi ? { workers: 1 } : {}),
  reporter: inCi
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://127.0.0.1:4173/ui-theme-builder/",
    permissions: ["clipboard-read", "clipboard-write"],
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command:
      "npm run build && npm run preview -w @s9rg/theme-playground -- --host 127.0.0.1 --port 4173 --strictPort",
    reuseExistingServer: !inCi,
    timeout: 120_000,
    url: "http://127.0.0.1:4173/ui-theme-builder/",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
