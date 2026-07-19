import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ValidationError } from "@/lib/validation/rules";
import type { Todo } from "@/types";

const getTodosByDateService = vi.fn();

vi.mock("@/lib/services/todo-service", () => ({
  getTodosByDate: (...args: unknown[]) => getTodosByDateService(...args),
}));

const { GET } = await import("@/app/api/todos/route");

const sampleTodo: Todo = {
  id: "todo-1",
  todoDate: "2026-07-19",
  content: "資料作成",
  status: "unset",
  carriedOverFromId: null,
  createdAt: "2026-07-19T00:00:00.000Z",
  updatedAt: "2026-07-19T00:00:00.000Z",
};

function makeRequest(url: string): NextRequest {
  return new NextRequest(new URL(url, "http://localhost"));
}

describe("GET /api/todos", () => {
  beforeEach(() => {
    getTodosByDateService.mockReset();
  });

  it("dateクエリパラメータで指定日のTodo一覧を返す", async () => {
    getTodosByDateService.mockResolvedValue([sampleTodo]);

    const response = await GET(makeRequest("/api/todos?date=2026-07-19"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ status: "ok", data: [sampleTodo] });
    expect(getTodosByDateService).toHaveBeenCalledWith("2026-07-19");
  });

  it("dateクエリパラメータが無い場合は400", async () => {
    const response = await GET(makeRequest("/api/todos"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.status).toBe("error");
    expect(getTodosByDateService).not.toHaveBeenCalled();
  });

  it("不正な日付形式(ValidationError)は400", async () => {
    getTodosByDateService.mockRejectedValue(
      new ValidationError([{ field: "date", message: "日付の形式が不正です" }])
    );

    const response = await GET(makeRequest("/api/todos?date=invalid"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      status: "error",
      message: "入力内容を確認してください",
      errors: [{ field: "date", message: "日付の形式が不正です" }],
    });
  });

  it("予期しないエラーは500", async () => {
    getTodosByDateService.mockRejectedValue(new Error("DB down"));

    const response = await GET(makeRequest("/api/todos?date=2026-07-19"));

    expect(response.status).toBe(500);
  });
});
