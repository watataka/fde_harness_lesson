import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

describe("lib/supabase/server", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.resetModules(); // モジュールトップレベルの副作用(env検証)を毎回再評価させるため、モジュールキャッシュをクリアする
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("SUPABASE_URLとSUPABASE_SERVICE_ROLE_KEYが未設定だとインポート時にエラーになる", async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    await expect(import("@/lib/supabase/server")).rejects.toThrow(
      /SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set/
    );
  });

  it("環境変数が設定されていればクライアントが生成される", async () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "dummy-service-role-key";
    const { supabaseServer } = await import("@/lib/supabase/server");
    expect(supabaseServer).toBeDefined();
  });
});
