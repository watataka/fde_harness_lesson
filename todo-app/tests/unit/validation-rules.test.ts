import { describe, expect, it } from "vitest";
import {
  TODO_CONTENT_MAX_LENGTH,
  ValidationError,
  isValidDateString,
  isValidTimeString,
  validateDateString,
  validateSettingsTimes,
  validateTodoContent,
  validateTodoStatus,
} from "@/lib/validation/rules";

describe("isValidDateString", () => {
  it("YYYY-MM-DD形式の実在する日付はtrue", () => {
    expect(isValidDateString("2026-07-19")).toBe(true);
  });

  it("うるう年の2/29はtrue", () => {
    expect(isValidDateString("2024-02-29")).toBe(true);
  });

  it("平年の2/29はfalse", () => {
    expect(isValidDateString("2023-02-29")).toBe(false);
  });

  it("実在しない日付(2/30)はfalse", () => {
    expect(isValidDateString("2024-02-30")).toBe(false);
  });

  it("区切り文字が違う形式はfalse", () => {
    expect(isValidDateString("2026/07/19")).toBe(false);
  });

  it("ゼロ埋めされていない形式はfalse", () => {
    expect(isValidDateString("2026-7-19")).toBe(false);
  });

  it("空文字はfalse", () => {
    expect(isValidDateString("")).toBe(false);
  });
});

describe("isValidTimeString", () => {
  it("HH:mm形式はtrue", () => {
    expect(isValidTimeString("09:00")).toBe(true);
    expect(isValidTimeString("00:00")).toBe(true);
    expect(isValidTimeString("23:59")).toBe(true);
  });

  it("24:00はfalse", () => {
    expect(isValidTimeString("24:00")).toBe(false);
  });

  it("分が60以上はfalse", () => {
    expect(isValidTimeString("09:60")).toBe(false);
  });

  it("ゼロ埋めされていない時はfalse", () => {
    expect(isValidTimeString("9:00")).toBe(false);
  });

  it("空文字はfalse", () => {
    expect(isValidTimeString("")).toBe(false);
  });
});

describe("validateDateString", () => {
  it("有効な日付ではエラーを投げない", () => {
    expect(() => validateDateString("2026-07-19")).not.toThrow();
  });

  it("不正な日付ではValidationErrorを投げ、指定したfield名を使う", () => {
    try {
      validateDateString("invalid", "todoDate");
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      expect((e as ValidationError).errors).toEqual([
        { field: "todoDate", message: "日付の形式が不正です" },
      ]);
    }
  });
});

describe("validateTodoContent", () => {
  it("前後の空白をtrimして返す", () => {
    expect(validateTodoContent("  資料作成  ")).toBe("資料作成");
  });

  it("空文字はエラー(AC-1.5)", () => {
    expect(() => validateTodoContent("")).toThrow(ValidationError);
    try {
      validateTodoContent("");
    } catch (e) {
      expect((e as ValidationError).errors).toEqual([
        { field: "content", message: "Todoを入力してください" },
      ]);
    }
  });

  it("空白のみはエラー(AC-1.6)", () => {
    expect(() => validateTodoContent("   ")).toThrow(ValidationError);
  });

  it(`ちょうど${TODO_CONTENT_MAX_LENGTH}文字は許可される`, () => {
    const content = "あ".repeat(TODO_CONTENT_MAX_LENGTH);
    expect(validateTodoContent(content)).toBe(content);
  });

  it(`${TODO_CONTENT_MAX_LENGTH + 1}文字はエラー`, () => {
    const content = "あ".repeat(TODO_CONTENT_MAX_LENGTH + 1);
    try {
      validateTodoContent(content);
      expect.unreachable();
    } catch (e) {
      expect((e as ValidationError).errors).toEqual([
        { field: "content", message: `${TODO_CONTENT_MAX_LENGTH}文字以内で入力してください` },
      ]);
    }
  });

  it("trim後に50文字であれば、trim前が50文字を超えていても許可される", () => {
    const content = `  ${"あ".repeat(TODO_CONTENT_MAX_LENGTH)}  `;
    expect(validateTodoContent(content)).toBe("あ".repeat(TODO_CONTENT_MAX_LENGTH));
  });
});

describe("validateTodoStatus", () => {
  it.each(["not_started", "completed", "continuing"] as const)(
    "%sはそのまま返される",
    (status) => {
      expect(validateTodoStatus(status)).toBe(status);
    }
  );

  it("'unset'はランタイムで拒否される(ユーザーが選択できる値ではないため)", () => {
    expect(() => validateTodoStatus("unset")).toThrow(ValidationError);
  });

  it("不正な文字列はエラー", () => {
    expect(() => validateTodoStatus("done")).toThrow(ValidationError);
  });
});

describe("validateSettingsTimes", () => {
  it("evening > morningであればエラーを投げない", () => {
    expect(() => validateSettingsTimes("09:00", "18:00")).not.toThrow();
  });

  it("morningTimeが空欄ならエラー", () => {
    try {
      validateSettingsTimes("", "18:00");
      expect.unreachable();
    } catch (e) {
      expect((e as ValidationError).errors).toEqual([
        { field: "morningTime", message: "時刻を入力してください" },
      ]);
    }
  });

  it("eveningTimeが空欄ならエラー", () => {
    try {
      validateSettingsTimes("09:00", "");
      expect.unreachable();
    } catch (e) {
      expect((e as ValidationError).errors).toEqual([
        { field: "eveningTime", message: "時刻を入力してください" },
      ]);
    }
  });

  it("両方空欄なら両方のエラーが返る", () => {
    try {
      validateSettingsTimes("", "");
      expect.unreachable();
    } catch (e) {
      expect((e as ValidationError).errors).toHaveLength(2);
    }
  });

  it("evening == morning(同時刻)はエラー(異常系No.6)", () => {
    try {
      validateSettingsTimes("09:00", "09:00");
      expect.unreachable();
    } catch (e) {
      expect((e as ValidationError).errors).toEqual([
        {
          field: "eveningTime",
          message: "就業終了時刻は就業開始時刻より後に設定してください",
        },
      ]);
    }
  });

  it("evening < morningはエラー(異常系No.6)", () => {
    expect(() => validateSettingsTimes("18:00", "09:00")).toThrow(ValidationError);
  });

  it("形式が不正な場合は時刻比較の前に形式エラーを返す", () => {
    try {
      validateSettingsTimes("9時", "18:00");
      expect.unreachable();
    } catch (e) {
      expect((e as ValidationError).errors).toEqual([
        { field: "morningTime", message: "時刻の形式が不正です" },
      ]);
    }
  });
});
