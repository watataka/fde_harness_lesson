# 通知ロジック設計書

> Rev.2 — 目付け役レビュー（CONDITIONAL）の指摘を反映。差分は末尾「Rev.2での変更点」参照。

## 前提・決定事項

- 判定主体は `components/notification-manager.tsx`（Client Component）。**`app/layout.tsx` にマウントし、特定ページに限定しない**（spec.md 1.1「アプリのタブが起動して開いている間のみ」はページ非依存のため。`/settings` 画面滞在中でも判定は継続する）。
- **プッシュ通知（Notification API呼び出し）の発火判定**と、**画面上の状態バナー表示**は評価ロジックを分離する（下記参照）。
- プッシュ通知の時刻判定は **「設定時刻と完全一致(`===`)した瞬間」のみ**を対象とする。「設定時刻以降かつ本日未通知」のような緩和判定は採用しない。
  - 理由: 緩和判定はスリープ復帰後の取りこぼし対策として有効だが、spec.md 異常系No.2「次回アプリを開いた際の代替表示・再通知は行わない(3.2により対象外)」と正面から矛盾するため（ユーザー承認済み、A案採用）。
- マルチユーザー対応（`user_id`列の追加等）は行わない。`settings`はid=1のシングルトンのまま（spec.md 3.2, CLAUDE.md 3.2「Phase 2機能の先取り禁止」に基づく、ユーザー承認済み）。

---

## ポーリング設計

- `setInterval` で **20秒間隔**にポーリングする（60秒間隔より短くすることで、分境界(HH:mm)をまたぐ瞬間の取りこぼし確率を下げる。完全にゼロにはできない点はリスク参照）。
- **多重実行防止**: 前回pollの `GET /api/settings` / `GET /api/todos` がまだ完了していない場合、次のtickはスキップする（`isFetchingRef`等のフラグで管理）。
- **エラーハンドリング**: fetch失敗時（異常系No.11のネットワーク切断等）は `console.error` 等で記録した上で当該pollをスキップし、次回pollへ継続する。エラーを握りつぶさない（CLAUDE.md 3.1「空のcatch/エラーの握りつぶし禁止」に対応）。
- `GET /api/todos` は当日Todo一覧取得のため **`?date=YYYY-MM-DD`（クライアントのローカル日付）をクエリパラメータとして渡す**。サーバー側はタイムゾーン情報を持たないため、`markStartNotificationSent`等と同じ原則（クライアントの申告値を使う）をここでも統一する。

---

## 状態バナー（プッシュ通知とは独立して毎pollで評価する常時表示UI）

以下はDBフラグを使わず、毎pollで条件を再評価するだけの冪等な表示状態。「1日1回」の制御は不要（プッシュ通知ではないため、リロードしても正しい状態が復元される）。

| バナー | 表示条件 |
|---|---|
| 「通知が無効です。ブラウザの設定で通知を許可してください」（AC-2.5, 異常系No.1） | `morningTime` が設定済み **かつ** `Notification.permission === 'denied'` **かつ** 現在時刻 `>=` `morningTime` **かつ**（平日、または週末通知有効） |
| 「本日のTodoが登録されていません」（AC-4.3） | `eveningTime` が設定済み **かつ** 現在時刻 `>=` `eveningTime` **かつ** 当日Todoが0件 **かつ**（平日、または週末通知有効） |

いずれも対応する時刻が未設定の場合はバナーを表示しない（プッシュ通知ロジックのrule 1と同じ扱い）。

週末かつ`weekendNotificationEnabled === false`の場合はどちらのバナーも表示しない（通知そのものを送らない日として扱うため、spec.md 6.4）。

---

## 就業開始プッシュ通知ロジック（AC-2.x）

1. `settings.morningTime` が未設定 → 何もしない（AC-2.6）
2. 当日が土日 **かつ** `weekendNotificationEnabled === false` → 何もしない（発火せず、`last_start_notified_date`も更新しない。spec.md 6.4）
3. 現在ローカル時刻(HH:mm)が `morningTime` と**完全一致** **かつ** `last_start_notified_date !== 当日` **かつ** `Notification.permission === 'granted'` の場合:
   - タイトル「Todo入力のお知らせ」/ 本文「就業開始時刻になりました。本日のTodoを入力してください。」で通知表示（AC-2.1, AC-2.8。Todo入力有無は判定しない）
   - 表示後、Server Action `markStartNotificationSent(today)` を呼ぶ

