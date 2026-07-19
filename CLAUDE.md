# CLAUDE.md — 設計フェーズの制約ファイル（Todo管理Webアプリ / Next.js + Supabase）

> 就業Todo管理Webアプリ（`docs/spec.md` / `docs/requirements.md` 参照）の実装で使用する制約。
> エージェントはコードを書く前にこのファイルを必ず読み、すべての制約に従うこと。
> 本ファイルは spec.md の内容を正とし、spec.md と矛盾する記述はない前提で書かれている。
> ただし spec.md 6.3「ローカル(localStorage)のみで保存し、サーバー・外部DBへの送信は行わない」は、
> 本ファイルの永続化方針(Supabase利用)と矛盾したまま残っている。解消するには spec.md 側の更新が必要。

---

## 0. 前提条件 / Supabase MCP セットアップ

Supabase上のテーブル作成・マイグレーション適用・データ確認などの操作は、**Supabase公式MCPサーバー経由**で行う。

セットアップ手順:

1. Supabaseダッシュボードで Personal Access Token を発行する(ユーザー作業)。
2. リポジトリ直下の `.mcp.json` に `supabase` サーバーが登録済み(雛形あり)。`--project-ref` を実際のプロジェクトrefに置き換える。
3. トークンはコマンドライン引数や `.mcp.json` に直接書き込まない。環境変数 `SUPABASE_ACCESS_TOKEN` をユーザー自身のシェル/`.env`(gitignore対象)で設定する。
4. 設定後 Claude Code を再起動し、`mcp__supabase__*` 系ツールが利用可能になっていることを確認する。
5. MCP経由でテーブルを作成する場合も、適用したSQLは必ず `supabase/migrations/*.sql` としてリポジトリに保存し、レビュー可能な形にする(3.2の「一括生成禁止」原則との整合)。

> **⚠️ 既存の `todos` テーブルについて**: 接続先のSupabaseプロジェクトには、本アプリと無関係な既存テーブル `todos`(列: `id`, `text`, `done`, `created_at`)が既に存在する(以前の手動テストによるもの)。**本アプリのコード・マイグレーションから `todos` テーブルを参照・変更してはならない**。本アプリのTodoデータは必ず `task_todos` テーブルを使用すること。`generate_typescript_types` で生成されるDatabase型には両方のテーブルが含まれるため、テーブル名の指定を誤らないよう注意する。

---

## 1. アーキテクチャ制約

### 1.1 レイヤー構成と依存方向

```
[UI (Server Components / Client Components)] → [Server Actions / Route Handlers] → [サービス層 (lib/services)] → [Supabaseデータアクセス層 (lib/supabase)]
```

- 依存は **上から下への一方向のみ** 許可する
- Client Component から Supabase に直接アクセスしてはならない(anon keyの直接利用は禁止)。データの読み書きは必ず Server Actions / Route Handlers を経由する
- Server Actions / Route Handlers にビジネスロジックを書いてはならない。ロジックはサービス層(`lib/services`)に置く
- Supabaseの Service Role Key はサーバー専用モジュール(`lib/supabase/server.ts`)でのみ読み込み、`NEXT_PUBLIC_` プレフィックスの環境変数として扱ってはならない(クライアントバンドルに露出させない)

### 1.2 ディレクトリ構成

