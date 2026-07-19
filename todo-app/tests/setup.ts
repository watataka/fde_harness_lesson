import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// server-only は "react-server" という Next.js のRSCバンドラー専用のexport条件でのみ
// no-opになる。Vitestはこの条件を持たないため、テスト実行時は常にthrowしてしまう。
// 実際のNext.jsビルド/dev時の安全機構としての効果はそのままに、テストでは無害化する。
vi.mock("server-only", () => ({}));

// lib/supabase/server.ts は読み込み時にSUPABASE_URL/SUPABASE_SERVICE_ROLE_KEYを検証する
// (fail-fast)。Vitestは.env.localを自動で読み込まないため、これらを直接モックしない
// テスト(actions/components経由でservice層を間接的にimportするだけのテスト等)で
// モジュール読み込み自体が失敗しないよう、ダミー値をフォールバックとして設定する。
// 実際のSupabaseへの通信は発生しない(クライアント生成に使われるだけ)。
process.env.SUPABASE_URL ??= "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-dummy-service-role-key";
