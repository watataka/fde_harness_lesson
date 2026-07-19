# DBスキーマ設計書（task_todos / settings）

> Rev.4 — テーブル名を `todos` → `task_todos` に変更（既存の無関係な `todos` テーブルとの衝突回避）。差分は末尾「Rev.4での変更点」参照。
> これまでの経緯: Rev.1 目付け役レビュー REJECT → Rev.2 修正 → Rev.2再レビュー CONDITIONAL → Rev.3 修正 → Rev.4（本ファイル、テーブル名変更）。

## ⚠️ 前提: 接続先Supabaseプロジェクトに既存の無関係テーブルが存在する

接続先のSupabaseプロジェクトには、本アプリと無関係な既存テーブル **`todos`**（列: `id`, `text`, `done` boolean, `created_at`。以前の手動テストによるもの、3行のデータあり）が既に存在している。

- **本アプリのコード・マイグレーションから既存の `todos` テーブルを参照・変更・削除してはならない**。触らず現状のまま残す。
- 本アプリのTodoデータは、名前が衝突しないよう **`task_todos`** という別テーブルに保存する。
- `mcp__supabase__generate_typescript_types` で生成されるDatabase型には `todos`(無関係) と `task_todos`(本アプリ) の**両方**が含まれる。コード中で `.from('todos')` と `.from('task_todos')` を書き間違えても型エラーにはならないため、サービス層(`lib/services/todo-service.ts`)以外の場所でテーブル名を直接書かない・レビュー時に必ずテーブル名を目視確認する、という運用で防ぐ。

## 前提

- 対象テーブル: `task_todos`, `settings`（spec.md 3.1, 6.1, 6.2, 6.3, 6.4準拠）
- アクセス経路: サーバー側（Service Role Key）のみ。クライアントからの直接アクセスは行わない（CLAUDE.md 1.1）。
  RLSは有効化した上で `anon` / `authenticated` ロールに対するポリシーは一切定義しない。
  service_role は常にRLSをバイパスするため、`lib/supabase/server.ts` からは通常通りアクセス可能。

---

## `task_todos` テーブル

