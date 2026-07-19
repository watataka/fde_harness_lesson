import { beforeEach, describe, expect, it, vi } from "vitest";
import { ValidationError } from "@/lib/validation/rules";
import type { Todo } from "@/types";

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => revalidatePath(path),
}));

const createTodoService = vi.fn();
const updateTodoStatusService = vi.fn();
const initializeTodayTodosService = vi.fn();

class FakeConflictError extends Error {}

vi.mock("@/lib/services/todo-service", () => ({
  createTodo: (...args: unknown[]) => createTodoService(...args),
  updateTodoStatus: (...args: unknown[]) => updateTodoStatusService(...args),
  initializeTodayTodos: (...args: unknown[]) => initializeTodayTodosService(...args),
  ConflictError: FakeConflictError,
}));

const { createTodo, updateTodoStatus, initializeToday } = await import(
  "@/actions/todo-actions"
);

const sampleTodo: Todo = {
  id: "todo-1",
  todoDate: "2026-07-19",
  content: "資料作成",
  status: "unset",
  carriedOverFromId: null,
  createdAt: "2026-07-19T00:00:00.000Z",
  updatedAt: "2026-07-19T00:00:00.000Z",
};

describe("todo-actions", () => {
  beforeEach(() => {
    revalidatePath.mockReset();
    createTodoService.mockReset();
    updateTodoStatusService.mockReset();
    initializeTodayTodosService.mockReset();
  });

  describe("createTodo", () => {
    it("成功時はokエンベロープを返し、revalidatePathを呼ぶ", async () => {
      createTodoService.mockResolvedValue(sampleTodo);

      const result = await createTodo("2026-07-19", "資料作成");

      expect(result).toEqual({ status: "ok", data: sampleTodo });
      expect(revalidatePath).toHaveBeenCalledWith("/");
    });

    it("ValidationError時はerrorsを含むエンベロープを返し、revalidatePathは呼ばない", async () => {
      createTodoService.mockRejectedValue(
        new ValidationError([{ field: "content", message: "Todoを入力してください" }])
      );

      const result = await createTodo("2026-07-19", "");

      expect(result).toEqual({
        status: "error",
        message: "入力内容を確認してください",
        errors: [{ field: "content", message: "Todoを入力してください" }],
      });
      expect(revalidatePath).not.toHaveBeenCalled();
    });

    it("予期しないエラーは汎用メッセージに変換される", async () => {
      createTodoService.mockRejectedValue(new Error("DB down"));

      const result = await createTodo("2026-07-19", "資料作成");

      expect(result).toEqual({ status: "error", message: "予期しないエラーが発生しました" });
    });
  });

  describe("updateTodoStatus", () => {
    it("成功時はokエンベロープを返し、revalidatePathを呼ぶ", async () => {
      updateTodoStatusService.mockResolvedValue({ ...sampleTodo, status: "completed" });

      const result = await updateTodoStatus("todo-1", "completed");

      expect(result.status).toBe("ok");
      expect(revalidatePath).toHaveBeenCalledWith("/");
    });

    it("ConflictError時もrevalidatePathを呼ぶ(DBは他の操作で変わっているため)", async () => {
      updateTodoStatusService.mockRejectedValue(new FakeConflictError());

      const result = await updateTodoStatus("todo-1", "completed");

      expect(result).toEqual({
        status: "error",
        message: "他の操作により更新されています。最新の状態を確認してください",
      });
      expect(revalidatePath).toHaveBeenCalledWith("/");
    });

    it("ValidationError時はrevalidatePathを呼ばない(DBに触れていないため)", async () => {
      updateTodoStatusService.mockRejectedValue(
        new ValidationError([{ field: "status", message: "不正なステータスです" }])
      );

      await updateTodoStatus("todo-1", "unset");

      expect(revalidatePath).not.toHaveBeenCalled();
    });
  });

  describe("initializeToday", () => {
    it("成功時はokエンベロープを返し、revalidatePathを呼ぶ", async () => {
      initializeTodayTodosService.mockResolvedValue([sampleTodo]);

      const result = await initializeToday("2026-07-19");

      expect(result).toEqual({ status: "ok", data: undefined });
      expect(revalidatePath).toHaveBeenCalledWith("/");
    });

    it("失敗時はerrorエンベロープを返す", async () => {
      initializeTodayTodosService.mockRejectedValue(new Error("DB down"));

      const result = await initializeToday("2026-07-19");

      expect(result.status).toBe("error");
    });
  });
});
