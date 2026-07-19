import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import TodoList from "@/components/todo-list";
import type { Todo } from "@/types";

vi.mock("@/actions/todo-actions", () => ({
  updateTodoStatus: vi.fn(),
}));

vi.mock("@/components/notification-manager", () => ({
  useHighlight: () => false,
}));

function makeTodo(id: string, content: string): Todo {
  return {
    id,
    todoDate: "2026-07-19",
    content,
    status: "unset",
    carriedOverFromId: null,
    createdAt: "2026-07-19T00:00:00.000Z",
    updatedAt: "2026-07-19T00:00:00.000Z",
  };
}

describe("TodoList", () => {
  it("渡されたTodoの数だけ行を描画する(AC-1.2, AC-1.3)", () => {
    const todos = [makeTodo("1", "資料作成"), makeTodo("2", "会議準備")];
    render(<TodoList todos={todos} />);

    expect(screen.getByText("資料作成")).toBeInTheDocument();
    expect(screen.getByText("会議準備")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("Todoが0件なら何も描画しない", () => {
    render(<TodoList todos={[]} />);

    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });
});
