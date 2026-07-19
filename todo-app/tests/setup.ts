import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// server-only は "react-server" という Next.js のRSCバンドラー専用のexport条件でのみ
// no-opになる。Vitestはこの条件を持たないため、テスト実行時は常にthrowしてしまう。
// 実際のNext.jsビルド/dev時の安全機構としての効果はそのままに、テストでは無害化する。
vi.mock("server-only", () => ({}));
