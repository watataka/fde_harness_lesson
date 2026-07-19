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
- [x] `types/index.ts`（`TodoStatus`, `Todo`, `Settings`, `ActionResponse<T>`）を先行実装（`lib/validation/rules.ts`が`TodoStatus`に依存するため）
- [x] `lib/validation/rules.ts` 実装
  - `ValidationError`クラス、`isValidDateString`/`isValidTimeString`、`validateDateString`/`validateTodoContent`/`validateTodoStatus`/`validateSettingsTimes`
  - spec.md AC-1.5, AC-1.6, 異常系No.6（同時刻を含む前後関係チェック）、CLAUDE.md 4.2/4.3のバリデーションルールをそのまま反映
  - Vitest単体テスト34件（`tests/unit/validation-rules.test.ts`）追加、全件パス
  - `npm run build` / `npm run lint` / `npx tsc --noEmit` すべてクリーン
- [x] `lib/services/todo-service.ts` / `setting-service.ts` 実装 + Vitest単体テスト
  - todo-service: `getTodosByDate`, `createTodo`, `updateTodoStatus`（CAS+1回自動リトライ、`ConflictError`）, `initializeTodayTodos`（繰越は同期、30日クリーンアップは`after()`で非同期）を実装
  - setting-service: `getSettings`, `updateSettings`, `markStartNotificationSent`, `markEndNotificationSent`を実装
  - **テスト戦略の判断**: CLAUDE.md 5「テストにはSupabaseのテスト専用プロジェクト、またはローカル環境(`supabase start`)を使用する」に対し、Supabase CLI/Docker環境が未整備なため、今回の単体テストは`tests/unit/helpers/fake-supabase-client.ts`（このテストスイート専用のインメモリFake、eq/lt/order/limit/single/maybeSingle・updated_atトリガー相当の挙動を再現）を用いてサービス層のロジックを検証する方式にした。実データベースに対する結合テストは今後のPlaywright E2Eステップで扱う（要検討事項として残す）
  - 単体テスト20件追加（todo-service 12件、setting-service 8件）、既存と合わせ計54件全件パス
  - `server-only`と同様、`next/server`の`after()`もテスト実行環境では意味を持たないため`tests/*.test.ts`内でモック（呼び出しを配列に記録し、テスト側で明示的にflushする）
  - `npm run build` / `npm run lint` / `npx tsc --noEmit` すべてクリーン
- [x] `lib/date-utils.ts`（`getLocalDateString()`）実装
  - ブラウザのローカルタイムゾーンでYYYY-MM-DD形式に変換（UTC変換はしない）
  - Vitest単体テスト4件（`vi.setSystemTime`で引数省略時の挙動も検証）追加、計58件全件パス
  - `npm run build` / `npm run lint` / `npx tsc --noEmit` すべてクリーン
- [x] `actions/todo-actions.ts`（`createTodo`, `updateTodoStatus`, `initializeToday`）/ `setting-actions.ts`（`updateSettings`, `markStartNotificationSent`, `markEndNotificationSent`）実装
  - サービス層の例外を`ActionResponse`の3分岐（ValidationError/ConflictError/その他）に変換する薄いラッパーとして実装（service-layer-api.md）
  - `updateTodoStatus`は成功時・`ConflictError`時（DBが他の操作で実際に変わっているため）に`revalidatePath('/')`を呼ぶが、`ValidationError`時は呼ばない（DBに触れていないため）。この使い分けをテストで明示的に検証
  - `markStartNotificationSent`/`markEndNotificationSent`は画面表示に直接影響しないため`revalidatePath`を呼ばない
  - サービス層をモックした単体テスト13件を追加、計71件全件パス
  - `npm run build`で`'use server'`ディレクティブがNext.js実ビルド上でも問題なくコンパイルされることを確認
  - `npm run build` / `npm run lint` / `npx tsc --noEmit` すべてクリーン
