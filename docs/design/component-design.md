# 画面/コンポーネント設計書

> Rev.3 — 目付け役レビュー（Rev.1: REJECT → Rev.2: REJECT）の指摘を反映。差分は末尾「Rev.3での変更点」参照。

## 前提: Server/Client Componentの境界と再描画方式

- **Server Component**: `app/page.tsx`, `app/settings/page.tsx`, `components/todo-list.tsx`。データ取得はservice-layer-api.mdの決定通り、サービス層を直接呼び出す（Route Handlerを経由しない）。**読み取り専用**（`getTodosByDate` / `getSettings`）に限定し、書き込みを伴う処理は一切呼ばない（下記参照）。
- **Client Component**: `components/todo-form.tsx`, `components/status-selector.tsx`, `components/settings-form.tsx`, `components/notification-manager.tsx`。ミューテーションは必ずServer Action（`actions/*.ts`）を呼ぶ。
- **再描画方式**: 各Server Action成功時（および`updateTodoStatus`が最終的に失敗した場合も）に `revalidatePath('/')`（または`/settings`）を呼ぶことで、Next.jsが該当するServer Componentツリーを自動的に再取得・再描画する。

## `today`（日付）の扱い — 書き込みと読み取りで経路を分離する

Rev.1・Rev.2は「SSR描画（Server Component）が当日日付を**推測**した上で、繰越・クリーンアップという**書き込み**を伴う`initializeTodayTodos`を実行する」という設計だったため、推測した日付が誤っていた場合（Cookie未設定/期限切れ/長時間タブオープン等）に、**誤った日付で繰越が実行され、`last_carryover_date`ガードがその1回を消費してしまい、正しい繰越が二度と行われなくなる**という致命的なデータ不整合を引き起こしていた（目付け役指摘、Rev.1・Rev.2ともにREJECT）。

Rev.3では原則を変更する: **書き込みを伴う処理（繰越・クリーンアップ＝`initializeTodayTodos`）は、Server Componentのレンダリング経路から完全に排除し、他のミューテーション（`createTodo`等）と全く同じように、クライアントが明示的に渡す日付でのみ実行するServer Actionとして扱う。** Server Componentは`getTodosByDate`（純粋な読み取り）のみを呼ぶ。

### 仕組み

1. **書き込み経路（新設）**: `actions/todo-actions.ts` に `initializeToday(date: string): Promise<ActionResponse<void>>` を追加する。内部で `todoService.initializeTodayTodos(date)`（繰越判定＋`after()`によるクリーンアップ）を呼び、完了後 `revalidatePath('/')` する。`date`は呼び出し元（クライアント）が計算したブラウザのローカル日付をそのまま渡す — **サーバー側で日付を推測する処理は一切行わない**。
2. `components/notification-manager.tsx` が、マウント時（`useEffect`、空の依存配列）に `getLocalDateString()`（ブラウザの`new Date()`から算出）を計算し、`initializeToday(browserToday)` を1回呼ぶ。`last_carryover_date`ガードにより、同日中の複数回呼び出し（複数タブ等）は安全に冪等となる。
3. **読み取り経路（表示専用）**: `app/page.tsx`（Server Component）は `getTodosByDate(today)` のみを呼ぶ。`today` は `local-date` Cookie（後述）から取得し、Cookie未設定時はサーバーのローカル日付にフォールバックする。**この経路は読み取りのみで、DBへの書き込みは一切発生しないため、日付の推測が外れても表示が一瞬ずれるだけで、データ不整合は起こり得ない。**
4. `local-date` Cookieは、上記2と同じ`notification-manager.tsx`のマウント処理で、`document.cookie`更新→（値が変わった場合のみ）`router.refresh()`という形で同期する（Rev.2から継続。あくまで表示用の最適化であり、書き込み側の正しさには一切関与しない）。

この設計により、繰越・クリーンアップという書き込み処理は、常に「クライアントがその場で計算した確実に正しいブラウザ日付」でのみ実行される。Cookieの有無・鮮度、タブの開いていた時間、サーバーとブラウザのタイムゾーン差、これらすべてが表示（読み取り）にのみ影響し、データの正しさには一切影響しなくなる。

- **クライアント発のその他の操作（`todo-form.tsx`の`createTodo`、`notification-manager.tsx`のポーリング・`markXNotificationSent`）**: 引き続きその場で計算した `getLocalDateString()` を直接使う（変更なし）
- 日付フォーマット処理を `lib/date-utils.ts`（**新規ファイル、要承認**）に集約する:
  ```typescript
  export function getLocalDateString(date: Date = new Date()): string { /* YYYY-MM-DD */ }
  ```

---

## ファイル別責務

