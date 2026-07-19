import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TodoForm from "@/components/todo-form";
import type { Todo } from "@/types";

const createTodoAction = vi.fn();
vi.mock("@/actions/todo-actions", () => ({
  createTodo: (...args: unknown[]) => createTodoAction(...args),
}));

const sampleTodo: Todo = {
  id: "todo-1",
  todoDate: "2026-07-19",
  content: "資料作成",
  status: "unset",
  carriedOverFromId: null,
  createdAt: "2026-07-19T00:00:00.000Z",
  updatedAt: "2026-07-19T00:00:00.000Z",
};

describe("TodoForm", () => {
  beforeEach(() => {
    createTodoAction.mockReset();
  });

  it("入力して登録すると createTodo が呼ばれ、成功時は入力欄がクリアされる", async () => {
    createTodoAction.mockResolvedValue({ status: "ok", data: sampleTodo });
    const user = userEvent.setup();
    render(<TodoForm />);

    const input = screen.getByLabelText("Todo入力");
    await user.type(input, "資料作成");
    await user.click(screen.getByRole("button", { name: "登録" }));

    await waitFor(() => expect(createTodoAction).toHaveBeenCalledTimes(1));
    expect(createTodoAction.mock.calls[0][1]).toBe("資料作成");
    await waitFor(() => expect(input).toHaveValue(""));
  });

  it("バリデーションエラー時はメッセージを表示し、入力欄はクリアしない(AC-1.5)", async () => {
    createTodoAction.mockResolvedValue({
      status: "error",
      message: "入力内容を確認してください",
      errors: [{ field: "content", message: "Todoを入力してください" }],
    });
    const user = userEvent.setup();
    render(<TodoForm />);

    await user.click(screen.getByRole("button", { name: "登録" }));

    expect(await screen.findByText("Todoを入力してください")).toBeInTheDocument();
  });

  it("送信中は入力欄とボタンが無効化される", async () => {
    let resolvePromise: (value: unknown) => void = () => {};
    createTodoAction.mockReturnValue(
      new Promise((resolve) => {
        resolvePromise = resolve;
      })
    );
    const user = userEvent.setup();
    render(<TodoForm />);

    await user.type(screen.getByLabelText("Todo入力"), "資料作成");
    await user.click(screen.getByRole("button", { name: "登録" }));

    expect(screen.getByLabelText("Todo入力")).toBeDisabled();
    expect(screen.getByRole("button", { name: "登録" })).toBeDisabled();

    resolvePromise({ status: "ok", data: sampleTodo });
    await waitFor(() => expect(screen.getByLabelText("Todo入力")).not.toBeDisabled());
  });
});
