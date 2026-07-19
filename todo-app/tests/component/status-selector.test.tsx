import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StatusSelector from "@/components/status-selector";
import type { Todo } from "@/types";

const updateTodoStatusAction = vi.fn();
vi.mock("@/actions/todo-actions", () => ({
  updateTodoStatus: (...args: unknown[]) => updateTodoStatusAction(...args),
}));

let mockHighlight = false;
vi.mock("@/components/notification-manager", () => ({
  useHighlight: () => mockHighlight,
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

describe("StatusSelector", () => {
  beforeEach(() => {
    updateTodoStatusAction.mockReset();
    mockHighlight = false;
  });

  it("3つのステータスボタンを表示する", () => {
    render(<StatusSelector todo={sampleTodo} />);

    expect(screen.getByRole("button", { name: "未着手" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "完了" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "継続" })).toBeInTheDocument();
  });

  it("ボタンをクリックするとupdateTodoStatusが呼ばれる(AC-3.1)", async () => {
    updateTodoStatusAction.mockResolvedValue({
      status: "ok",
      data: { ...sampleTodo, status: "completed" },
    });
    const user = userEvent.setup();
    render(<StatusSelector todo={sampleTodo} />);

    await user.click(screen.getByRole("button", { name: "完了" }));

    await waitFor(() =>
      expect(updateTodoStatusAction).toHaveBeenCalledWith("todo-1", "completed")
    );
  });

  it("現在のステータスと同じボタンをクリックしても呼ばれない", async () => {
    const user = userEvent.setup();
    render(<StatusSelector todo={{ ...sampleTodo, status: "completed" }} />);

    await user.click(screen.getByRole("button", { name: "完了" }));

    expect(updateTodoStatusAction).not.toHaveBeenCalled();
  });

  it("現在のステータスのボタンはaria-pressed=trueになる(AC-3.3)", () => {
    render(<StatusSelector todo={{ ...sampleTodo, status: "not_started" }} />);

    expect(screen.getByRole("button", { name: "未着手" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: "完了" })).toHaveAttribute("aria-pressed", "false");
  });

  it("エラー時はメッセージを表示する", async () => {
    updateTodoStatusAction.mockResolvedValue({
      status: "error",
      message: "他の操作により更新されています。最新の状態を確認してください",
    });
    const user = userEvent.setup();
    render(<StatusSelector todo={sampleTodo} />);

    await user.click(screen.getByRole("button", { name: "完了" }));

    expect(
      await screen.findByText("他の操作により更新されています。最新の状態を確認してください")
    ).toBeInTheDocument();
  });

  it("ハイライト対象(未設定Todo かつ highlight=true)のとき強調表示される(AC-4.4)", () => {
    mockHighlight = true;
    const { container } = render(<StatusSelector todo={sampleTodo} />);

    expect(container.querySelector("li")?.className).toMatch(/highlighted/);
  });

  it("highlight=trueでも未設定でなければ強調表示されない", () => {
    mockHighlight = true;
    const { container } = render(
      <StatusSelector todo={{ ...sampleTodo, status: "completed" }} />
    );

    expect(container.querySelector("li")?.className).not.toMatch(/highlighted/);
  });
});