`denied` の場合はプッシュ通知を送らず、DBフラグも更新しない（画面上の案内は上記「状態バナー」で独立して表示される）。

## 就業終了プッシュ通知ロジック（AC-4.x）

1. `settings.eveningTime` が未設定 → 何もしない（AC-4.5）
2. 当日が土日 **かつ** `weekendNotificationEnabled === false` → 何もしない
3. 現在ローカル時刻が `eveningTime` と**完全一致** **かつ** `last_end_notified_date !== 当日` の場合、当日Todo一覧（`?date=当日`で取得）を確認し:
   - Todoが1件以上かつ`status = 'unset'`の件数 > 0 **かつ** `Notification.permission === 'granted'` → タイトル「Todoステータス確認」/ 本文「ステータス未設定のTodoが{n}件あります。確認してください。」で通知表示（AC-4.1, AC-4.6）。表示後 `markEndNotificationSent(today)` を呼ぶ
   - 未設定件数が0（Todo自体が0件、または全件入力済み） → 通知は出さない（AC-4.2, AC-4.3）。DBフラグは更新しない

Todoが0件の場合の画面案内、および`denied`の場合の案内は、上記「状態バナー」で独立して表示される。

### スナップショット判定（異常系No.8）について

db-schema.md（Rev.4）は `created_at` を将来的なスナップショットカットオフ用途として設けているが、本設計の実装は単発の `GET /api/todos` 取得のみであり、Postgresの文単位スナップショット（READ COMMITTED）により、取得後に追加されたTodoは自然に対象外となる。そのため `created_at <= チェック開始時刻` の明示的なフィルタは**現時点では不要**（`created_at`列自体は将来の要件変化に備えて残す）。

---

## 同日中の設定変更に関する扱い

`morningTime`/`eveningTime` を同日中に変更しても、`last_start_notified_date`/`last_end_notified_date`が当日日付であれば、新しい時刻に対して再度発火することはない。「1日1回」の原則は設定変更に関わらず維持する（spec.mdに明記はないが、db-schema.mdの「設定変更の遡及発火は行わない」と同じ考え方を当日の未来時刻にも適用する解釈とする）。

---

## 通知許可状態の初期化（AC-2.4）

トップページ表示時に `Notification.permission` を確認し、`'default'`（未確認）であれば `Notification.requestPermission()` を呼び、許可リクエストダイアログを表示する。

---

## 通知クリック時のタブフォーカス（AC-2.3, AC-4.4）

`Notification` インスタンスの `onclick` ハンドラ内で `window.focus()` を呼ぶ。就業終了通知の場合は、クリック時に未設定Todoへスクロール・強調表示するためのクライアント側フラグ（詳細はコンポーネント設計書で扱う）も同時に立てる。

---

## Server Action の追加（`actions/setting-actions.ts`）

新規ファイルは作らず、既存の `setting-actions.ts` に追加する（CLAUDE.md 1.2のディレクトリ構成を変更しないため）。

```typescript
markStartNotificationSent(date: string): Promise<ActionResponse>
markEndNotificationSent(date: string): Promise<ActionResponse>
```

- `date` はサーバーではなく **クライアントのローカル日付をそのまま引数で渡す**（`todo_date`と同じ理由。サーバー側はタイムゾーン情報を持たない）
- `setting-service.ts` に対応するロジックを追加し、`settings` テーブルの該当列を `UPDATE`
- 同じ `date` で複数回呼ばれても実害はない（`UPDATE ... SET last_start_notified_date = :date` は冪等）

---

## リスク

