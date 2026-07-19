# 実装計画・進捗管理

> このファイルは進捗に応じて随時更新する。完了した項目は `[x]` にし、必要であれば一言メモを添える。

## 完了した作業

- [x] `docs/requirements.md` — 元要求
- [x] `docs/spec.md` — Todo管理アプリ仕様書。Supabase移行に伴い 6.1（設定値の保存先）, 6.3（Todoデータの保存先）, 異常系No.11（ネットワーク切断時の挙動）を更新
- [x] `CLAUDE.md` — Flask+Jinja2+SQLAlchemy(日記アプリ)からNext.js(TypeScript)+Supabase(Todo管理アプリ)向けに全面書き換え。既存の無関係な`todos`テーブルに関する注記を追加
- [x] `.mcp.json` — Supabase MCPサーバー登録（`--project-ref`、`SUPABASE_ACCESS_TOKEN`は環境変数参照のみ）
- [x] `docs/design/db-schema.md`（Rev.4） — `task_todos` / `settings` テーブル設計
  - 目付け役レビュー: Rev.1 **REJECT**（`carried_over_from_id`のFK制約欠陥）→ Rev.2修正 → 再レビュー **CONDITIONAL**（btrim・楽観的排他制御等）→ Rev.3修正 → Rev.4で`todos`→`task_todos`にリネーム（既存の無関係な`todos`テーブルとの衝突回避、ユーザー判断）
- [x] Supabase実データベースへマイグレーション適用済み
  - `todo-app/supabase/migrations/0001_init.sql`（`task_todos`, `settings`本体）
  - `todo-app/supabase/migrations/0002_add_carried_over_from_id_index.sql`（`get_advisors`指摘によるFKインデックス追加）
  - 既存の無関係な`todos`テーブル（3行、anon roleに対しINSERT/UPDATE/DELETEが無制限に許可されたRLSポリシーあり）は変更していない。**このテーブルのセキュリティ状態は本プロジェクトのスコープ外で未対応のまま**
- [x] `docs/design/notification-logic.md`（Rev.2） — 通知ロジック設計（プッシュ通知は時刻完全一致・1日1回、状態バナーは`>=`判定で独立評価、という分離設計）
  - 目付け役レビュー: Rev.1 **CONDITIONAL** → Rev.2修正 → **PASS**
  - ユーザー決定事項: スリープ復帰時の緩和判定は不採用（spec.md異常系No.2優先）、マルチユーザー対応(`user_id`)は追加しない
- [x] `docs/design/service-layer-api.md`（Rev.2、Rev.3で軽微訂正） — `todo-service.ts` / `setting-service.ts` の関数シグネチャ・バリデーション・レスポンス形式
  - 目付け役レビュー: Rev.1 **CONDITIONAL** → Rev.2修正 → **PASS**
  - ユーザー決定事項: Server Componentはサービス層を直接呼び出してよい（Route Handlerを経由しない、Vercelベストプラクティスに準拠）
  - 設計のポイント: `updateTodoStatus`はサービス層内で1回自動リトライし異常系No.7を解決／30日クリーンアップは`after()`で非同期化
- [x] `docs/design/component-design.md`（Rev.3） — 画面/コンポーネント設計（Server/Client Componentの境界線、`today`日付の扱い）
  - 目付け役レビュー: Rev.1 **REJECT** → Rev.2修正 → 再レビュー **REJECT**（2回連続） → Rev.3で根本設計変更 → **PASS**
  - **重要な設計変更**: SSR初期表示（Server Component）は`getTodosByDate`による読み取り専用とし、繰越・クリーンアップ（書き込み）は新設のServer Action `initializeToday(date)` としてクライアントが直接計算したブラウザ日付でのみ実行する方式に変更。これに伴い service-layer-api.md 側の`initializeTodayTodos`呼び出し元の記述も訂正済み
  - 新規ファイル（要実装時に作成）: `lib/date-utils.ts`（`getLocalDateString()`）
  - ハイライト機能（AC-4.4）は`notification-manager.tsx`内の軽量Contextで実現、`lib/date-utils.ts`以外の新規ファイルは追加しない

## 今後の実装計画

### 設計フェーズ

全4件完了（DBスキーマ、通知ロジック、サービス層API、画面/コンポーネント）。実装フェーズへ移行する。

### 実装フェーズ（CLAUDE.md 6章の段階制御ルールに従い1ステップずつ）