- [x] `app/api/todos/route.ts` / `app/api/settings/route.ts` 実装（`?date=`クエリパラメータ対応）
  - Client Componentのポーリング専用の読み取り専用薄いラッパー（CLAUDE.md 1.1）
  - `/api/todos`は`date`クエリパラメータ必須（欠落は400、不正形式のValidationErrorも400、その他エラーは500）
  - サービス層をモックした単体テスト6件を追加、計77件全件パス
  - `npx tsc --noEmit` / `npm run lint` はクリーン
  - `.env.local`をユーザーが設定後、`npm run build`成功を確認。さらに`npm run dev`を起動し実際のSupabaseに対して`GET /api/settings`（マイグレーション時のデフォルト値09:00/18:00を正しく返す）・`GET /api/todos?date=`（空配列を正しく返す）・`GET /api/todos`（dateなしで400）をcurlでスモークテスト済み
- [x] `components/*`（todo-form, todo-list, status-selector, settings-form, notification-manager）実装 + RTLコンポーネントテスト
  - `todo-form.tsx`（Client）: 入力・登録、バリデーションエラー表示、送信中の無効化
  - `todo-list.tsx`（Server）: `todos`をpropsで受け取り`StatusSelector`を並べるだけの純粋な表示コンポーネント
  - `status-selector.tsx`（Client）: 3値ボタン、`useHighlight()`によるAC-4.4強調表示
  - `settings-form.tsx`（Client）: 時刻2つ＋週末トグル、異常系No.6のフィールド別エラー表示
  - `notification-manager.tsx`（Client）: ポーリング・プッシュ通知・状態バナー・`local-date` Cookie同期・`initializeToday`呼び出し・ハイライトContext提供。判定ロジック（`shouldFireStartNotification`等）は純粋関数としてモジュールレベルでexportし、単体テストで個別に検証できるようにした
  - notification-managerの`Notification.permission`初期値取得は、エフェクト内での同期`setState`を避けるため`useState`の遅延初期化関数に変更（新しいeslintルール`react-hooks/set-state-in-effect`対応）
  - **判明した互換性の注意点**: `notification-manager.tsx`は`actions/*`→`lib/services/*`→`lib/supabase/server.ts`を連鎖的にimportするため、これを読み込むテストではVitestが`.env.local`を読まず環境変数未設定でthrowする。`tests/setup.ts`にダミーのSUPABASE_URL/SERVICE_ROLE_KEYをフォールバック設定して解決
  - コンポーネントテストで`vi.useFakeTimers()`を素朴に使うと、React Testing Libraryの`waitFor`/`findBy`が内部で使うタイマーまで止まりタイムアウトする。`{ toFake: ["Date"] }`でDateのみ偽装するよう修正
  - 単体テスト(notification-manager純粋関数)25件＋コンポーネントテスト20件を追加、計119件全件パス
  - `npm run build` / `npm run lint` / `npx tsc --noEmit` すべてクリーン
- [x] `app/page.tsx` / `app/settings/page.tsx` / `app/layout.tsx` 実装
  - `app/layout.tsx`: `<NotificationManager>{children}</NotificationManager>`でラップ
  - `app/page.tsx`: `local-date` Cookie（`LOCAL_DATE_COOKIE`定数を再利用。後日`lib/date-utils.ts`に移設、後述のE2Eテストで判明したバグ参照）から`today`を取得し、`getTodosByDate`（読み取り専用）のみ呼ぶ
  - `app/settings/page.tsx`: `getSettings`を直接呼ぶ
  - create-next-appのボイラープレート（`page.tsx`, `page.module.css`）を全面置き換え
  - `npm run build`で`/`が動的（`cookies()`使用のため）、`/settings`が静的（`revalidatePath`で更新時に再検証される）とビルド出力で確認
  - `npm run dev` + ブラウザで実際に動作確認: Todo登録→一覧反映→ステータス変更（完了に強調表示）→設定画面表示、実際のSupabaseに対してconsoleエラーなしで一連の操作が成功。確認用に作成したテストTodoはSupabase MCP経由で削除済み
  - `npm run build` / `npm run lint` / `npx tsc --noEmit` すべてクリーン
