import { beforeEach, describe, expect, it, vi } from "vitest";
import { ValidationError } from "@/lib/validation/rules";
import type { Settings } from "@/types";

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => revalidatePath(path),
}));

const updateSettingsService = vi.fn();
const markStartNotificationSentService = vi.fn();
const markEndNotificationSentService = vi.fn();

vi.mock("@/lib/services/setting-service", () => ({
  updateSettings: (...args: unknown[]) => updateSettingsService(...args),
  markStartNotificationSent: (...args: unknown[]) => markStartNotificationSentService(...args),
  markEndNotificationSent: (...args: unknown[]) => markEndNotificationSentService(...args),
}));

const { updateSettings, markStartNotificationSent, markEndNotificationSent } = await import(
  "@/actions/setting-actions"
);

const sampleSettings: Settings = {
  morningTime: "09:00",
  eveningTime: "18:00",
  weekendNotificationEnabled: false,
  lastCarryoverDate: null,
  lastStartNotifiedDate: null,
  lastEndNotifiedDate: null,
  updatedAt: "2026-07-19T00:00:00.000Z",
};

describe("setting-actions", () => {
  beforeEach(() => {
    revalidatePath.mockReset();
    updateSettingsService.mockReset();
    markStartNotificationSentService.mockReset();
    markEndNotificationSentService.mockReset();
  });

  describe("updateSettings", () => {
    it("成功時はokエンベロープを返し、/settingsをrevalidateする", async () => {
      updateSettingsService.mockResolvedValue(sampleSettings);

      const result = await updateSettings({
        morningTime: "09:00",
        eveningTime: "18:00",
        weekendNotificationEnabled: false,
      });

      expect(result).toEqual({ status: "ok", data: sampleSettings });
      expect(revalidatePath).toHaveBeenCalledWith("/settings");
    });

    it("ValidationError時はerrorsを含むエンベロープを返す(異常系No.6)", async () => {
      updateSettingsService.mockRejectedValue(
        new ValidationError([
          { field: "eveningTime", message: "就業終了時刻は就業開始時刻より後に設定してください" },
        ])
      );

      const result = await updateSettings({
        morningTime: "18:00",
        eveningTime: "09:00",
        weekendNotificationEnabled: false,
      });

      expect(result).toEqual({
        status: "error",
        message: "入力内容を確認してください",
        errors: [
          { field: "eveningTime", message: "就業終了時刻は就業開始時刻より後に設定してください" },
        ],
      });
      expect(revalidatePath).not.toHaveBeenCalled();
    });
  });

  describe("markStartNotificationSent / markEndNotificationSent", () => {
    it("成功時はokエンベロープを返し、revalidatePathは呼ばない(画面表示に直接影響しないため)", async () => {
      markStartNotificationSentService.mockResolvedValue(undefined);

      const result = await markStartNotificationSent("2026-07-19");

      expect(result).toEqual({ status: "ok", data: undefined });
      expect(revalidatePath).not.toHaveBeenCalled();
    });

    it("markEndNotificationSentも同様", async () => {
      markEndNotificationSentService.mockResolvedValue(undefined);

      const result = await markEndNotificationSent("2026-07-19");

      expect(result).toEqual({ status: "ok", data: undefined });
    });

    it("失敗時はerrorエンベロープを返す", async () => {
      markStartNotificationSentService.mockRejectedValue(new Error("DB down"));

      const result = await markStartNotificationSent("2026-07-19");

      expect(result.status).toBe("error");
    });
  });
});
