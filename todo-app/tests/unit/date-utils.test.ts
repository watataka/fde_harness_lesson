import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getLocalDateString } from "@/lib/date-utils";

describe("getLocalDateString", () => {
  it("YYYY-MM-DD形式にフォーマットする", () => {
    expect(getLocalDateString(new Date(2026, 6, 19))).toBe("2026-07-19");
  });

  it("月・日を2桁ゼロ埋めする", () => {
    expect(getLocalDateString(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("年末日も正しくフォーマットする", () => {
    expect(getLocalDateString(new Date(2026, 11, 31))).toBe("2026-12-31");
  });

  describe("引数省略時", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 6, 19, 23, 59));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("現在のローカル日付を使う", () => {
      expect(getLocalDateString()).toBe("2026-07-19");
    });
  });
});