| ファイル | 種別 | 責務 |
|---|---|---|
| `app/layout.tsx` | Server Component | `<NotificationManager>{children}</NotificationManager>` でラップする |
| `app/page.tsx` | Server Component | Cookieから`today`を取得し、`todoService.getTodosByDate(today)`（読み取り専用）を呼び、`<TodoForm />` と `<TodoList todos={todos} />` を描画する |
| `app/settings/page.tsx` | Server Component | `settingService.getSettings()` を呼び、`<SettingsForm settings={settings} />` を描画する |
| `actions/todo-actions.ts` | Server Action | `createTodo`, `updateTodoStatus` に加え、**新設** `initializeToday(date)`（繰越・クリーンアップをクライアント確定日付で実行） |
| `components/todo-form.tsx` | Client Component | テキスト入力＋登録ボタン。`createTodo` Server Actionを呼ぶ。バリデーションエラー（`errors`）を表示。成功時は入力欄をクリア |
| `components/todo-list.tsx` | Server Component | `todos` をpropsで受け取り、`<StatusSelector todo={todo} />` を各行に描画するだけの純粋な表示コンポーネント |
| `components/status-selector.tsx` | Client Component | 3値（未着手/完了/継続）の選択UI。`updateTodoStatus` Server Actionを呼ぶ。`useHighlight()`（後述）を見て、対象なら強調表示 |
| `components/settings-form.tsx` | Client Component | 時刻2つ＋週末トグルの入力フォーム。`updateSettings` Server Actionを呼ぶ。バリデーションエラーを表示 |
| `components/notification-manager.tsx` | Client Component | notification-logic.md記載のポーリング・プッシュ通知・状態バナー。加えて、通知許可リクエスト（AC-2.4）、`local-date` Cookieの同期、**マウント時の`initializeToday`呼び出し**、終了通知クリック時のハイライトContext提供を担う |
| `lib/date-utils.ts`（新規、要承認） | ユーティリティ | `getLocalDateString()` |

---

## `app/page.tsx`

```typescript
// Server Component（読み取り専用）
import { cookies } from 'next/headers';

const today = cookies().get('local-date')?.value ?? getLocalDateString();
const todos = await todoService.getTodosByDate(today); // 書き込みは一切行わない
return (
  <>
    <TodoForm />
    <TodoList todos={todos} />
  </>
);
```

## `components/notification-manager.tsx`（マウント処理の追加分）

マウント時に加え、`visibilitychange`でタブが再アクティブ化された際にも同じ同期処理を行う（spec.md 6.2「日付が変わってから初めてアプリをロード、**またはアクティブにした際**」の「アクティブにした際」を満たすため）。共通処理として関数化する:

```typescript
const lastInitializedDateRef = useRef<string | null>(null); // 直近でinitializeTodayを呼んだ日付。日付が変わっていない限り再呼び出ししない

function syncToday() {
  const browserToday = getLocalDateString();
  // Cookie同期（表示最適化のみ）
  if (readCookie('local-date') !== browserToday) {
    document.cookie = `local-date=${browserToday}; path=/; max-age=172800; SameSite=Lax`;
    router.refresh();
  }
  // 繰越・クリーンアップ（データの正しさを担うのはこちらのみ）。日付が変わった場合のみ呼ぶ
  if (lastInitializedDateRef.current !== browserToday) {
    initializeToday(browserToday)
      .then(() => { lastInitializedDateRef.current = browserToday; }) // 成功時のみ「呼び出し済み」を記録
      .catch((e) => console.error(e)); // 失敗時はrefを更新しないため、次回syncToday実行(次のvisibilitychange等)で同日でも再試行される
  }
}

useEffect(() => {
  syncToday(); // マウント時
  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') syncToday(); // タブ再アクティブ化時
  };
  document.addEventListener('visibilitychange', onVisibilityChange);
  return () => document.removeEventListener('visibilitychange', onVisibilityChange);
}, []);
```

## `components/todo-form.tsx`

- クライアント側で `getLocalDateString()`（ブラウザのローカル日付）を算出し、`createTodo(date, content)` Server Actionを呼ぶ
- 送信中は入力欄・ボタンを無効化する（二重送信防止）
- `ActionResponse` が `status:'error'` の場合、`errors[0].message` を入力欄の下に表示する（AC-1.5, AC-1.6）
- 成功時は入力欄をクリアする。一覧への反映は`revalidatePath('/')`によるServer Component再描画に任せる

## `components/status-selector.tsx`

