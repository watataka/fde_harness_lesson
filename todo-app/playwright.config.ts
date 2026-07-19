import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

// テストヘルパー(tests/e2e/helpers/supabase-test-client.ts)がSupabaseへ直接接続する
// ためにSUPABASE_URL/SUPABASE_SERVICE_ROLE_KEYを必要とする。Playwrightのテスト
// ランナープロセスはNext.jsの.env.local自動読み込みの対象外のため、ここで明示的に読む。
try {
  process.loadEnvFile(path.resolve(__dirname, ".env.local"));
} catch {
  // .env.local が無い環境(CI等)では素通しする。webServer起動時にNext.js側の
  // fail-fast検証がどのみち失敗を報告する。
}

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
  },
});
