import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFakeSupabaseClient,
  seedDefaultSettings,
  type FakeSupabaseClient,
} from "./helpers/fake-supabase-client";
import { ValidationError } from "@/lib/validation/rules";
import {
  getSettings,
  updateSettings,
  markStartNotificationSent,
  markEndNotificationSent,
} from "@/lib/services/setting-service";

let fakeClient: FakeSupabaseClient;

vi.mock("@/lib/supabase/server", () => ({
  get supabaseServer() {
    return fakeClient;
  },
}));

describe("setting-service", () => {
  beforeEach(() => {
    fakeClient = createFakeSupabaseClient();
  });

  describe("getSettings", () => {
    it("シングルトン行をドメイン型にマッピングして返す", async () => {
      seedDefaultSettings(fakeClient, {
        morning_time: "09:00:00",
        evening_time: "18:00:00",
        weekend_notification_enabled: true,
      });

      const settings = await getSettings();

      expect(settings.morningTime).toBe("09:00:00");
      expect(settings.eveningTime).toBe("18:00:00");
      expect(settings.weekendNotificationEnabled).toBe(true);
    });

    it("行が存在しない場合はエラー", async () => {
      await expect(getSettings()).rejects.toThrow();
    });
  });

  describe("updateSettings", () => {
    it("有効な入力で更新される", async () => {
      seedDefaultSettings(fakeClient);

      const updated = await updateSettings({
        morningTime: "08:30",
        eveningTime: "17:30",
        weekendNotificationEnabled: true,
      });

      expect(updated.morningTime).toBe("08:30");
      expect(updated.eveningTime).toBe("17:30");
      expect(updated.weekendNotificationEnabled).toBe(true);
    });

    it("evening<=morningはValidationErrorで、DBは更新されない(異常系No.6)", async () => {
      seedDefaultSettings(fakeClient, {
        morning_time: "09:00",
        evening_time: "18:00",
      });

      await expect(
        updateSettings({
          morningTime: "18:00",
          eveningTime: "09:00",
          weekendNotificationEnabled: false,
        })
      ).rejects.toThrow(ValidationError);

      expect(fakeClient.tables.settings.rows[0].morning_time).toBe("09:00");
    });

    it("空欄はValidationError", async () => {
      seedDefaultSettings(fakeClient);
      await expect(
        updateSettings({ morningTime: "", eveningTime: "18:00", weekendNotificationEnabled: false })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("markStartNotificationSent / markEndNotificationSent", () => {
    it("markStartNotificationSentはlast_start_notified_dateのみ更新する", async () => {
      seedDefaultSettings(fakeClient);

      await markStartNotificationSent("2026-07-19");

      const row = fakeClient.tables.settings.rows[0];
      expect(row.last_start_notified_date).toBe("2026-07-19");
      expect(row.last_end_notified_date).toBeNull();
    });

    it("markEndNotificationSentはlast_end_notified_dateのみ更新する", async () => {
      seedDefaultSettings(fakeClient);

      await markEndNotificationSent("2026-07-19");

      const row = fakeClient.tables.settings.rows[0];
      expect(row.last_end_notified_date).toBe("2026-07-19");
      expect(row.last_start_notified_date).toBeNull();
    });

    it("不正な日付形式はValidationError", async () => {
      seedDefaultSettings(fakeClient);
      await expect(markStartNotificationSent("19-07-2026")).rejects.toThrow(ValidationError);
    });

    it("同じ日付での複数回呼び出しは冪等", async () => {
      seedDefaultSettings(fakeClient);

      await markStartNotificationSent("2026-07-19");
      await markStartNotificationSent("2026-07-19");

      expect(fakeClient.tables.settings.rows).toHaveLength(1);
      expect(fakeClient.tables.settings.rows[0].last_start_notified_date).toBe("2026-07-19");
    });
  });
});