- `todo: Todo` をpropsで受け取る
- 未着手/完了/継続の3ボタン（またはセレクト）。クリックで `updateTodoStatus(todo.id, newStatus)` を呼ぶ
- 送信中は選択不可にする（連続クリックでの多重送信防止）
- `ActionResponse` が `status:'error'`（`ConflictError`が1回リトライ後も解消しなかった稀なケース）の場合、簡易なエラー表示をする。この場合も`updateTodoStatus` Server Action側で（成功時と同様に）`revalidatePath('/')`を呼んでいるため、画面には常に最新のDB状態が反映される
- `useHighlight()` フックの戻り値（後述）が`true`かつ`todo.status === 'unset'`の場合、背景色を変える（AC-4.4）

## `components/settings-form.tsx`

- `settings: Settings` をpropsで受け取り、`morningTime`/`eveningTime`/`weekendNotificationEnabled` を制御コンポーネントとして保持する
- 送信で `updateSettings({...})` Server Actionを呼ぶ
- `errors` を各フィールドの下に表示する（spec.md異常系No.6の文言含む）

---

## 通知クリック時のハイライト（AC-4.4）

`components/notification-manager.tsx` 内に軽量なReact Contextを定義する（新規ファイルを増やさず、既存のnotification-managerに同居させる）:

```typescript
// notification-manager.tsx 内
const HighlightContext = createContext(false);
export const useHighlight = () => useContext(HighlightContext);
```

- 就業終了プッシュ通知の `onclick` ハンドラ内で、`window.focus()` に加えて `router.push('/')`（`next/navigation`、`/settings`にいた場合のみ遷移）と、Context用stateを`true`に更新する
- `NotificationManager` は `<HighlightContext.Provider value={highlight}>{children}</HighlightContext.Provider>` として子を包む
- `status-selector.tsx` は `useHighlight()` で値を取得し、`true` かつ自分の `todo.status === 'unset'` なら背景色を変える（AC-4.4は「強調表示」のみを要求しており、自動スクロールはspec.mdに明記がないため実装しない）
- ハイライトの解除: 明示的なタイマーは設けない。対象のTodoのステータスが変更されれば（`status !== 'unset'`になれば）その行の強調表示は自然に消える。ページを離れる/リロードすればContextの状態もリセットされる

---

## 通知許可リクエストのタイミング補足

`NotificationManager`は`app/layout.tsx`にマウントされページ非依存であるため、実際には**アプリの初回マウント時（どのページであっても）**に許可リクエストを行う。AC-2.4の「アプリのトップ画面を開く」を「アプリを開く」に一般化した解釈とする（notification-logic.mdのページ非依存マウント決定と整合させるための表現の補足）。

---

## リスク

1. **`local-date` Cookie未設定/期限切れの間、`app/page.tsx`の表示が一瞬ずれる可能性がある**: 表示専用（`getTodosByDate`のみ）であるためデータ破損は起こらない。`notification-manager.tsx`のマウント→Cookie更新→`router.refresh()`で数百ミリ秒以内に正しい表示へ収束する（spec.md異常系No.10の許容範囲）。
2. **`todo-form.tsx`送信成功後、`revalidatePath`によるServer Component再描画を待つ間、一覧に新規Todoが一瞬反映されない体感遅延が生じる可能性がある**: 個人利用アプリの操作頻度では実用上問題にならないと判断し、`useOptimistic`等の楽観的UI更新は導入しない（CLAUDE.md 3.2過剰設計禁止）。
3. **`initializeToday`が複数タブ・マウント/`visibilitychange`から独立して（同じ正しい日付で）繰り返し呼ばれうる**: `last_carryover_date`ガードにより実害はない（冪等）。
4. **日付が変わった直後の通常のケースでも、SSR初回描画は繰越適用前の`getTodosByDate`結果を一瞬表示し、`initializeToday`完了→`revalidatePath`後に繰り越されたTodoが遅れて表示される「ちらつき」が毎日発生しうる**: Cookie不一致の有無に関わらず起こる（リスク1とは別種）。表示上の遅延に留まりデータ不整合ではないため許容する（CLAUDE.md 3.2、`useOptimistic`等の対策は導入しない）。
5. **`initializeToday`の呼び出しは`await`/`catch`されず fire-and-forget で行われる**: 失敗時はServer Action側で`console.error`によりログされるが、ユーザーへの視覚的フィードバックは行わない。次回のマウント・`visibilitychange`・他ページ遷移時の`syncToday`再実行で自然にリトライされるため、専用のリトライUIは実装しない。

## 代替案

