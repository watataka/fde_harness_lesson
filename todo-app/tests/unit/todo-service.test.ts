import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFakeSupabaseClient,
  seedDefaultSettings,
  type FakeSupabaseClient,
} from "./helpers/fake-supabase-client";
import { ValidationError } from "@/lib/validation/rules";
import {
  getTodosByDate,
  createTodo,
  updateTodoStatus,
  initializeTodayTodos,
  ConflictError,
} from "@/lib/services/todo-service";

let fakeClient: FakeSupabaseClient;

vi.mock("@/lib/supabase/server", () => ({
  get supabaseServer() {
    return fakeClient;
  },
}));

let afterCallbacks: Array<() => void | Promise<void>> = [];
vi.mock("next/server", () => ({
  after: (cb: () => void | Promise<void>) => {
    afterCallbacks.push(cb);
  },
}));

async function flushAfterCallbacks() {
  const callbacks = afterCallbacks;
  afterCallbacks = [];
  await Promise.all(callbacks.map((cb) => cb()));
}

describe("todo-service", () => {
  beforeEach(() => {
    fakeClient = createFakeSupabaseClient();
    afterCallbacks = [];
  });

  describe("getTodosByDate", () => {
    it("指定日のTodoをcreated_at昇順で返す", async () => {
      fakeClient.tables.task_todos.seed([
        {
          todo_date: "2026-07-19",
          content: "B",
          status: "unset",
          created_at: "2026-07-19T01:00:00.000Z",
          updated_at: "2026-07-19T01:00:00.000Z",
          carried_over_from_id: null,
        },
        {
          todo_date: "2026-07-19",
          content: "A",
          status: "unset",
          created_at: "2026-07-19T00:00:00.000Z",
          updated_at: "2026-07-19T00:00:00.000Z",
          carried_over_from_id: null,
        },
        {
          todo_date: "2026-07-18",
          content: "別日",
          status: "unset",
          created_at: "2026-07-18T00:00:00.000Z",
          updated_at: "2026-07-18T00:00:00.000Z",
          carried_over_from_id: null,
        },
      ]);

      const todos = await getTodosByDate("2026-07-19");

      expect(todos.map((t) => t.content)).toEqual(["A", "B"]);
      expect(todos[0].todoDate).toBe("2026-07-19");
    });

    it("不正な日付形式はValidationError", async () => {
      await expect(getTodosByDate("2026/07/19")).rejects.toThrow(ValidationError);
    });
  });

  describe("createTodo", () => {
    it("trimしたcontentをstatus='unset'で登録する", async () => {
      const todo = await createTodo("2026-07-19", "  資料作成  ");

      expect(todo.content).toBe("資料作成");
      expect(todo.status).toBe("unset");
      expect(todo.todoDate).toBe("2026-07-19");
      expect(fakeClient.tables.task_todos.rows).toHaveLength(1);
    });

    it("空白のみのcontentはValidationError(AC-1.6)", async () => {
      await expect(createTodo("2026-07-19", "   ")).rejects.toThrow(ValidationError);
      expect(fakeClient.tables.task_todos.rows).toHaveLength(0);
    });
  });

  describe("updateTodoStatus", () => {
    it("通常時はそのまま更新される", async () => {
      const inserted = fakeClient.tables.task_todos.insertRow({
        todo_date: "2026-07-19",
        content: "資料作成",
      });

      const updated = await updateTodoStatus(inserted.id as string, "completed");

      expect(updated.status).toBe("completed");
    });

    it("'unset'への変更はランタイムで拒否される(ユーザーが選択できる値ではないため)", async () => {
      const inserted = fakeClient.tables.task_todos.insertRow({
        todo_date: "2026-07-19",
        content: "資料作成",
      });

      await expect(updateTodoStatus(inserted.id as string, "unset")).rejects.toThrow(
        ValidationError
      );
    });

    it("1回目のCAS失敗は自動リトライで解決する(異常系No.7)", async () => {
      const inserted = fakeClient.tables.task_todos.insertRow({
        todo_date: "2026-07-19",
        content: "資料作成",
      });

      const spy = vi
        .spyOn(fakeClient.tables.task_todos, "updateMatching")
        .mockImplementationOnce(() => []); // 1回目は他の操作が先に書き込んだていにする

      const updated = await updateTodoStatus(inserted.id as string, "completed");

      expect(updated.status).toBe("completed");
      expect(spy).toHaveBeenCalledTimes(2);
    });

    it("2回連続でCASが失敗すると極めて稀なケースとしてConflictErrorになる", async () => {
      const inserted = fakeClient.tables.task_todos.insertRow({
        todo_date: "2026-07-19",
        content: "資料作成",
      });

      vi.spyOn(fakeClient.tables.task_todos, "updateMatching").mockReturnValue([]);

      await expect(updateTodoStatus(inserted.id as string, "completed")).rejects.toThrow(
        ConflictError
      );
    });
  });

  describe("initializeTodayTodos", () => {
    it("last_carryover_dateが当日と異なる場合、前回起動日の継続Todoのみを繰り越す", async () => {
      seedDefaultSettings(fakeClient, { last_carryover_date: "2026-07-16" });
      fakeClient.tables.task_todos.seed([
        {
          todo_date: "2026-07-17",
          content: "継続タスク",
          status: "continuing",
          created_at: "2026-07-17T00:00:00.000Z",
          updated_at: "2026-07-17T00:00:00.000Z",
          carried_over_from_id: null,
        },
        {
          todo_date: "2026-07-17",
          content: "完了タスク",
          status: "completed",
          created_at: "2026-07-17T00:00:00.000Z",
          updated_at: "2026-07-17T00:00:00.000Z",
          carried_over_from_id: null,
        },
      ]);

      const todos = await initializeTodayTodos("2026-07-19");

      expect(todos).toHaveLength(1);
      expect(todos[0].content).toBe("継続タスク");
      expect(todos[0].status).toBe("unset");
      expect(todos[0].todoDate).toBe("2026-07-19");
      expect(todos[0].carriedOverFromId).not.toBeNull();

      const settingsRow = fakeClient.tables.settings.rows[0];
      expect(settingsRow.last_carryover_date).toBe("2026-07-19");
    });

    it("last_carryover_dateが既に当日なら繰越をスキップする(多重実行防止、spec.md 6.2)", async () => {
      seedDefaultSettings(fakeClient, { last_carryover_date: "2026-07-19" });
      fakeClient.tables.task_todos.seed([
        {
          todo_date: "2026-07-18",
          content: "継続タスク",
          status: "continuing",
          created_at: "2026-07-18T00:00:00.000Z",
          updated_at: "2026-07-18T00:00:00.000Z",
          carried_over_from_id: null,
        },
      ]);

      const todos = await initializeTodayTodos("2026-07-19");

      expect(todos).toHaveLength(0);
    });

    it("30日より古いTodoをafter()経由のクリーンアップで削除する(spec.md 6.3)", async () => {
      seedDefaultSettings(fakeClient, { last_carryover_date: "2026-07-19" });
      fakeClient.tables.task_todos.seed([
        {
          todo_date: "2026-06-01",
          content: "古いタスク",
          status: "completed",
          created_at: "2026-06-01T00:00:00.000Z",
          updated_at: "2026-06-01T00:00:00.000Z",
          carried_over_from_id: null,
        },
        {
          todo_date: "2026-07-19",
          content: "今日のタスク",
          status: "unset",
          created_at: "2026-07-19T00:00:00.000Z",
          updated_at: "2026-07-19T00:00:00.000Z",
          carried_over_from_id: null,
        },
      ]);

      await initializeTodayTodos("2026-07-19");
      expect(afterCallbacks).toHaveLength(1); // クリーンアップは即時実行ではなくafter()に委譲される

      await flushAfterCallbacks();

      const remaining = fakeClient.tables.task_todos.rows.map((r) => r.content);
      expect(remaining).toEqual(["今日のタスク"]);
    });
  });
});