```
todo-app/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                  # トップ / Todo入力・一覧
│   ├── settings/
│   │   └── page.tsx              # 設定画面
│   └── api/
│       ├── todos/
│       │   └── route.ts          # GET: 当日Todo一覧(通知判定ポーリング用)
│       └── settings/
│           └── route.ts          # GET: 設定取得(通知判定ポーリング用)
├── actions/
│   ├── todo-actions.ts           # Server Actions: createTodo, updateTodoStatus
│   └── setting-actions.ts        # Server Actions: updateSettings
├── components/
│   ├── todo-form.tsx
│   ├── todo-list.tsx
│   ├── status-selector.tsx
│   ├── settings-form.tsx
│   └── notification-manager.tsx  # クライアント側: 時刻判定・Notification API発火
├── lib/
│   ├── services/
│   │   ├── todo-service.ts       # Todoの業務ロジック・バリデーション
│   │   └── setting-service.ts    # 設定の業務ロジック・バリデーション
│   ├── supabase/
│   │   ├── server.ts             # サーバー専用Supabaseクライアント(Service Role Key)
│   │   └── types.ts              # Supabase生成型(Database型)
│   └── validation/
│       └── rules.ts              # バリデーションルール定数
├── types/
│   └── index.ts                  # Todo, Setting等のドメイン型
├── supabase/
│   └── migrations/
│       └── 0001_init.sql         # task_todos, settings テーブル定義
├── tests/
│   ├── unit/                     # Vitest: service層・validation
│   ├── component/                # Vitest + React Testing Library
│   └── e2e/                      # Playwright: 通知シナリオ等
├── .env.local.example
├── package.json
├── tsconfig.json
└── next.config.ts
```

この構成を勝手に変更してはならない。新しいファイルを追加する場合は計画を提示し、承認を得ること。

---

## 2. 命名規約

| 対象                          | 規約                             | 例                                                |
| ----------------------------- | -------------------------------- | ------------------------------------------------- |
| TS/TSX ファイル               | kebab-case                       | `todo-service.ts`, `todo-form.tsx`                |
| React コンポーネント名        | PascalCase                       | `TodoForm`, `StatusSelector`                      |
| 変数・関数                    | camelCase                        | `getTodayTodos()`                                 |
| 型・インターフェース          | PascalCase                       | `Todo`, `Setting`                                 |
| Supabase テーブル名           | 複数形 snake_case                | `task_todos`, `settings`                          |
| API エンドポイント(Route Handler) | REST 準拠、複数形            | `/api/todos`, `/api/settings`                     |
| Server Action 関数            | 動詞から始まる camelCase         | `createTodo()`, `updateTodoStatus()`              |
| CSS クラス                    | kebab-case                       | `.todo-item`, `.status-badge`                     |
| テストファイル(Vitest)        | `*.test.ts` / `*.test.tsx`       | `todo-service.test.ts`                            |
| テストファイル(Playwright)    | `*.spec.ts`                      | `notification.spec.ts`                            |
| テスト関数・describe          | 対象 + 条件 + 期待結果を明記     | `"空文字でTodoを登録するとエラーになる"`          |

---

## 3. 禁止パターン（やってはいけないこと）

### 3.1 コード上の禁止

- **Service Role Key のクライアント露出禁止** — `NEXT_PUBLIC_` プレフィックスを付けない。読み込みは `lib/supabase/server.ts` に限定する
- **`select('*')` 禁止** — 必要なカラムを明示的に指定する
- **空の `catch` / エラーの握りつぶし禁止** — 具体的な例外を捕捉し、ログに記録する
- **Client Component / Route Handler での直接 Supabase クエリ実行禁止** — 必ずサービス層(`lib/services`)を経由する
- **`eval()` / `new Function()` の使用禁止**
- **SQL 文字列の組み立て禁止** — Supabase のクエリビルダー、またはパラメータ化された RPC のみを使用する
- **`any` 型の使用禁止** — 型が不明な場合は `unknown` + 型ガードを使う

### 3.2 設計上の禁止

- **仕様書（spec.md）に書かれていない機能の追加禁止** — スコープ外の機能を勝手に実装しない
- **Phase 2 の機能を先取り実装しない** — 認証、複数ユーザー管理、通知チャネルの追加、スヌーズ、分析・レポーティング、モバイルネイティブ対応は対象外(spec.md 3.2)
- **一括生成禁止** — 全ファイルを一度に生成せず、1ステップずつ計画→承認→実装する
- **テストなしのコミット禁止** — 各機能に対応するテストを同時に書く

### 3.3 UI 上の禁止