1. **ポーリング間隔(20秒)でも完全一致判定の取りこぼしが起こりうる**: バックグラウンドタブのタイマー・スロットリングにより、分境界を挟んでpollが実行されない場合がある。spec.md異常系No.2の範囲内として許容する（A案採用に伴う既知の制約）。
2. **`markStartNotificationSent`/`markEndNotificationSent` のServer Action呼び出し失敗時の重複発火**: 通知表示後にネットワークエラーでDB更新が失敗すると、既読フラグが立たず次のpollで再度発火しうる。セッション内(Reactの一時state)で当該ポーリングセッション中の重複は防ぐが、ページリロード後は一時stateが失われるため、リロード直後に再度重複発火するリスクが残る。
3. **`denied`状態では`last_start_notified_date`/`last_end_notified_date`を更新しない**: ユーザーが日中に許可設定を`granted`に変更した場合、その日まだ送信されていなければ次のpollで送信される。仕様に明記はないが、db-schema.mdの「実際に送信した日付のみ記録」の原則と整合するため意図した挙動とする。

## 代替案

1. **Service Workerによるバックグラウンド定期実行**: タブが非アクティブでも動作しうるが、spec.md 1.1「アプリのタブが起動して開いている間のみ」という前提と矛盾し、CLAUDE.md 3.2のPhase2機能先取り禁止にも抵触するため不採用。
2. **ポーリング間隔を60秒にする**: サーバー負荷は下がるが取りこぼしリスクが増すため、20秒を採用（個人利用アプリのため負荷は問題にならない）。
3. **「設定時刻以降かつ本日未通知」への緩和判定（スリープ復帰対策）**: 実用上は取りこぼしを減らせるが、spec.md異常系No.2の明示的なスコープ外事項と矛盾するため不採用（A案、ユーザー承認済み）。
4. **`markXNotificationSent`失敗時の自動リトライキュー実装**: 信頼性は上がるが、単一ユーザー・低頻度操作の個人アプリに対しては複雑さが見合わないと判断し不採用（リスク2として許容）。
5. **状態バナーもプッシュ通知と同じ完全一致ゲートで判定する（Rev.1の設計）**: シンプルだが、設定時刻を過ぎてからページを開いた/リロードした場合にバナーが表示されない挙動になり、異常系No.1の「常に案内を表示する」という趣旨と整合しないため不採用（Rev.2でバナーとプッシュ通知の評価を分離）。

## 制約準拠

- CLAUDE.md 1.1: `GET /api/settings` / `GET /api/todos`（Route Handler、クエリパラメータで当日日付を明示）経由でのみデータ取得、Server Action経由でのみ更新。Client ComponentからSupabaseへの直接アクセスは行わない
- CLAUDE.md 1.2: 新規ファイルを増やさず既存の `setting-actions.ts` / `setting-service.ts` に機能追加
- CLAUDE.md 3.1: fetch失敗時のエラーハンドリングを明記（握りつぶし禁止）
- CLAUDE.md 3.2: Service Worker等のPhase2相当機能・自動リトライキューを不採用とした根拠
- spec.md 1.1, 4.2, 4.4, 6.4, 異常系No.1, No.2, No.10, No.12: 上記ロジックの直接の根拠
- ユーザー決定事項（本設計着手前の確認）: 時刻完全一致判定を維持（A案）／マルチユーザー対応(user_id)は追加しない

---

## Rev.2での変更点（目付け役レビュー対応）

| 指摘 | 対応 |
|---|---|
| 完全一致ゲートが状態バナー(denied案内・0件案内)まで巻き込んでおり、時刻を過ぎてから開いた場合にバナーが出ない | バナー評価をプッシュ通知の発火ゲートから分離し、`>=`判定で毎poll独立評価する「状態バナー」節を新設 |
| `GET /api/todos` にクライアントのローカル日付を渡す記載がない | `?date=YYYY-MM-DD` をクエリパラメータとして渡す旨を明記 |
| `notification-manager.tsx` のマウント位置が未確定 | `app/layout.tsx` にマウントすると明記 |
| pollの多重実行ガードの記載がない | `isFetchingRef`等での多重実行防止を明記 |
| fetch失敗時のエラーハンドリングが未記載 | ログ記録してスキップ・継続する方針を明記(CLAUDE.md 3.1準拠) |
| db-schema.mdの`created_at`カットオフ根拠と本設計の実装が一致していない | 「スナップショット判定について」節を新設し、単発SELECTで足りる理由を明記 |
| 同日中の設定変更時の再アーム挙動が未定義 | 「同日中の設定変更に関する扱い」節を新設 |
