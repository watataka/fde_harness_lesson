import { describe, expect, it } from "vitest";
import {
  TODO_CONTENT_MAX_LENGTH,
  ValidationError,
  isValidDateString,
  isValidTimeString,
  validateSettingsTimes,
  validateTodoContent,
  validateTodoStatus,
} from "@/lib/validation/rules";

// 代表入力と期待性質(property)を一覧化した評価スクリプト。
// tests/unit/validation-rules.test.ts の網羅的な単体テストとは別に、
// 「主要な入力クラスに対してどんな性質が保証されるべきか」を一目で見渡せる形にまとめたもの。
// 実行: npm run eval

describe("[eval] isValidDateString: 代表入力と期待性質", () => {
  const cases: { input: string; expected: boolean; note: string }[] = [
    { input: "2026-07-19", expected: true, note: "通常の日付" },
    { input: "2024-02-29", expected: true, note: "うるう年の2/29" },
    { input: "2023-02-29", expected: false, note: "平年の2/29(存在しない日)" },
    { input: "2026-13-01", expected: false, note: "存在しない月" },
    { input: "2026-07-32", expected: false, note: "存在しない日" },
    { input: "2026/07/19", expected: false, note: "区切り文字違い" },
    { input: "2026-7-19", expected: false, note: "ゼロ埋めなし" },
    { input: "", expected: false, note: "空文字" },
    { input: "20260719", expected: false, note: "区切りなし" },
  ];

  it.each(cases)("$input ($note) → $expected", ({ input, expected }) => {
    expect(isValidDateString(input)).toBe(expected);
  });

  it("[property] 妥当と判定された文字列は常にYYYY-MM-DD形式である", () => {
    for (const { input, expected } of cases) {
      if (expected) expect(input).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe("[eval] isValidTimeString: 代表入力と期待性質", () => {
  const cases: { input: string; expected: boolean; note: string }[] = [
    { input: "00:00", expected: true, note: "最小値" },
    { input: "23:59", expected: true, note: "最大値" },
    { input: "09:00", expected: true, note: "典型値" },
    { input: "24:00", expected: false, note: "時が範囲外" },
    { input: "12:60", expected: false, note: "分が範囲外" },
    { input: "9:00", expected: false, note: "ゼロ埋めなし" },
    { input: "", expected: false, note: "空文字" },
  ];

  it.each(cases)("$input ($note) → $expected", ({ input, expected }) => {
    expect(isValidTimeString(input)).toBe(expected);
  });
});

describe("[eval] validateTodoContent: 代表入力と期待性質", () => {
  const validCases: { input: string; expectedOutput: string; note: string }[] = [
    { input: "資料作成", expectedOutput: "資料作成", note: "通常の日本語文字列" },
    { input: "  資料作成  ", expectedOutput: "資料作成", note: "前後空白はtrimされる" },
    { input: "あ".repeat(TODO_CONTENT_MAX_LENGTH), expectedOutput: "あ".repeat(TODO_CONTENT_MAX_LENGTH), note: "ちょうど上限文字数" },
    { input: "a", expectedOutput: "a", note: "1文字" },
  ];

  it.each(validCases)("$note", ({ input, expectedOutput }) => {
    expect(validateTodoContent(input)).toBe(expectedOutput);
  });

  const invalidCases: { input: string; note: string }[] = [
    { input: "", note: "空文字(AC-1.5)" },
    { input: "   ", note: "空白のみ(AC-1.6)" },
    { input: "あ".repeat(TODO_CONTENT_MAX_LENGTH + 1), note: "上限+1文字" },
  ];

  it.each(invalidCases)("$note → ValidationErrorを投げる", ({ input }) => {
    expect(() => validateTodoContent(input)).toThrow(ValidationError);
  });

  it("[property] 検証を通過した値は常にtrim済みで、上限文字数以内である", () => {
    for (const { input } of validCases) {
      const result = validateTodoContent(input);
      expect(result).toBe(result.trim());
      expect(result.length).toBeLessThanOrEqual(TODO_CONTENT_MAX_LENGTH);
    }
  });
});

describe("[eval] validateTodoStatus: 代表入力と期待性質", () => {
  const validCases = ["not_started", "completed", "continuing"] as const;

  it.each(validCases)("%s はそのまま返る", (status) => {
    expect(validateTodoStatus(status)).toBe(status);
  });

  const invalidCases = ["unset", "", "done", "COMPLETED", "not-started"];

  it.each(invalidCases)("'%s' はValidationErrorを投げる(ユーザーが選択できない値)", (status) => {
    expect(() => validateTodoStatus(status)).toThrow(ValidationError);
  });
});

describe("[eval] validateSettingsTimes: 代表入力と期待性質", () => {
  const passCases: [string, string, string][] = [
    ["09:00", "18:00", "典型的な就業時間"],
    ["00:00", "23:59", "1日のほぼ全域"],
    ["09:00", "09:01", "1分差(最小の正常範囲)"],
  ];

  it.each(passCases)("morning=%s, evening=%s (%s) → 通過する", (morning, evening) => {
    expect(() => validateSettingsTimes(morning, evening)).not.toThrow();
  });

  const failCases: [string, string, string][] = [
    ["18:00", "09:00", "終了が開始より前"],
    ["09:00", "09:00", "同時刻(異常系No.6は同時刻を含むと明記)"],
    ["", "18:00", "開始が空欄"],
    ["09:00", "", "終了が空欄"],
    ["9時", "18:00", "開始の形式不正"],
  ];

  it.each(failCases)("morning=%s, evening=%s (%s) → ValidationErrorを投げる", (morning, evening) => {
    expect(() => validateSettingsTimes(morning, evening)).toThrow(ValidationError);
  });
});
