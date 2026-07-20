import { describe, expect, it } from "vitest";
import {
  isWeekend,
  shouldFireEndNotification,
  shouldFireStartNotification,
  shouldShowDeniedBanner,
  shouldShowNoTodosBanner,
} from "@/components/notification-manager";
import type { Settings, Todo } from "@/types";

// 代表入力と期待性質(property)を一覧化した評価スクリプト(主要な入力クラスの網羅的サンプリング用)。
// tests/unit/notification-manager-logic.test.ts の網羅的な単体テストとは別に、
// 通知判定ロジックが満たすべき性質を一目で見渡せる形にまとめたもの。
// 実行: npm run eval
//
// 実際に発生したバグの回帰ケースは evals/regressions.eval.ts に集約する(このファイルには追加しない)。

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

function makeTodo(status: Todo["status"]): Todo {
  return {
    id: "t",
    todoDate: "2026-07-20",
    content: "x",
    status,
    carriedOverFromId: null,
    createdAt: "2026-07-20T00:00:00.000Z",
    updatedAt: "2026-07-20T00:00:00.000Z",
  };
}

const MONDAY = "2026-07-20"; // 平日
const SUNDAY = "2026-07-19"; // 週末

describe("[eval] shouldFireStartNotification: 代表入力と期待性質", () => {
  const cases: { note: string; s: Settings; today: string; now: string; expected: boolean }[] = [
    { note: "時刻完全一致・未発火(AC-2.1)", s: makeSettings(), today: MONDAY, now: "09:00", expected: true },
    { note: "1分前(AC-2.2)", s: makeSettings(), today: MONDAY, now: "08:59", expected: false },
    { note: "1分後(完全一致のみ発火)", s: makeSettings(), today: MONDAY, now: "09:01", expected: false },
    {
      note: "時刻未設定(AC-2.6)",
      s: makeSettings({ morningTime: null }),
      today: MONDAY,
      now: "09:00",
      expected: false,
    },
    {
      note: "本日発火済み(AC-2.7)",
      s: makeSettings({ lastStartNotifiedDate: MONDAY }),
      today: MONDAY,
      now: "09:00",
      expected: false,
    },
    {
      note: "前日発火済みは本日の対象外",
      s: makeSettings({ lastStartNotifiedDate: SUNDAY }),
      today: MONDAY,
      now: "09:00",
      expected: true,
    },
    {
      note: "週末・週末通知OFF(spec.md 6.4)",
      s: makeSettings({ weekendNotificationEnabled: false }),
      today: SUNDAY,
      now: "09:00",
      expected: false,
    },
    {
      note: "週末・週末通知ON",
      s: makeSettings({ weekendNotificationEnabled: true }),
      today: SUNDAY,
      now: "09:00",
      expected: true,
    },
  ];

  it.each(cases)("$note → $expected", ({ s, today, now, expected }) => {
    expect(shouldFireStartNotification(s, today, now)).toBe(expected);
  });
});

describe("[eval] shouldFireEndNotification: 代表入力と期待性質", () => {
  const cases: {
    note: string;
    s: Settings;
    todos: Todo[];
    now: string;
    expectedFire: boolean;
    expectedCount: number;
  }[] = [
    {
      note: "未設定2件で発火し件数も一致(AC-4.1, AC-4.6)",
      s: makeSettings(),
      todos: [makeTodo("unset"), makeTodo("unset"), makeTodo("completed")],
      now: "18:00",
      expectedFire: true,
      expectedCount: 2,
    },
    {
      note: "全件入力済みなら発火しない(AC-4.2)",
      s: makeSettings(),
      todos: [makeTodo("completed"), makeTodo("not_started")],
      now: "18:00",
      expectedFire: false,
      expectedCount: 0,
    },
    {
      note: "Todo0件でも発火しない(AC-4.3、案内はバナー側の責務)",
      s: makeSettings(),
      todos: [],
      now: "18:00",
      expectedFire: false,
      expectedCount: 0,
    },
    {
      note: "本日発火済み(AC-4.7)",
      s: makeSettings({ lastEndNotifiedDate: MONDAY }),
      todos: [makeTodo("unset")],
      now: "18:00",
      expectedFire: false,
      expectedCount: 1,
    },
  ];

  it.each(cases)("$note", ({ s, todos, now, expectedFire, expectedCount }) => {
    const result = shouldFireEndNotification(s, todos, MONDAY, now);
    expect(result.shouldFire).toBe(expectedFire);
    expect(result.unsetCount).toBe(expectedCount);
  });

  it("[property] unsetCountは常にtodos中のstatus==='unset'の件数と一致する", () => {
    const todos = [
      makeTodo("unset"),
      makeTodo("unset"),
      makeTodo("unset"),
      makeTodo("completed"),
      makeTodo("not_started"),
    ];
    const result = shouldFireEndNotification(makeSettings(), todos, MONDAY, "18:00");
    expect(result.unsetCount).toBe(3);
  });
});

describe("[eval] 状態バナー(denied案内・0件案内): 代表入力と期待性質", () => {
  it.each([
    { note: "denied + 時刻超過 → 表示(AC-2.5)", permission: "denied" as const, now: "09:05", expected: true },
    { note: "denied + 時刻前 → 非表示", permission: "denied" as const, now: "08:55", expected: false },
    { note: "granted → 非表示", permission: "granted" as const, now: "09:05", expected: false },
  ])("$note", ({ permission, now, expected }) => {
    expect(shouldShowDeniedBanner(makeSettings(), permission, MONDAY, now)).toBe(expected);
  });

  it.each([
    { note: "0件 + 時刻超過 → 表示(AC-4.3)", todos: [] as Todo[], now: "18:05", expected: true },
    { note: "0件 + 時刻前 → 非表示", todos: [] as Todo[], now: "17:55", expected: false },
    { note: "1件以上 → 非表示", todos: [makeTodo("unset")], now: "18:05", expected: false },
  ])("$note", ({ todos, now, expected }) => {
    expect(shouldShowNoTodosBanner(makeSettings(), todos, MONDAY, now)).toBe(expected);
  });
});

describe("[eval] isWeekend: 代表入力と期待性質", () => {
  it.each([
    { input: SUNDAY, expected: true, note: "日曜" },
    { input: MONDAY, expected: false, note: "月曜" },
    { input: "2026-07-25", expected: true, note: "土曜" },
  ])("$input ($note) → $expected", ({ input, expected }) => {
    expect(isWeekend(input)).toBe(expected);
  });
});
