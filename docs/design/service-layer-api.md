# サービス層API設計書（todo-service / setting-service）

> Rev.2 — 目付け役レビュー（CONDITIONAL）の指摘を反映。「前提」節の設計判断はユーザー承認済み。差分は末尾「Rev.2での変更点」参照。

## 前提: Server Componentのデータ取得経路について（ユーザー承認済み）

CLAUDE.md 1.1の図は `[UI (Server/Client Components)] → [Server Actions/Route Handlers] → [サービス層] → [Supabaseデータアクセス層]` であり、依存方向図としては Server Component も Client Component と同じ「UI」レイヤーに含めている。一方、明文の禁止規定は「**Client Component**からSupabaseへの直接アクセス禁止」のみである。

Server ComponentはClientバンドルに含まれずService Role Keyを露出しないため、`app/page.tsx` 等のServer Componentは**サービス層(`lib/services`)を直接呼び出してよい**（Route Handlerを経由しない）こととする（Vercel公式ベストプラクティス`server-cache-react`が、DBアクセス等をServer Componentから直接呼ぶ方式を推奨しているため。ユーザー承認済み）。

- **Server Component**（`app/page.tsx`, `app/settings/page.tsx`）→ サービス層を直接呼び出す（自分自身のRoute Handlerを`fetch`しない）
- **Client Component**（`notification-manager.tsx`等のポーリング処理）→ 必ず `GET /api/todos` / `GET /api/settings`（Route Handler）を経由する
- **Client Componentからのミューテーション**（Todo登録・ステータス変更・設定変更・通知済みフラグ更新）→ 必ず `actions/*.ts`（Server Action）を経由する

Route Handler / Server Action のいずれも、内部ロジックはサービス層の関数をそのまま呼び出すだけの薄いラッパーとする（ビジネスロジックを書かない、CLAUDE.md 1.1）。

---

## 共通のレスポンス形式（CLAUDE.md 4.1）

```typescript
// types/index.ts
export type ActionResponse<T> =
  | { status: 'ok'; data: T }
  | { status: 'error'; message: string; errors?: { field: string; message: string }[] };
```

サービス層は3種類の例外を投げ分け、呼び出し側（`actions/*.ts` / `app/api/*/route.ts`）が3分岐でエンベロープに変換する:

```typescript
// lib/validation/rules.ts
export class ValidationError extends Error {
  constructor(public readonly errors: { field: string; message: string }[], message = 'Validation failed') {
    super(message);
  }
}

// lib/services/todo-service.ts（Todo関連の競合はここに置く。todo-service専用のため共通ファイルには置かない）
export class ConflictError extends Error {
  constructor(message = 'Conflict') {
    super(message);
  }
}
```

呼び出し側の変換ルール:

```typescript
try {
  const data = await someServiceFn(...);
  return { status: 'ok', data };
} catch (e) {
  if (e instanceof ValidationError) {
    return { status: 'error', message: '入力内容を確認してください', errors: e.errors };
  }
  if (e instanceof ConflictError) {
    console.error(e); // 1回リトライしても解消しなかった稀な事象。運用上の異常検知のためログに残す
    return { status: 'error', message: '他の操作により更新されています。最新の状態を確認してください' };
  }
  console.error(e); // 予期しない例外は握りつぶさずログに記録する(CLAUDE.md 3.1)
  return { status: 'error', message: '予期しないエラーが発生しました' };
}
```

---

## ドメイン型（`types/index.ts`）

```typescript
export type TodoStatus = 'unset' | 'not_started' | 'completed' | 'continuing';
// UIが選択肢として表示できるのはこのうち3つ(not_started/completed/continuing)のみ。'unset'は内部状態(spec.md 4章冒頭の用語定義)

export interface Todo {
  id: string;
  todoDate: string;        // YYYY-MM-DD
  content: string;
  status: TodoStatus;
  carriedOverFromId: string | null;
  createdAt: string;       // ISO 8601
  updatedAt: string;       // ISO 8601
}

export interface Settings {
  morningTime: string | null;   // HH:mm
  eveningTime: string | null;   // HH:mm
  weekendNotificationEnabled: boolean;
  lastCarryoverDate: string | null;      // YYYY-MM-DD
  lastStartNotifiedDate: string | null;  // YYYY-MM-DD
  lastEndNotifiedDate: string | null;    // YYYY-MM-DD
  updatedAt: string;
}
```