```sql
create type todo_status as enum ('unset', 'not_started', 'completed', 'continuing');
```

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` | |
| `todo_date` | date | NOT NULL | このTodoが属する「当日」の日付（spec.md 1.1のローカル日付） |
| `content` | varchar(50) | NOT NULL, CHECK (char_length(btrim(content)) > 0) | Todo本文。最大50文字、空白のみ不可。**保存前にサービス層でtrimし、trim後の文字列を格納する**(50文字カウントもtrim後基準)。CHECKにも`btrim`を戻し、正規経路以外からの空白のみ投稿もDB側で防ぐ |
| `status` | `todo_status` (ENUM) | NOT NULL DEFAULT `'unset'` | 未設定/未着手/完了/継続 |
| `carried_over_from_id` | uuid | NULL, REFERENCES task_todos(id) **ON DELETE SET NULL** | 継続繰越で自動生成された場合、繰越元Todoを指す（履歴追跡用、spec.md 6.2） |
| `created_at` | timestamptz | NOT NULL DEFAULT now() | 就業終了チェックのスナップショット判定（異常系No.8）で `created_at <= チェック開始時刻` の絞り込みに使用 |
| `updated_at` | timestamptz | NOT NULL DEFAULT now() | **トリガーで強制更新**（下記参照）。異常系No.7の「後勝ち」は、サービス層の更新クエリで `UPDATE ... WHERE id = :id AND updated_at = :expectedUpdatedAt` という軽量CAS(楽観的排他制御)を行い、新しいバージョン列を追加せず既存カラムだけで実現する |

インデックス: `todo_date` にBTreeインデックス（当日一覧取得・30日クリーンアップで頻繁にWHERE句に使うため）

`updated_at` 自動更新トリガー:

```sql
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger task_todos_set_updated_at
before update on task_todos
for each row execute function set_updated_at();
```

---

## `settings` テーブル（シングルトン）

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| `id` | smallint | PK DEFAULT 1, CHECK (id = 1) | 単一ユーザー・単一行を強制 |
| `morning_time` | time | NOT NULL DEFAULT '09:00' | 就業開始時刻 |
| `evening_time` | time | NOT NULL DEFAULT '18:00' | 就業終了時刻 |
| `weekend_notification_enabled` | boolean | NOT NULL DEFAULT false | 土日通知トグル（spec.md 6.4） |
| `last_carryover_date` | date | NULL | 継続Todoの自動繰越を最後に実行した日付（spec.md 6.2、多重実行防止） |
| `last_start_notified_date` | date | NULL | 就業開始通知を**実際に送信した**日付のみ記録（AC-2.7、同日再発火防止）。週末通知OFFで抑制された場合は更新しない |
| `last_end_notified_date` | date | NULL | 就業終了通知を**実際に送信した**日付のみ記録（AC-4.7、同日再発火防止）。同上 |
| `updated_at` | timestamptz | NOT NULL DEFAULT now() | トリガーで強制更新（`task_todos`と同じ `set_updated_at()` を適用） |

初期化: マイグレーション内でデフォルト値の1行をINSERTする（spec.md 6.1「初回起動時は09:00/18:00をデフォルト設定」に対応。毎回「存在しなければ作成」するロジックをアプリ側に持たせるより、マイグレーション時点で1行保証する方がシンプル）。

`evening_time > morning_time` のDBレベルCHECK制約は**あえて入れない**（リスク参照）。

**設定変更の遡及発火は行わない**: 日中に `weekend_notification_enabled` 等を変更しても、既に判定済みの時間帯に遡って通知を発火することはしない（spec.mdに明記なし、対応不要と判断）。

---

## 30日クリーンアップの実行方式

spec.md 6.3「過去30日より古いTodoデータは自動的に削除する」は、**アプリ起動時**（トップページのServer Componentが初期データを取得する際）に `todo_date < (今日 - 30日)` のレコードを `task_todos` から削除するバッチ処理として実行する。`pg_cron` 等のスケジューラは使用しない（シンプルさ優先、CLAUDE.md 3.2「過剰設計禁止」）。`carried_over_from_id` は `ON DELETE SET NULL` のため、この削除処理がFK制約違反で失敗することはない。既存の無関係な `todos` テーブルはこの処理の対象外。

---

## リスク

1. **`evening_time > morning_time` のDB制約を入れない**: バリデーションをサービス層（`setting-service.ts`）のみに置くため、Supabase MCPやSQL Editorから直接テーブルを更新された場合、不整合な時刻設定がすり抜ける可能性がある。ただしCLAUDE.md 1.1「クライアントからの直接アクセス禁止、サーバー経由に統一」の前提上、正規の更新経路は必ずサービス層を通るため許容範囲と判断。
2. **`todo_date` はクライアントの申告値をそのまま信頼する**: サーバー側はタイムゾーン情報を持たないため、ブラウザのローカル日付をそのまま `todo_date` として受け取る。端末の時刻設定がずれている場合（spec.md異常系No.10、スコープ外と明記）、誤った日付でデータが保存されうる。
3. **通知済み日付・繰越済み日付を単一行の `settings` に集約**: 将来的にマルチユーザー化する場合（Phase 2、現状スコープ外）は再設計が必須になる。単一ユーザー前提の現仕様では妥当だが、拡張性は低い。
4. **30日クリーンアップが複数タブから重複実行される可能性**: 複数タブを同時に開いている場合、それぞれのタブのアプリ起動時に同じDELETEが実行されうる。実害は2回目以降が0件DELETEになるだけで冪等なため許容する。
5. **`todos`（既存無関係テーブル）と `task_todos`（本アプリ）の名前の類似による誤操作リスク**: Supabaseダッシュボードや生成されたDatabase型の一覧に両テーブルが並ぶため、手動SQL操作やコードレビュー時に誤って `todos` を対象にしてしまう可能性がある。テーブル名を直接扱うコードをサービス層に限定し、レビュー時に必ず確認することで低減する。

## 代替案

1. **通知済みフラグを別テーブル `notification_log` に分離**: `settings` の肥大化を避けられるが、単一ユーザー・通知2種類のみの現状ではオーバーエンジニアリング（CLAUDE.md 3.2「過剰設計禁止」）と判断し不採用。
2. **`carried_over_from_id` を持たず、Todoの繰越元を追跡しない**: スキーマはシンプルになるが、spec.md 6.2の「履歴保存」意図（前回起動日のデータを追跡できる）を弱めるため不採用。
3. **`evening_time > morning_time` をDB CHECK制約でも強制する**: 二重の安全網になるが、バリデーションロジックがサービス層とDB層に分散し、エラーメッセージの一元管理（CLAUDE.md 4.3の文言指定）が崩れるため不採用。
4. **異常系No.7を専用バージョン列で担保する**: より明示的だが、既存の `updated_at` を使った軽量CAS(`WHERE id=? AND updated_at=?`)で同等の効果が得られるため、専用カラムの追加は不採用。
5. **既存の `todos` テーブルを削除して `todos` の名前をそのまま使う**: 名前の衝突・誤操作リスクは消えるが、既存データを失うこと、および無関係なテーブルを本アプリの都合で削除するのは意図しない副作用が大きいと判断し不採用（ユーザー判断により、既存テーブルは保持する方針を採用）。

## 制約準拠

- CLAUDE.md 1.1: クライアントからの直接アクセスを許さないRLS設計
- CLAUDE.md 3.1: `SELECT *` 禁止、パラメータ化されたクエリのみ使用（サービス層実装時に遵守）／`any`型禁止 → `status` をネイティブENUM化し `generate_typescript_types` でリテラルUnion型を生成できるようにした
- CLAUDE.md 3.2: 過剰設計禁止（通知ログテーブル分離・専用バージョン列・pg_cronを見送った根拠）／既存無関係テーブルの削除も「本アプリのスコープ外の変更」として見送り
- CLAUDE.md 4.3: バリデーションルール表（content最大50文字、時刻相関チェック）をテーブル制約に反映
- spec.md 6.1, 6.2, 6.3, 6.4, AC-2.7, AC-4.7, 異常系No.7, No.8: 上記スキーマ設計の直接の根拠

## マイグレーション適用時の注意

- `CREATE TYPE todo_status` は `CREATE TABLE task_todos` より**前**に実行する必要がある(SQL上の依存順序)。`supabase/migrations/0001_init.sql` 作成時にこの順序を守ること(CLAUDE.md 0「MCP経由で適用したSQLは必ずmigrationsに保存」の手順で確認する)。
- マイグレーションSQLに既存の `todos` テーブルへの `DROP` / `ALTER` 文を一切含めないこと。

---

## Rev.2〜Rev.4での変更点（目付け役レビュー対応・その後の方針変更）

### Rev.2（Rev.1のREJECT対応）

| 指摘 | 対応 |
|---|---|
| （重大）`carried_over_from_id` の `ON DELETE` 未指定でクリーンアップがFK違反する | `ON DELETE SET NULL` を明記 |
| `status` が `text+CHECK` で型安全性が弱い | ネイティブ `todo_status` ENUM型に変更 |
| `updated_at` の自動更新機構が未定義 | `set_updated_at()` トリガーを追加 |
| 異常系No.7（後勝ち）の担保方法が未記載 | 「DBへの書き込み順=正、UI側は逐次送信」という前提を明記し、リスク・代替案に追記 |
| 列名 `text` がSQL型名と衝突しやすい | `content` に変更 |
| trim・50文字カウントの基準が未定義 | 「サービス層でtrim後に格納・カウント」を明記 |
| 異常系No.8（スナップショット判定）の実現方法が制約準拠節に未記載 | `created_at` を根拠として追記 |
| 6.3クリーンアップの実行者・タイミングが未確定 | 「アプリ起動時のバッチ処理」に確定、pg_cron不使用を明記 |
| 週末通知トグルと通知済み日付列の意味論が曖昧 | 「実際に送信した日付のみ記録」「遡及発火なし」を明記 |

### Rev.3（Rev.2のCONDITIONAL対応）

| 指摘 | 対応 |
|---|---|
| `content` のCHECKから`btrim`が失われ、空白のみ投稿の防御層が減っている | `CHECK (char_length(btrim(content)) > 0)` に戻した |
| 異常系No.7の担保がUI実装規律のみに依存している | サービス層のUPDATE文で `updated_at` を使った軽量CAS(`WHERE id=? AND updated_at=?`)を採用する方針に変更 |
| 複数タブでの30日クリーンアップ重複実行が未記載 | リスクに追記(冪等なため実害小と明記) |
| migration作成時の `CREATE TYPE` 順序への言及漏れ | 「マイグレーション適用時の注意」節を新設 |

### Rev.4（テーブル名衝突の解消）

| 経緯 | 対応 |
|---|---|
| マイグレーション適用前に、接続先Supabaseプロジェクトへ既に無関係な `todos` テーブル(手動テストの残存データ)が存在することが判明 | 既存テーブルは削除せず保持する方針とし、本アプリのテーブル名を `todos` → **`task_todos`** に変更。全カラム定義・FK参照・トリガー名を追随。既存テーブルとの誤操作防止の注記とリスク・代替案を追加 |

## 適用結果（実施済み）

Supabase MCP経由で `task_todos` / `settings` を作成済み（`todo-app/supabase/migrations/0001_init.sql`）。適用後 `get_advisors` を実行し、以下を確認・対応した:

- `task_todos` / `settings` はRLS有効・ポリシーなし（設計通り、service_roleのみアクセス可）。
- パフォーマンス指摘: `carried_over_from_id` の自己参照FKにインデックスが無い → `idx_task_todos_carried_over_from_id` を追加（`todo-app/supabase/migrations/0002_add_carried_over_from_id_index.sql`）。
- **既存の無関係な `todos` テーブルに、`anon`ロールへの INSERT/UPDATE/DELETE を無制限に許可するRLSポリシーが設定されていることが判明**（本アプリとは無関係だが、セキュリティ上の懸念としてユーザーに報告済み。対応要否は別途判断）。
