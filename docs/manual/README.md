# 就業Todo管理アプリ — 起動・運用手順書

このアプリの実体は `todo-app/`（Next.js + Supabase）。本書は初回セットアップから日常的な起動・テスト方法までをまとめたものです。仕様は `docs/spec.md`、設計判断は `docs/design/`、実装の経緯・既知の課題は `docs/implementation-plan.md` を参照してください。

## 1. 前提条件

- Node.js（本プロジェクトは v24系で動作確認済み）
- npm
- Supabaseプロジェクト（作成済みで、`task_todos` / `settings` テーブルのマイグレーションが適用済みであること。未適用の場合は「5. マイグレーションの適用」を参照）

## 2. 初回セットアップ

```bash
cd todo-app
npm install
```

### 2.1 Supabase接続情報の設定

`.env.local.example` を `.env.local` にコピーし、実際の値を設定します。

```bash
cp .env.local.example .env.local
```

`.env.local` の中身:

```
SUPABASE_URL=https://<プロジェクトref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<Service Role Key>
```

- `SUPABASE_URL` はSupabaseダッシュボードの Project Settings > API で確認できます。
- `SUPABASE_SERVICE_ROLE_KEY` も同じ画面から取得します（**秘密情報です。第三者と共有したり、リポジトリにコミットしたりしないでください**。`.gitignore` で `.env.local` 自体は除外済みです）。

`.env.local` が無い、または値が空のままだと `npm run dev` / `npm run build` はいずれもアプリ起動時に即座にエラーになります（`lib/supabase/server.ts` のfail-fast検証、意図的な挙動です）。

### 2.2（Claude Code等でDB操作を行う開発者向け）Supabase MCPサーバーの設定

アプリを起動するだけなら本節は不要です。Claude Code等のエージェント経由でテーブル作成・マイグレーション適用などのDB操作を行いたい場合のみ必要です。

1. Supabaseダッシュボードで Personal Access Token を発行する
2. リポジトリ直下の `.mcp.json` の `--project-ref` を実際のプロジェクトrefに置き換える（雛形は登録済み）
3. 環境変数 `SUPABASE_ACCESS_TOKEN` を自分のシェルに設定する（`.mcp.json` やコマンドライン引数に直接書き込まない）
4. Claude Codeを再起動し、`mcp__supabase__*` 系ツールが使えることを確認する

詳細は `CLAUDE.md` の「0. 前提条件 / Supabase MCP セットアップ」を参照してください。

## 3. 開発サーバーの起動

```bash
cd todo-app
npm run dev
```

`http://localhost:3000` にアクセスします。就業開始/終了時刻のTodo管理・設定画面が使えます。

- 初回アクセス時、ブラウザから通知許可のリクエストダイアログが表示されます（許可すると就業開始/終了通知が届くようになります）。
- 通知はタブ（またはブラウザ）を開いている間のみ判定・送信されます（常駐サービスではありません）。

## 4. テストの実行

### 4.1 単体・コンポーネントテスト（Vitest）

```bash
npm run test        # 1回実行
npm run test:watch  # watchモード
```

Supabaseへの実接続は行わず、インメモリのFakeクライアントでサービス層のロジックを検証します。`.env.local` が無くてもダミー値で動作します。

### 4.2 E2Eテスト（Playwright）

```bash
npx playwright install chromium   # 初回のみ、ブラウザ本体の取得
npm run test:e2e
```

- **実際のSupabaseプロジェクトに接続します**（`.env.local` が必須）。テストは実行前後に自身が作成したデータ（`settings`の一時的な上書き、`task_todos`のテスト用データ）を自動でクリーンアップします。
- テスト用の日付は「実行時点の翌日」を動的に使用し、既存の実データに影響しないよう設計されています。
- `npm run dev` を別途起動しておく必要はありません（Playwrightが自動でdevサーバーを起動します）。

## 5. 本番ビルドの確認（ローカル）

```bash
npm run build
npm run start
```

`npm run build` は実際にSupabaseへ接続します（`/settings` ページなど一部が静的生成時にデータ取得を行うため）。

本番デプロイ（Vercel等）の設定は本書執筆時点で未着手です。デプロイする場合は、デプロイ先にも `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` を環境変数として設定してください。

## 6. マイグレーションの適用（新しいSupabaseプロジェクトを使う場合）

`todo-app/supabase/migrations/` 配下のSQLを、Supabase MCP（`mcp__supabase__apply_migration`）またはSupabase DashboardのSQL Editorで、ファイル名の順番通りに適用してください。

- `0001_init.sql` — `task_todos` / `settings` テーブル本体
- `0002_add_carried_over_from_id_index.sql` — 自己参照外部キーのインデックス追加

適用後、`mcp__supabase__generate_typescript_types` で生成される型と `todo-app/lib/supabase/types.ts` の内容が一致していることを確認してください（スキーマを変更した場合は再生成が必要です）。

## 7. よくあるトラブル

| 症状 | 原因・対処 |
|---|---|
| `npm run dev` / `npm run build` が `SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set` で即座に落ちる | `.env.local` が無い、または値が空。「2.1」を参照して設定する |
| `npm run test:e2e` がタイムアウトする | `.env.local` が無い、またはSupabaseプロジェクトに到達できない。実ネットワーク接続とSupabaseプロジェクトの状態を確認する |
| Todo一覧が空に見える／期待したTodoが出ない | 「当日」はブラウザのローカル日付を基準にしている。端末の時刻・タイムゾーン設定を確認する（spec.md 異常系No.10はスコープ外と明記） |
| ブラウザの通知が来ない | OS/ブラウザの通知許可設定を確認する。タブを閉じている間は判定自体が行われない仕様（spec.md 1.1） |

## 8. 関連ドキュメント

- `docs/spec.md` — 機能仕様・受入基準
- `docs/design/` — 各設計書（DBスキーマ、通知ロジック、サービス層API、画面/コンポーネント）
- `docs/implementation-plan.md` — 実装の進捗・経緯・既知の課題
- `CLAUDE.md` — 実装時の制約ファイル（アーキテクチャ・命名規約・禁止パターン等）