`YYYY-MM-DD` 形式の文字列を受け取るすべての関数（`getTodosByDate`, `createTodo`, `markStartNotificationSent`, `markEndNotificationSent`）は、共通ヘルパー `isValidDateString(date: string): boolean`（`lib/validation/rules.ts`、正規表現 `/^\d{4}-\d{2}-\d{2}$/` と実在日付チェック）で形式検証し、不正なら `ValidationError` を投げる（CLAUDE.md 4.2「日付文字列はYYYY-MM-DD形式のみ許可」を全関数で統一適用）。

---

## `lib/services/todo-service.ts`

| 関数 | シグネチャ | 用途・呼び出し元 |
|---|---|---|
| `getTodosByDate` | `(date: string) => Promise<Todo[]>` | 当日Todo一覧の単純取得。`GET /api/todos?date=`（Client Componentのポーリング）、および`initializeTodayTodos`内部から使用 |
| `initializeTodayTodos` | `(today: string) => Promise<Todo[]>` | **Server Component専用**。継続Todoの自動繰越→当日一覧取得を同期実行し、30日クリーンアップは`after()`で非同期実行する。`app/page.tsx`の初期表示時にのみ呼ぶ |
| `createTodo` | `(date: string, content: string) => Promise<Todo>` | `actions/todo-actions.ts` の `createTodo` Server Actionから呼ぶ |
| `updateTodoStatus` | `(id: string, status: Exclude<TodoStatus, 'unset'>) => Promise<Todo>` | `actions/todo-actions.ts` の `updateTodoStatus` Server Actionから呼ぶ |

### `getTodosByDate(date)`
- `isValidDateString(date)` チェック
- `task_todos` から `todo_date = date` の行を `todo_date, content, status, created_at` 等で取得（`select('*')`禁止）

### `initializeTodayTodos(today)`
1. `carryOverContinuingTodosIfNeeded(today)`（内部関数、同期）:
   - `settings.last_carryover_date === today` なら何もしない（多重実行防止、spec.md 6.2）
   - そうでなければ、`task_todos` から `todo_date < today` の最新日付（前回起動日）を1件特定し、その日付かつ `status = 'continuing'` の行を取得
   - 該当行ごとに `todo_date=today, content=同じ, status='unset', carried_over_from_id=元のid` で新規Todoを作成
   - `settings.last_carryover_date = today` に更新
2. Next.jsの `after()` で `cleanupOldTodos(today)`（`todo_date < today - 30日` を`task_todos`からDELETE）を**ページ応答後に非同期実行**する。表示内容に影響しないためレスポンスをブロックしない（spec.md 6.3の「アプリ起動時に自動的に削除する」は満たしつつ、応答速度を優先。Vercelベストプラクティス`server-after-nonblocking`の「Cleanup tasksは`after()`で」に整合）
3. `getTodosByDate(today)` を返す（繰越の反映を待つため、クリーンアップより前に実行してよい＝クリーンアップ非同期化の影響を受けない）

### `createTodo(date, content)`
- `isValidDateString(date)` チェック
- `content.trim()` が空文字 → `ValidationError([{field:'content', message:'Todoを入力してください'}])`（AC-1.5, AC-1.6）
- `content.trim().length > 50` → `ValidationError([{field:'content', message:'50文字以内で入力してください'}])`
- 検証OKなら `content = content.trim()` を保存し、`status='unset'` で1行INSERTして返す（AC-1.1〜1.3）

### `updateTodoStatus(id, status)`

- ランタイムガード: `status` に `'unset'` が渡された場合（`Exclude<TodoStatus,'unset'>`という型はコンパイル時のみの保護であり、Server Actionの境界を越えた実際の値は型消去されるため、ランタイムでも明示的に拒否する）→ `ValidationError`

CASの成否をアプリ側で判断させず、サービス層内で**最大1回の自動再試行**を行うことで異常系No.7（後勝ち）の典型シナリオ（同一タブでの連続操作）を大半解決する:

