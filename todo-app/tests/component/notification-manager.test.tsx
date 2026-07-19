import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import NotificationManager from "@/components/notification-manager";
import type { Settings, Todo } from "@/types";

const routerPush = vi.fn();
const routerRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, refresh: routerRefresh }),
}));

const initializeTodayAction = vi.fn();
vi.mock("@/actions/todo-actions", () => ({
  initializeToday: (...args: unknown[]) => initializeTodayAction(...args),
}));

const markStartNotificationSentAction = vi.fn();
const markEndNotificationSentAction = vi.fn();
vi.mock("@/actions/setting-actions", () => ({
  markStartNotificationSent: (...args: unknown[]) => markStartNotificationSentAction(...args),
  markEndNotificationSent: (...args: unknown[]) => markEndNotificationSentAction(...args),
}));

function makeSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    morningTime: "09:00:00",
    eveningTime: "18:00:00",
    // 平日判定の影響を排除して時刻条件だけをテストするため既定で有効にしておく
    weekendNotificationEnabled: true,
    lastCarryoverDate: null,
    lastStartNotifiedDate: null,
    lastEndNotifiedDate: null,
    updatedAt: "2026-07-19T00:00:00.000Z",
    ...overrides,
  };
}

function mockFetchResponses(settings: Settings, todos: Todo[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (url.startsWith("/api/settings")) {
        return Promise.resolve({ json: () => Promise.resolve({ status: "ok", data: settings }) });
      }
      if (url.startsWith("/api/todos")) {
        return Promise.resolve({ json: () => Promise.resolve({ status: "ok", data: todos }) });
      }
      throw new Error(`unexpected fetch: ${url}`);
    })
  );
}

describe("NotificationManager", () => {
  beforeEach(() => {
    routerPush.mockReset();
    routerRefresh.mockReset();
    initializeTodayAction.mockReset();
    initializeTodayAction.mockResolvedValue({ status: "ok", data: undefined });
    markStartNotificationSentAction.mockReset();
    markStartNotificationSentAction.mockResolvedValue({ status: "ok", data: undefined });
    markEndNotificationSentAction.mockReset();
    markEndNotificationSentAction.mockResolvedValue({ status: "ok", data: undefined });
    // Dateだけ偽装する。setTimeout/setIntervalまで偽装するとReact Testing Libraryの
    // waitFor/findByが内部で使うタイマーも止まりテストがタイムアウトしてしまうため。
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 6, 20, 10, 0)); // 2026-07-20(月)10:00
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("childrenを描画する", () => {
    mockFetchResponses(makeSettings(), []);
    render(
      <NotificationManager>
        <p>content</p>
      </NotificationManager>
    );
    expect(screen.getByText("content")).toBeInTheDocument();
  });

  it("マウント時に/api/settingsと/api/todosをポーリングする", async () => {
    mockFetchResponses(makeSettings(), []);
    render(
      <NotificationManager>
        <p>content</p>
      </NotificationManager>
    );

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const calledUrls = (fetch as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: unknown[]) => c[0] as string
    );
    expect(calledUrls.some((u) => u.startsWith("/api/settings"))).toBe(true);
    expect(calledUrls.some((u) => u.startsWith("/api/todos?date="))).toBe(true);
  });

  it("通知許可がdeniedかつ就業開始時刻を過ぎていれば案内バナーを表示する(AC-2.5)", async () => {
    vi.stubGlobal("Notification", { permission: "denied" });
    mockFetchResponses(makeSettings({ morningTime: "09:00:00" }), []);

    render(
      <NotificationManager>
        <p>content</p>
      </NotificationManager>
    );

    expect(
      await screen.findByText("通知が無効です。ブラウザの設定で通知を許可してください")
    ).toBeInTheDocument();
  });

  it("就業終了時刻を過ぎてTodoが0件なら案内バナーを表示する(AC-4.3)", async () => {
    vi.stubGlobal("Notification", { permission: "granted" });
    vi.setSystemTime(new Date(2026, 6, 20, 18, 5));
    mockFetchResponses(makeSettings({ eveningTime: "18:00:00" }), []);

    render(
      <NotificationManager>
        <p>content</p>
      </NotificationManager>
    );

    expect(await screen.findByText("本日のTodoが登録されていません")).toBeInTheDocument();
  });

  it("条件を満たさない場合はバナーを表示しない", async () => {
    vi.stubGlobal("Notification", { permission: "granted" });
    mockFetchResponses(makeSettings(), [
      {
        id: "1",
        todoDate: "2026-07-20",
        content: "資料作成",
        status: "unset",
        carriedOverFromId: null,
        createdAt: "2026-07-20T00:00:00.000Z",
        updatedAt: "2026-07-20T00:00:00.000Z",
      },
    ]);

    render(
      <NotificationManager>
        <p>content</p>
      </NotificationManager>
    );

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(
      screen.queryByText("通知が無効です。ブラウザの設定で通知を許可してください")
    ).not.toBeInTheDocument();
    expect(screen.queryByText("本日のTodoが登録されていません")).not.toBeInTheDocument();
  });
});
