import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

// 実際のSupabaseプロジェクトに対してE2Eテストを実行する(ユーザー承認済み方針)。
//
// ⚠️ TEST_DATEは実際の「明日」を使う。遠い未来の日付にすると、
// initializeTodayTodosの30日クリーンアップ(cutoff = today - 30日)が実データを
// すべて「古い」と誤判定して削除してしまう致命的な事故を招く(実際に発生しかけた)。
// 「明日」ならcutoffは実際の運用と同じ範囲(直近29日は保持)に収まり安全。
function computeTestDate(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const y = tomorrow.getFullYear();
  const m = String(tomorrow.getMonth() + 1).padStart(2, "0");
  const d = String(tomorrow.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export const TEST_DATE = computeTestDate();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error(
    "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for E2E tests (see .env.local.example)"
  );
}

export const testSupabase = createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

export interface TestSettingsOverrides {
  // morning_time/evening_timeはDB上NOT NULL(db-schema.md)のためnullは受け付けない
  morningTime?: string;
  eveningTime?: string;
  weekendNotificationEnabled?: boolean;
  lastStartNotifiedDate?: string | null;
  lastEndNotifiedDate?: string | null;
}

export async function setTestSettings(overrides: TestSettingsOverrides): Promise<void> {
  const { error } = await testSupabase
    .from("settings")
    .update({
      // last_carryover_dateを常にTEST_DATEにしておくことで、initializeTodayTodosの
      // 繰越スキャン(todo_date < today の最新日付を探す)が実データに触れないようにする
      // (多重実行防止ガードにより「本日分は実行済み」として即スキップされる)。
      last_carryover_date: TEST_DATE,
      ...(overrides.morningTime !== undefined && { morning_time: overrides.morningTime }),
      ...(overrides.eveningTime !== undefined && { evening_time: overrides.eveningTime }),
      ...(overrides.weekendNotificationEnabled !== undefined && {
        weekend_notification_enabled: overrides.weekendNotificationEnabled,
      }),
      ...(overrides.lastStartNotifiedDate !== undefined && {
        last_start_notified_date: overrides.lastStartNotifiedDate,
      }),
      ...(overrides.lastEndNotifiedDate !== undefined && {
        last_end_notified_date: overrides.lastEndNotifiedDate,
      }),
    })
    .eq("id", 1);
  if (error) throw error;
}

/** テスト前後で本番の設定値に影響を与えないよう、既定値に戻す。last_carryover_dateも元に戻す。 */
export async function restoreDefaultSettings(): Promise<void> {
  const { error } = await testSupabase
    .from("settings")
    .update({
      morning_time: "09:00:00",
      evening_time: "18:00:00",
      weekend_notification_enabled: false,
      last_start_notified_date: null,
      last_end_notified_date: null,
      last_carryover_date: null,
    })
    .eq("id", 1);
  if (error) throw error;
}

type TodoStatus = "unset" | "not_started" | "completed" | "continuing";

export async function seedTestTodos(
  todos: { content: string; status: TodoStatus }[]
): Promise<void> {
  await cleanupTestTodos();
  if (todos.length === 0) return;
  const { error } = await testSupabase
    .from("task_todos")
    .insert(todos.map((t) => ({ todo_date: TEST_DATE, content: t.content, status: t.status })));
  if (error) throw error;
}

export async function cleanupTestTodos(): Promise<void> {
  const { error } = await testSupabase.from("task_todos").delete().eq("todo_date", TEST_DATE);
  if (error) throw error;
}

export async function getSettingsRow() {
  const { data, error } = await testSupabase
    .from("settings")
    .select("last_start_notified_date, last_end_notified_date")
    .eq("id", 1)
    .single();
  if (error || !data) throw error ?? new Error("settings row not found");
  return data;
}