- [x] Playwright E2Eテスト（AC-2.x, AC-4.x の通知シナリオ、Chrome通知許可モック・システム時刻モック含む）
  - **データ層の方針（ユーザー承認済み）**: 実際のSupabaseプロジェクトに対して実行し、テスト後に自動クリーンアップする方式を採用（Supabase CLIローカル環境は今回構築しない、要フォローアップとして継続）
  - `tests/e2e/helpers/supabase-test-client.ts`: Service Role Keyで直接Supabaseに接続し、`settings`のセットアップ・復元、`task_todos`のシード・クリーンアップを行うヘルパー
  - `tests/e2e/helpers/notification-mock.ts`: `page.addInitScript()`で`window.Notification`をモックに差し替え、実OS通知を出さずにタイトル・本文・onclickハンドラを記録する
  - `page.clock.setFixedTime()`（Dateのみ固定、setTimeout/setIntervalは実時間のまま動く）でシステム時刻をモック
  - AC-2.1/2.8, AC-2.5, AC-2.7, AC-4.1/4.6, AC-4.2, AC-4.3, AC-4.4 の7シナリオを実装、全件パス
  - **実装中に2件の重大な不具合を発見・修正**（いずれも実運用にも影響しうる本物のバグだった）:
    1. **危険: 30日クリーンアップによるデータ全消失リスク**: `TEST_DATE`に遠い未来の日付(2099年)を使ったところ、`initializeTodayTodos`内の30日クリーンアップの`cutoff`(today-30日)も2099年になり、**実際の全データが「30日より古い」と誤判定され削除されうる状態**だった(今回は他に実データが無かったため実害なし、実行前に発見)。`TEST_DATE`を「実際の明日」に変更し、`last_carryover_date`をテスト日付に事前セットして繰越スキャンが実データに触れないようにして解決
    2. **`LOCAL_DATE_COOKIE`定数を`"use client"`ファイルからexportしていたバグ**: `notification-manager.tsx`(`"use client"`)からexportした定数を`app/page.tsx`(Server Component)でimportすると、文字列ではなくクライアント参照として扱われ、`cookieStore.get(LOCAL_DATE_COOKIE)`が常に`undefined`を返していた。結果、SSR初期表示が常にサーバーの実日付にフォールバックし続け、**当日のTodo一覧が実際には正しく表示されないことがある**という実ユーザーにも影響しうるバグだった。定数を`"use client"`を持たない`lib/date-utils.ts`に移設して解決。E2Eテストで実際にブラウザ+実DBを通したことで初めて発覚した(Vitestの単体/コンポーネントテストではSupabase/Cookieを全てモックしていたため検出できなかった)
  - `npm run test` (119件) / `npm run test:e2e` (7件) / `npm run build` / `npm run lint` / `npx tsc --noEmit` すべてクリーン。Supabase上のテストデータ・設定値はクリーンアップ済みを確認
- [ ] 全体テスト実行（`npm run test`, `npm run test:e2e`）→ 最終レビュー

### 進め方

各ステップ: 実装 → `git diff`確認 → テスト実行 → （設計判断を伴う場合）目付け役レビュー → コミット、のサイクルで進める。既存の未コミット分（設計フェーズの成果一式）を最初のコミットとしてまとめ、以降は実装ステップごとに区切ってコミットする。

## 未解決・要フォローアップ事項

- 既存の無関係な`todos`テーブルのRLSポリシー（anon roleへの無制限アクセス許可）— 対応要否はユーザー判断待ち
- `lib/services`の単体テストはインメモリFakeで実施しており、実際のSupabase(PostgreSQL)に対する結合テストは未実施。Playwright E2Eステップで実データベースに対する検証を行うか、別途Supabase CLIのローカル環境を整備するか要検討
- ~~`.env.local`が未作成~~ → ユーザーが設定済み。`npm run build`成功、`/api/settings`・`/api/todos`の実Supabaseに対するスモークテスト済み