- [x] Next.jsプロジェクトのscaffold作成
  - `create-next-app`（TypeScript, App Router, ESLint, no Tailwind, no src-dir）を一時ディレクトリに生成し、既存の`todo-app/supabase/`と統合
  - 依存関係を追加: `@supabase/supabase-js`（本番）、`vitest` / `@testing-library/react` / `@testing-library/jest-dom` / `@testing-library/user-event` / `jsdom` / `@vitejs/plugin-react`（開発）、`@playwright/test`（開発）
  - `vitest.config.ts`（jsdom環境、`tests/unit`と`tests/component`を対象）、`playwright.config.ts`（`tests/e2e`対象、`npm run dev`をwebServerとして起動）を作成
  - `package.json`に`test`（Vitest）・`test:e2e`（Playwright）スクリプトを追加
  - `.env.local.example`を作成（`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`。実値は`.env.local`に。`.gitignore`の`.env*`除外に`!.env.local.example`の例外を追加）
  - `npm run build` / `npm run lint` / `npm run test` で疎通確認済み
  - **判明した互換性の注意点**: インストールされたNext.jsは**16.2.10**（学習データ時点より新しい）。`next/headers`の`cookies()`が**非同期関数**に変更されている（`await cookies()`が必須。Next.js 14以前は同期だった）。component-design.mdのコード例をこれに合わせて修正済み。新しい実験的機能「Cache Components」(`cacheComponents: true`)は未使用（デフォルト非有効）で、設計時に想定していた「`cookies()`使用時に自動的に動的レンダリングになる」という従来モデルのままで問題ない
  - create-next-appが自動生成した`todo-app/AGENTS.md`・`todo-app/CLAUDE.md`(`@AGENTS.md`をインポートするだけの1行)はそのまま残している。Next.jsのバージョン差異に関する正当な警告のため
- [x] `mcp__supabase__generate_typescript_types` でDatabase型を生成し `lib/supabase/types.ts` に反映
  - 想定通り、Database型には`task_todos`/`settings`に加え、無関係な既存`todos`テーブルも含まれる。ファイル冒頭のコメントで注意喚起済み
  - `npx tsc --noEmit` / `npm run lint` ともにクリーン
- [x] `lib/supabase/server.ts`（Service Role Keyクライアント）実装
  - `server-only`パッケージ（Vercel公式、React coreチームによるMITライセンスのマーカーパッケージ）を追加。誤ってClient Componentからimportされるとビルドエラーになる。追加前にnpmレジストリでライセンス・メンテナを確認済み
  - `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`が未設定ならモジュール読み込み時に即エラー（fail-fast）
  - Vitest単体テスト（`tests/unit/supabase-server.test.ts`）を追加
  - **判明した互換性の注意点**: `server-only`は"react-server"というNext.js RSCバンドラー専用のexport条件でのみno-opになる仕組みのため、Vitestでは常にthrowしてしまう。`tests/setup.ts`に`vi.mock("server-only", () => ({}))`を追加して対処（Next.js本番ビルドでの安全機構は影響を受けない、Vitest+Next.jsの定番パターン）
  - `npm run build` / `npm run lint` / `npm run test` すべてクリーン
- [ ] `lib/validation/rules.ts` 実装
- [ ] `lib/services/todo-service.ts` / `setting-service.ts` 実装 + Vitest単体テスト
- [ ] `lib/date-utils.ts`（`getLocalDateString()`）実装
- [ ] `actions/todo-actions.ts`（`createTodo`, `updateTodoStatus`, `initializeToday`）/ `setting-actions.ts`（`updateSettings`, `markStartNotificationSent`, `markEndNotificationSent`）実装
- [ ] `app/api/todos/route.ts` / `app/api/settings/route.ts` 実装（`?date=`クエリパラメータ対応）
- [ ] `components/*`（todo-form, todo-list, status-selector, settings-form, notification-manager）実装 + RTLコンポーネントテスト
- [ ] `app/page.tsx` / `app/settings/page.tsx` / `app/layout.tsx` 実装（`notification-manager`は`layout.tsx`にマウント、`local-date` Cookie同期とハイライト用Contextを提供）
- [ ] Playwright E2Eテスト（AC-2.x, AC-4.x の通知シナリオ、Chrome通知許可モック・システム時刻モック含む）
- [ ] 全体テスト実行（`npm run test`, `npm run test:e2e`）→ 最終レビュー

### 進め方

各ステップ: 実装 → `git diff`確認 → テスト実行 → （設計判断を伴う場合）目付け役レビュー → コミット、のサイクルで進める。既存の未コミット分（設計フェーズの成果一式）を最初のコミットとしてまとめ、以降は実装ステップごとに区切ってコミットする。

## 未解決・要フォローアップ事項

- 既存の無関係な`todos`テーブルのRLSポリシー（anon roleへの無制限アクセス許可）— 対応要否はユーザー判断待ち