1. **`todo-list.tsx`をClient Component化し、`useOptimistic`で楽観的更新する**: 体感速度は上がるが、実装が複雑化し、CAS+自動リトライで既に整合性を担保しているサービス層設計との二重管理になるため不採用。
2. **ハイライト状態をURLクエリパラメータ（例: `/?highlight=unset`）で表現する**: Contextより永続性がありリロードにも耐えるが、AC-4.4はリロード後の継続を要求しておらず、URLを汚すデメリットの方が大きいため不採用。
3. **`lib/date-utils.ts`を新設せず、`lib/validation/rules.ts`に同居させる**: 新規ファイルを増やさずに済むが、日付ユーティリティとバリデーションロジックは関心事が異なるため、可読性を優先し別ファイルとして提案する（要承認）。
4. **`app/page.tsx`のSSRでも`initializeTodayTodos`（書き込み込み）を呼び続け、Cookieの信頼性だけを何らかの方法で担保しようとする（Rev.2までのアプローチ）**: Cookieの鮮度をサーバー側だけで検証する確実な方法がなく（サーバーは真のブラウザ日付を独立に知る手段を持たない）、根本解決にならないため不採用。書き込みをSSR経路から排除する方が確実。

## 制約準拠

- CLAUDE.md 1.1: Client Componentは必ずServer Action経由でミューテーションする。Server Componentのサービス層直接呼び出しはservice-layer-api.mdでユーザー承認済みの方針を踏襲するが、**書き込みを伴う関数（`initializeTodayTodos`）はServer Componentから直接呼ばない**よう本書で明確化した
- CLAUDE.md 1.2: 新規ファイル `lib/date-utils.ts` を明示し、計画提示（本書）をもって承認を求める
- CLAUDE.md 3.2: 過剰設計禁止（自動スクロール・楽観的UI更新・深夜0時の継続監視を見送った根拠）
- CLAUDE.md 3.3: 不要な状態管理ライブラリ禁止（`revalidatePath`+React標準Contextのみで完結）、inline style禁止（CSS Modules等で強調表示のスタイルを定義する）
- db-schema.md, notification-logic.md, service-layer-api.md: 「ブラウザのローカル日付を正とする」原則を、書き込みを伴うすべての経路に例外なく適用（表示専用の読み取り経路のみサーバー日付フォールバックを許容）
- spec.md 1.1, 6.2, AC-1.x, AC-2.4, AC-4.4, 異常系No.6, No.10: 上記UI挙動の直接の根拠

---

## Rev.3での変更点（目付け役レビュー対応）

| 指摘（REJECT理由） | 対応 |
|---|---|
| Cookie未設定/期限切れのフォールバック時、`initializeTodayTodos`が書き込み（繰越）を伴ったまま誤った日付で実行され、`last_carryover_date`ガードを誤って消費し、正しい繰越が二度と行われなくなる | 繰越・クリーンアップ（`initializeTodayTodos`）をServer Componentのレンダリング経路から完全に排除。新設のServer Action `initializeToday(date)` として、クライアントが明示的に渡す確実に正しい日付でのみ実行する方式に変更 |
| 金曜→月曜のような週次利用パターンでCookie期限切れ（48時間)が高確率に発生し、まさに繰越が重要な場面で誤動作する | 上記対応によりCookieの鮮度は書き込みの正しさに一切影響しなくなったため、この経路は解消 |
| 深夜0時をまたぐ長時間タブオープンでも同根の書き込みバグが発生しうる | 同上。`initializeToday`はマウント時の1回のみ・常に正しい日付でしか呼ばれないため、この経路も解消（新しい日の繰越は次回リロードまで遅延するだけで、データ不整合は起きない） |
| リスク3（Rev.2）の整理が不十分だった | Rev.3では「書き込みは常に正しい日付でのみ実行される」ことを前提に、リスク1・4を表示上の遅延・タイミングの問題として再整理した |

### Rev.3補足対応（再レビューCONDITIONAL対応）

| 指摘 | 対応 |
|---|---|
| spec.md 6.2「アクティブにした際」がマウント時のみの実装でカバーされていない | `visibilitychange`イベントでタブ再アクティブ化時にも`syncToday()`を呼ぶよう追加 |
| service-layer-api.mdのリスク1・代替案3がRev.3以前の記述のまま矛盾していた | service-layer-api.md側のリスク1・代替案3も本書Rev.3の内容に合わせて訂正 |
| `initializeToday`がawait/catchされないfire-and-forestである点が未記載 | リスク5として明記。次回`syncToday`実行時の自然な再試行に委ねる方針を明示 |
| 通常時（Cookie不一致なし）でも日付変更直後に毎日ちらつきが発生する点が未記載 | リスク4として追記 |

### 最終レビュー（PASS）後の軽微なポリッシュ

| 指摘 | 対応 |
|---|---|
| `initializeTodayTodos`(`initializeToday`経由)が`isValidDateString`の統一適用対象リストに含まれていない | service-layer-api.mdの対象関数リストに追加 |
| `syncToday()`が日付不変でも`visibilitychange`のたびに`initializeToday`を無条件で呼ぶ | `lastInitializedDateRef`で直近呼び出し日付を記録し、日付が変わった場合のみ呼ぶよう変更（失敗時はrefを更新せず次回再試行） |