1. 対象行の現在の `updated_at` を取得
2. `UPDATE task_todos SET status = :status WHERE id = :id AND updated_at = :currentUpdatedAt RETURNING *` を実行
3. 更新0件（他の同時操作が先にDBへ書き込んでいた）の場合、**1回だけ**最新の `updated_at` を再取得して同じ`UPDATE`を再試行する（ユーザーが選んだ`status`をそのまま適用し直すだけなので、後から発生した操作の意図がそのまま反映される）
4. 再試行も0件だった場合（3者以上の同時競合、またはネットワーク層での要求到達順の逆転という極めて稀なケース）のみ `ConflictError` を投げる。厳密な到達順保証までは行わない点に注意

この設計により、`expectedUpdatedAt` を呼び出し元（Server Action・UI）に持たせる必要がなくなり、シグネチャは `(id, status)` のみで完結する。`ConflictError` は「1回の自動再試行でも解決しなかった」という稀な失敗のフォールバックとして扱う。

---

## `lib/services/setting-service.ts`

| 関数 | シグネチャ | 用途・呼び出し元 |
|---|---|---|
| `getSettings` | `() => Promise<Settings>` | `GET /api/settings`、および`app/settings/page.tsx`のServer Componentから直接 |
| `updateSettings` | `(input: { morningTime: string; eveningTime: string; weekendNotificationEnabled: boolean }) => Promise<Settings>` | `actions/setting-actions.ts` の `updateSettings` Server Actionから呼ぶ |
| `markStartNotificationSent` | `(date: string) => Promise<void>` | `actions/setting-actions.ts` の同名Server Actionから呼ぶ（notification-logic.md） |
| `markEndNotificationSent` | `(date: string) => Promise<void>` | 同上 |

### `getSettings()`
- `settings` テーブルの `id=1` の1行を取得して返す（シングルトン、db-schema.md）

### `updateSettings(input)`
- `morningTime` / `eveningTime` が空欄 → `ValidationError`（各フィールドに「時刻を入力してください」）
- `HH:mm` 形式でない → `ValidationError`
- `eveningTime <= morningTime` → `ValidationError([{field:'eveningTime', message:'就業終了時刻は就業開始時刻より後に設定してください'}])`（spec.md異常系No.6の文言をそのまま使用）
- 検証OKなら `UPDATE settings SET morning_time=..., evening_time=..., weekend_notification_enabled=... WHERE id=1 RETURNING *`

### `markStartNotificationSent(date)` / `markEndNotificationSent(date)`
- `isValidDateString(date)` チェック（他の日付引数関数と統一）
- `UPDATE settings SET last_start_notified_date = :date WHERE id = 1`（`last_end_notified_date`も同様）。冪等（同じ`date`で複数回呼ばれても副作用なし、notification-logic.md）

---

## リスク

1. **`initializeTodayTodos`をServer Componentから直接呼ぶ設計は、複数タブで同時に開かれた場合、繰越処理がそれぞれのタブのレンダリングごとに評価されうる**: `last_carryover_date`によるガードがあるため実際の重複INSERTは防げる。
2. **`updateTodoStatus`の1回リトライでも、理論上3者以上が同時に同一Todoを更新すると`ConflictError`が発生しうる**: 個人利用アプリでは極めて稀（異常系No.12で複数タブの同時操作自体スコープ外相当）だが、発生時はUIに汎用エラーメッセージが表示され、ユーザーが手動で再操作する必要がある。
3. **`getSettings`/`getTodosByDate`は`React.cache()`でラップしていない**: 単一ページ内で複数回呼ばれるケースは現状想定していない。将来的にコンポーネントツリーが複雑化した場合は重複呼び出しの検討が必要。
4. **「前提」節のServer Component直接呼び出しの解釈は、CLAUDE.md 1.1の依存方向図（UIを一つの上位レイヤーとして図示）と完全には一致しない拡大解釈である**: 明文の禁止規定（Client Component限定）には抵触しないと判断し、ユーザー承認済み。

## 代替案