- **外部 CDN からの直接 `<script>` 読み込み禁止** — 依存ライブラリは npm 経由で追加し、追加時は計画を提示して承認を得る
- **不要な状態管理ライブラリの安易な追加禁止** — React 標準機能(`useState`, Server Components, Server Actions)で完結できる範囲は素直にそれを使う
- **inline style の使用禁止** — CSS Modules または CSS ファイルに分離する

---

## 4. 型・スキーマ制約

### 4.1 API / Server Action レスポンス形式

すべての Server Action・Route Handler は以下の JSON 構造に従う:

```json
// 成功時
{
  "status": "ok",
  "data": { ... }
}

// エラー時
{
  "status": "error",
  "message": "人間が読めるエラーメッセージ",
  "errors": [
    {"field": "todoText", "message": "50文字以内で入力してください"}
  ]
}
```

この形式以外のレスポンスを返してはならない。

### 4.2 日付・時刻の扱い

- 日付文字列は `YYYY-MM-DD` 形式のみ許可
- 「当日」の判定基準: 端末のブラウザのローカル日付(0:00〜23:59)を基準とする(spec.md 1.1)。特殊な時刻境界(前日扱い等)は設けない
- 就業開始/終了時刻との比較は分単位(`HH:mm`)で行う

### 4.3 バリデーションルール

| フィールド                       | 制約                                                         |
| -------------------------------- | -------------------------------------------------------------|
| Todo テキスト                    | 最大 **50文字**、空文字・空白のみ不可(spec.md AC-1.5, AC-1.6) |
| status                           | ユーザーが選択可能なのは「未着手」「完了」「継続」の3値のみ。「未設定」は登録直後の内部状態でUIの選択肢には出さない |
| `morning_time` / `evening_time`  | `HH:mm` 形式、空欄保存不可(spec.md 6.1)                       |
| 時刻の相関チェック                | `evening_time` は `morning_time` より後であること。違反時はエラーメッセージ「就業終了時刻は就業開始時刻より後に設定してください」(spec.md 異常系No.6) |
| 週末通知トグル                    | boolean。デフォルト無効(土日は通知しない)、有効時は土日も通知対象(spec.md 6.4) |

---

## 5. テスト制約

- 単体テスト: **Vitest** で `lib/services` 配下のロジック・バリデーションを検証する
- コンポーネントテスト: **Vitest + React Testing Library**
- E2Eテスト: **Playwright** で、Chrome通知許可状態のモック、システム時刻のモック、通知クリック時のタブフォーカス確認など、spec.md 4.2/4.4系のシナリオ(AC-2.x, AC-4.x)を検証する
- spec.md の各受け入れ基準(AC-1.x 〜 AC-4.x)に対応するテストを必ず書く
- テストには Supabase のテスト専用プロジェクト、または Supabase CLI のローカル環境(`supabase start`)を使用し、本番プロジェクトのデータを汚染しない
- `npm run test`(Vitest)・`npm run test:e2e`(Playwright)の両方が全件パスすること

---

## 6. 段階制御ルール（ブラックボックス防止）

エージェントは以下の手順を厳守すること:

1. **計画を提示する** — 実装前にファイル単位の変更計画を箇条書きで提示する。コードはまだ書かない
2. **承認を得る** — 人間が計画を確認し、承認してから次に進む
3. **1ステップずつ実装する** — 承認された計画の1項目だけを実装する
4. **差分を確認する** — 各ステップの `git diff` をレビュー可能なサイズに保つ
5. **テストを実行する** — 各ステップで既存テストが壊れていないことを確認する
6. **理由を説明する** — 設計判断のたびに「なぜそうしたか」を1文で説明する

---

## 7. 設計レビュープロセス

設計案を出す際は、以下を含めること:

- **リスク**: この設計の弱点・壊れうるポイントを最低1つ
- **代替案**: 別のアプローチを最低1つ（なぜ採用しなかったかの理由付き）
- **制約準拠**: このファイルのどの制約に基づいて判断したかの参照

設計レビューは **目付け役エージェント**(`.claude/metsukeyaku.md`)に依頼し、矛盾・見落としの指摘を受けること。
