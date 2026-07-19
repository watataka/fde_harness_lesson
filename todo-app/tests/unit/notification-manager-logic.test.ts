import { describe, expect, it } from "vitest";
import {
  isWeekend,
  readCookie,
  shouldFireEndNotification,
  shouldFireStartNotification,
  shouldShowDeniedBanner,
  shouldShowNoTodosBanner,
} from "@/components/notification-manager";
import type { Settings, Todo } from "@/types";

function makeSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    morningTime: "09:00:00",
    eveningTime: "18:00:00",
    weekendNotificationEnabled: false,
    lastCarryoverDate: null,
    lastStartNotifiedDate: null,
    lastEndNotifiedDate: null,
    updatedAt: "2026-07-19T00:00:00.000Z",
    ...overrides,
  };
}

function makeTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: "todo-1",
    todoDate: "2026-07-19",
    content: "資料作成",
    status: "unset",
    carriedOverFromId: null,
    createdAt: "2026-07-19T00:00:00.000Z",
    updatedAt: "2026-07-19T00:00:00.000Z",
    ...overrides,
  };
}

// 2026-07-19は日曜日、2026-07-20は月曜日(平日)
const SUNDAY = "2026-07-19";
const MONDAY = "2026-07-20";

describe("readCookie", () => {
  it("指定した名前のCookie値を返す", () => {
    expect(readCookie("a=1; local-date=2026-07-19; b=2", "local-date")).toBe("2026-07-19");
  });

  it("存在しない場合はnull", () => {
    expect(readCookie("a=1", "local-date")).toBeNull();
  });
});

describe("isWeekend", () => {
  it("日曜日はtrue", () => {
    expect(isWeekend(SUNDAY)).toBe(true);
  });

  it("月曜日はfalse", () => {
    expect(isWeekend(MONDAY)).toBe(false);
  });
});

describe("shouldFireStartNotification", () => {
  it("時刻完全一致・未発火ならtrue", () => {
    const settings = makeSettings({ morningTime: "09:00:00" });
    expect(shouldFireStartNotification(settings, MONDAY, "09:00")).toBe(true);
  });

  it("時刻が一致しなければfalse(AC-2.2)", () => {
    const settings = makeSettings({ morningTime: "09:00:00" });
    expect(shouldFireStartNotification(settings, MONDAY, "08:59")).toBe(false);
  });

  it("morningTime未設定ならfalse(AC-2.6)", () => {
    const settings = makeSettings({ morningTime: null });
    expect(shouldFireStartNotification(settings, MONDAY, "09:00")).toBe(false);
  });

  it("本日既に発火済みならfalse(AC-2.7)", () => {
    const settings = makeSettings({ morningTime: "09:00:00", lastStartNotifiedDate: MONDAY });
    expect(shouldFireStartNotification(settings, MONDAY, "09:00")).toBe(false);
  });

  it("週末かつ週末通知OFFならfalse(spec.md 6.4)", () => {
    const settings = makeSettings({ morningTime: "09:00:00", weekendNotificationEnabled: false });
    expect(shouldFireStartNotification(settings, SUNDAY, "09:00")).toBe(false);
  });

  it("週末でも週末通知ONならtrue", () => {
    const settings = makeSettings({ morningTime: "09:00:00", weekendNotificationEnabled: true });
    expect(shouldFireStartNotification(settings, SUNDAY, "09:00")).toBe(true);
  });
});

describe("shouldFireEndNotification", () => {
  it("未設定Todoがあれば時刻一致でtrue、件数を返す(AC-4.1, AC-4.6)", () => {
    const settings = makeSettings({ eveningTime: "18:00:00" });
    const todos = [
      makeTodo({ status: "unset" }),
      makeTodo({ status: "completed" }),
      makeTodo({ status: "unset" }),
    ];
    const result = shouldFireEndNotification(settings, todos, MONDAY, "18:00");
    expect(result).toEqual({ shouldFire: true, unsetCount: 2 });
  });

  it("未設定Todoが0件ならfalse(AC-4.2)", () => {
    const settings = makeSettings({ eveningTime: "18:00:00" });
    const todos = [makeTodo({ status: "completed" }), makeTodo({ status: "not_started" })];
    expect(shouldFireEndNotification(settings, todos, MONDAY, "18:00").shouldFire).toBe(false);
  });

  it("Todoが0件ならfalse(AC-4.3、バナー側で案内する)", () => {
    const settings = makeSettings({ eveningTime: "18:00:00" });
    expect(shouldFireEndNotification(settings, [], MONDAY, "18:00").shouldFire).toBe(false);
  });

  it("本日既に発火済みならfalse(AC-4.7)", () => {
    const settings = makeSettings({ eveningTime: "18:00:00", lastEndNotifiedDate: MONDAY });
    const todos = [makeTodo({ status: "unset" })];
    expect(shouldFireEndNotification(settings, todos, MONDAY, "18:00").shouldFire).toBe(false);
  });
});

describe("shouldShowDeniedBanner", () => {
  it("denied かつ 時刻以降ならtrue(AC-2.5)", () => {
    const settings = makeSettings({ morningTime: "09:00:00" });
    expect(shouldShowDeniedBanner(settings, "denied", MONDAY, "09:05")).toBe(true);
  });

  it("時刻より前はfalse", () => {
    const settings = makeSettings({ morningTime: "09:00:00" });
    expect(shouldShowDeniedBanner(settings, "denied", MONDAY, "08:59")).toBe(false);
  });

  it("grantedならfalse", () => {
    const settings = makeSettings({ morningTime: "09:00:00" });
    expect(shouldShowDeniedBanner(settings, "granted", MONDAY, "09:05")).toBe(false);
  });

  it("settings未取得(null)ならfalse", () => {
    expect(shouldShowDeniedBanner(null, "denied", MONDAY, "09:05")).toBe(false);
  });
});

describe("shouldShowNoTodosBanner", () => {
  it("Todo0件・時刻以降ならtrue(AC-4.3)", () => {
    const settings = makeSettings({ eveningTime: "18:00:00" });
    expect(shouldShowNoTodosBanner(settings, [], MONDAY, "18:05")).toBe(true);
  });

  it("時刻より前はfalse", () => {
    const settings = makeSettings({ eveningTime: "18:00:00" });
    expect(shouldShowNoTodosBanner(settings, [], MONDAY, "17:59")).toBe(false);
  });

  it("Todoが1件以上あればfalse", () => {
    const settings = makeSettings({ eveningTime: "18:00:00" });
    expect(shouldShowNoTodosBanner(settings, [makeTodo()], MONDAY, "18:05")).toBe(false);
  });

  it("todos未取得(null)ならfalse", () => {
    const settings = makeSettings({ eveningTime: "18:00:00" });
    expect(shouldShowNoTodosBanner(settings, null, MONDAY, "18:05")).toBe(false);
  });
});
