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

## 今後の実装計画

### 設計フェーズ（残り）

- [ ] サービス層API設計書 — `todo-service.ts` / `setting-service.ts` の関数シグネチャ・バリデーションフロー・レスポンス形式（目付け役レビュー）
- [ ] 画面/コンポーネント設計書 — `page.tsx` / `todo-form.tsx` 等の役割分担、Server/Client Componentの境界線（目付け役レビュー）

### 実装フェーズ（CLAUDE.md 6章の段階制御ルールに従い1ステップずつ）

- [ ] Next.jsプロジェクトのscaffold作成（`create-next-app`、TypeScript、依存関係: supabase-js, Vitest, React Testing Library, Playwright等）
- [ ] `mcp__supabase__generate_typescript_types` でDatabase型を生成し `lib/supabase/types.ts` に反映
- [ ] `lib/supabase/server.ts`（Service Role Keyクライアント）実装
- [ ] `lib/validation/rules.ts` 実装
- [ ] `lib/services/todo-service.ts` / `setting-service.ts` 実装 + Vitest単体テスト
- [ ] `actions/todo-actions.ts` / `setting-actions.ts`（`markStartNotificationSent`/`markEndNotificationSent`含む）実装
- [ ] `app/api/todos/route.ts` / `app/api/settings/route.ts` 実装（`?date=`クエリパラメータ対応）
- [ ] `components/*`（todo-form, todo-list, status-selector, settings-form, notification-manager）実装 + RTLコンポーネントテスト
- [ ] `app/page.tsx` / `app/settings/page.tsx` / `app/layout.tsx` 実装（`notification-manager`は`layout.tsx`にマウント）
- [ ] Playwright E2Eテスト（AC-2.x, AC-4.x の通知シナリオ、Chrome通知許可モック・システム時刻モック含む）
- [ ] 全体テスト実行（`npm run test`, `npm run test:e2e`）→ 最終レビュー

### 進め方

各ステップ: 実装 → `git diff`確認 → テスト実行 → （設計判断を伴う場合）目付け役レビュー → コミット、のサイクルで進める。既存の未コミット分（設計フェーズの成果一式）を最初のコミットとしてまとめ、以降は実装ステップごとに区切ってコミットする。

## 未解決・要フォローアップ事項

- 既存の無関係な`todos`テーブルのRLSポリシー（anon roleへの無制限アクセス許可）— 対応要否はユーザー判断待ち
