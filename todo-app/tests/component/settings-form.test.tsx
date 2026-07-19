import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SettingsForm from "@/components/settings-form";
import type { Settings } from "@/types";

const updateSettingsAction = vi.fn();
vi.mock("@/actions/setting-actions", () => ({
  updateSettings: (...args: unknown[]) => updateSettingsAction(...args),
}));

const sampleSettings: Settings = {
  morningTime: "09:00:00",
  eveningTime: "18:00:00",
  weekendNotificationEnabled: false,
  lastCarryoverDate: null,
  lastStartNotifiedDate: null,
  lastEndNotifiedDate: null,
  updatedAt: "2026-07-19T00:00:00.000Z",
};

describe("SettingsForm", () => {
  beforeEach(() => {
    updateSettingsAction.mockReset();
  });

  it("propsの設定値で入力欄が初期化される", () => {
    render(<SettingsForm settings={sampleSettings} />);

    expect(screen.getByLabelText("就業開始時刻")).toHaveValue("09:00");
    expect(screen.getByLabelText("就業終了時刻")).toHaveValue("18:00");
    expect(screen.getByLabelText("土日の通知を有効にする")).not.toBeChecked();
  });

  it("保存すると入力値でupdateSettingsが呼ばれる", async () => {
    updateSettingsAction.mockResolvedValue({ status: "ok", data: sampleSettings });
    const user = userEvent.setup();
    render(<SettingsForm settings={sampleSettings} />);

    await user.click(screen.getByLabelText("土日の通知を有効にする"));
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() =>
      expect(updateSettingsAction).toHaveBeenCalledWith({
        morningTime: "09:00",
        eveningTime: "18:00",
        weekendNotificationEnabled: true,
      })
    );
    expect(await screen.findByText("設定を保存しました")).toBeInTheDocument();
  });

  it("異常系No.6のバリデーションエラーをフィールドごとに表示する", async () => {
    updateSettingsAction.mockResolvedValue({
      status: "error",
      message: "入力内容を確認してください",
      errors: [
        { field: "eveningTime", message: "就業終了時刻は就業開始時刻より後に設定してください" },
      ],
    });
    const user = userEvent.setup();
    render(<SettingsForm settings={sampleSettings} />);

    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(
      await screen.findByText("就業終了時刻は就業開始時刻より後に設定してください")
    ).toBeInTheDocument();
  });
});
