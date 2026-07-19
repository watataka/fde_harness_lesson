import { after } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import type { Todo } from "@/types";
import {
  type UserSelectableStatus,
  validateDateString,
  validateTodoContent,
  validateTodoStatus,
} from "@/lib/validation/rules";

type TaskTodoRow = Database["public"]["Tables"]["task_todos"]["Row"];

const TODO_COLUMNS =
  "id, todo_date, content, status, carried_over_from_id, created_at, updated_at";
const CARRYOVER_WINDOW_DAYS = 30;

// service-layer-api.md: updateTodoStatusの自動リトライが最終的に解決できなかった、
// 極めて稀な競合(3者以上の同時更新等)のみで投げるフォールバック用の例外。
export class ConflictError extends Error {
  constructor(message = "Conflict") {
    super(message);
    this.name = "ConflictError";
  }
}

function mapTodoRow(row: TaskTodoRow): Todo {
  return {
    id: row.id,
    todoDate: row.todo_date,
    content: row.content,
    status: row.status,
    carriedOverFromId: row.carried_over_from_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** 当日Todo一覧の単純取得(読み取り専用)。Server Componentの表示経路・Route Handlerのポーリング両方から使う。 */
export async function getTodosByDate(date: string): Promise<Todo[]> {
  validateDateString(date);

  const { data, error } = await supabaseServer
    .from("task_todos")
    .select(TODO_COLUMNS)
    .eq("todo_date", date)
    .order("created_at", { ascending: true });

  if (error) {
    console.error(error);
    throw new Error("Todo一覧の取得に失敗しました");
  }
  return (data ?? []).map(mapTodoRow);
}

export async function createTodo(date: string, content: string): Promise<Todo> {
  validateDateString(date);
  const trimmedContent = validateTodoContent(content);

  const { data, error } = await supabaseServer
    .from("task_todos")
    .insert({ todo_date: date, content: trimmedContent, status: "unset" })
    .select(TODO_COLUMNS)
    .single();

  if (error || !data) {
    console.error(error);
    throw new Error("Todoの登録に失敗しました");
  }
  return mapTodoRow(data);
}

async function attemptUpdateStatus(
  id: string,
  status: UserSelectableStatus
): Promise<Todo | null> {
  const { data: current, error: fetchError } = await supabaseServer
    .from("task_todos")
    .select("updated_at")
    .eq("id", id)
    .single();

  if (fetchError || !current) {
    console.error(fetchError);
    throw new Error("Todoの取得に失敗しました");
  }

  const { data, error } = await supabaseServer
    .from("task_todos")
    .update({ status })
    .eq("id", id)
    .eq("updated_at", current.updated_at)
    .select(TODO_COLUMNS);

  if (error) {
    console.error(error);
    throw new Error("Todoステータスの更新に失敗しました");
  }

  if (!data || data.length === 0) {
    return null; // CAS失敗(他の更新が先に書き込んだ)
  }
  return mapTodoRow(data[0]);
}

/**
 * 異常系No.7(後勝ち)対応。楽観的排他制御(updated_at)で更新し、競合していた場合は
 * 最新のupdated_atで1回だけ自動リトライする。それでも解決しない極めて稀なケースのみ
 * ConflictErrorを投げる(service-layer-api.md)。
 */
export async function updateTodoStatus(id: string, status: string): Promise<Todo> {
  const validStatus = validateTodoStatus(status);

  const firstAttempt = await attemptUpdateStatus(id, validStatus);
  if (firstAttempt) return firstAttempt;

  const secondAttempt = await attemptUpdateStatus(id, validStatus);
  if (secondAttempt) return secondAttempt;

  throw new ConflictError();
}

function subtractDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

async function cleanupOldTodos(today: string): Promise<void> {
  const cutoff = subtractDays(today, CARRYOVER_WINDOW_DAYS);
  const { error } = await supabaseServer.from("task_todos").delete().lt("todo_date", cutoff);
  if (error) {
    console.error(error);
  }
}

async function carryOverContinuingTodosIfNeeded(today: string): Promise<void> {
  const { data: settingsRow, error: settingsError } = await supabaseServer
    .from("settings")
    .select("last_carryover_date")
    .eq("id", 1)
    .single();

  if (settingsError || !settingsRow) {
    console.error(settingsError);
    throw new Error("設定の取得に失敗しました");
  }

  if (settingsRow.last_carryover_date === today) {
    return; // 本日分は実行済み(spec.md 6.2の多重実行防止)
  }

  const { data: latestRow, error: latestError } = await supabaseServer
    .from("task_todos")
    .select("todo_date")
    .lt("todo_date", today)
    .order("todo_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) {
    console.error(latestError);
    throw new Error("繰越対象日の取得に失敗しました");
  }

  if (latestRow) {
    const { data: continuingTodos, error: continuingError } = await supabaseServer
      .from("task_todos")
      .select("id, content")
      .eq("todo_date", latestRow.todo_date)
      .eq("status", "continuing");

    if (continuingError) {
      console.error(continuingError);
      throw new Error("継続Todoの取得に失敗しました");
    }

    if (continuingTodos && continuingTodos.length > 0) {
      const rowsToInsert = continuingTodos.map((todo) => ({
        todo_date: today,
        content: todo.content,
        status: "unset" as const,
        carried_over_from_id: todo.id,
      }));

      const { error: insertError } = await supabaseServer
        .from("task_todos")
        .insert(rowsToInsert);
      if (insertError) {
        console.error(insertError);
        throw new Error("継続Todoの繰越に失敗しました");
      }
    }
  }

  const { error: updateError } = await supabaseServer
    .from("settings")
    .update({ last_carryover_date: today })
    .eq("id", 1);

  if (updateError) {
    console.error(updateError);
    throw new Error("繰越日時の更新に失敗しました");
  }
}

/**
 * 継続Todoの自動繰越(同期)＋30日クリーンアップ(after()で非同期)＋当日一覧取得。
 * Server Componentからは呼ばない。新設のServer Action `initializeToday` から、
 * クライアントが直接計算したブラウザのローカル日付でのみ呼ぶこと
 * (component-design.md Rev.3。Server Component側で日付を推測して書き込みを行うと
 * データ不整合を招く重大なバグがあったための設計変更)。
 */
export async function initializeTodayTodos(today: string): Promise<Todo[]> {
  validateDateString(today);
  await carryOverContinuingTodosIfNeeded(today);
  after(() => {
    cleanupOldTodos(today).catch((e) => console.error(e));
  });
  return getTodosByDate(today);
}