1. **Server ComponentもRoute Handler経由でデータ取得する（CLAUDE.mdの図を文字通り解釈）**: レイヤーの一貫性は上がるが、同一サーバー内での不要なHTTP往復が発生し、Vercelのベストプラクティスにも反するため不採用（ユーザー確認済み、サービス層直接呼び出し案を採用）。
2. **`updateTodoStatus`の競合をCASでなく「常に最新書き込みを許可する」（Last Write Wins、DB制約なし）にする**: シンプルだが、異常系No.7の「古い操作が新しい操作を上書きしない」という要件を満たせないため不採用。
3. **`initializeTodayTodos`をServer Actionとして実装し、クライアント側から明示的に呼ぶ**: Server Componentから直接呼ぶより一貫性はあるが、初期表示のたびにクライアント→サーバーの追加ラウンドトリップが発生し、SSRの利点を損なうため不採用。
4. **`updateTodoStatus`のCAS失敗時に呼び出し元へ`expectedUpdatedAt`を持たせ、UI側で再試行させる（Rev.1の設計）**: UIが最新状態を明示的に見せた上で再試行させられる利点はあるが、単一ユーザー・低頻度操作のアプリに対して複雑さが見合わず、かつ「範囲外」と言いつつ「解決策」と言い切る矛盾を生んだため不採用。サービス層内の1回自動リトライ（採用案）で大半のケースを透過的に解決する。

## 制約準拠

- CLAUDE.md 1.1: Client ComponentからのSupabase直接アクセス禁止を厳守。Server Componentのサービス層直接呼び出しの解釈は要ユーザー承認（リスク4）
- CLAUDE.md 3.1: `select('*')`禁止（必要カラムのみ指定）、空catch禁止（3分岐のエラーハンドリングとログ記録を明記）
- CLAUDE.md 4.1: レスポンス形式を`ActionResponse<T>`として統一（`ValidationError`/`ConflictError`/その他の3分岐変換）
- CLAUDE.md 4.2: `YYYY-MM-DD`形式のバリデーションを日付引数を取るすべての関数に統一適用
- CLAUDE.md 4.3: バリデーションルール（content最大50文字、時刻相関チェック等）をそのままサービス層の実装根拠として反映
- db-schema.md: `carried_over_from_id`, 楽観的CAS(`updated_at`), `last_carryover_date`等の列設計をそのままサービス層のロジックに対応させた
- notification-logic.md: `markStartNotificationSent`/`markEndNotificationSent`のインターフェース、`?date=`によるクライアントローカル日付の受け渡し原則を踏襲
- spec.md AC-1.x, AC-3.x, 異常系No.6, No.7: 上記バリデーション・CAS+自動リトライロジックの直接の根拠

---

## Rev.2での変更点（目付け役レビュー対応）

| 指摘 | 対応 |
|---|---|
| Server Component直接呼び出しの解釈が「決定済み」として扱われ、ユーザー承認の明記がない | 冒頭に要承認である旨を明記し、リスク4・代替案1で承認待ちの選択肢を残した |
| `initializeTodayTodos`のクリーンアップが同期実行でVercelベストプラクティス(`server-after-nonblocking`)と整合しない | クリーンアップのみ`after()`で非同期化。繰越処理は表示に影響するため同期のまま維持 |
| CASだけでは異常系No.7を完結できず、「解決策」との記述とスコープ外扱いが矛盾 | サービス層内で1回の自動リトライを実装し、`expectedUpdatedAt`を呼び出し元から排除。大半のケースをエラーなしで解決 |
| 共通エラーハンドリング(2分岐)と`ConflictError`専用メッセージ(実質3分岐目)が矛盾 | 共通レスポンス形式節を3分岐（ValidationError/ConflictError/その他）に明記し直した |
| 予期しない例外を汎用メッセージに変換する際のログ記録が未記載 | `console.error(e)`を明記 |
| `ConflictError`の配置ファイルが未指定 | `lib/services/todo-service.ts`内に配置すると明記 |
| `markXNotificationSent`の`date`だけバリデーション省略の根拠が薄い | 共通ヘルパー`isValidDateString`を全日付引数関数に統一適用 |
| `getTodosByDate`の`date`バリデーション未記載 | 同上のヘルパーで統一 |
