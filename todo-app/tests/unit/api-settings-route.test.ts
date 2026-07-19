import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Settings } from "@/types";

const getSettingsService = vi.fn();

vi.mock("@/lib/services/setting-service", () => ({
  getSettings: (...args: unknown[]) => getSettingsService(...args),
}));

const { GET } = await import("@/app/api/settings/route");

const sampleSettings: Settings = {
  morningTime: "09:00",
  eveningTime: "18:00",
  weekendNotificationEnabled: false,
  lastCarryoverDate: null,
  lastStartNotifiedDate: null,
  lastEndNotifiedDate: null,
  updatedAt: "2026-07-19T00:00:00.000Z",
};

describe("GET /api/settings", () => {
  beforeEach(() => {
    getSettingsService.mockReset();
  });

  it("現在の設定を返す", async () => {
    getSettingsService.mockResolvedValue(sampleSettings);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ status: "ok", data: sampleSettings });
  });

  it("予期しないエラーは500", async () => {
    getSettingsService.mockRejectedValue(new Error("DB down"));

    const response = await GET();

    expect(response.status).toBe(500);
  });
});
