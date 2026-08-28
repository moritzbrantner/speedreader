import { defineConfig } from "@playwright/test";

const port = 3_173;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  reporter: "list",
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `bun run dev --hostname 127.0.0.1 --port ${port}`,
    env: {
      NEXT_PUBLIC_EXTRACTION_URL: "/__mock-pdf-extraction",
    },
    reuseExistingServer: false,
    timeout: 120_000,
    url: baseURL,
  },
});
