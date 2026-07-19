import { supabaseServer } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import type { Settings } from "@/types";
import { validateDateString, validateSettingsTimes } from "@/lib/validation/rules";

// idはドメイン型Settingsに含めない(シングルトンのため)。selectするカラムと型を一致させる。
type SettingsRow = Omit<Database["public"]["Tables"]["settings"]["Row"], "id">;

const SETTINGS_COLUMNS =
  "morning_time, evening_time, weekend_notification_enabled, last_carryover_date, last_start_notified_date, last_end_notified_date, updated_at";

function mapSettingsRow(row: SettingsRow): Settings {
  return {
    morningTime: row.morning_time,
    eveningTime: row.evening_time,
    weekendNotificationEnabled: row.weekend_notification_enabled,
    lastCarryoverDate: row.last_carryover_date,
    lastStartNotifiedDate: row.last_start_notified_date,
    lastEndNotifiedDate: row.last_end_notified_date,
    updatedAt: row.updated_at,
  };
}

/** settingsテーブルはid=1のシングルトン(db-schema.md)。 */
export async function getSettings(): Promise<Settings> {
  const { data, error } = await supabaseServer
    .from("settings")
    .select(SETTINGS_COLUMNS)
    .eq("id", 1)
    .single();

  if (error || !data) {
    console.error(error);
    throw new Error("設定の取得に失敗しました");
  }
  return mapSettingsRow(data);
}

export interface UpdateSettingsInput {
  morningTime: string;
  eveningTime: string;
  weekendNotificationEnabled: boolean;
}

export async function updateSettings(input: UpdateSettingsInput): Promise<Settings> {
  validateSettingsTimes(input.morningTime, input.eveningTime);

  const { data, error } = await supabaseServer
    .from("settings")
    .update({
      morning_time: input.morningTime,
      evening_time: input.eveningTime,
      weekend_notification_enabled: input.weekendNotificationEnabled,
    })
    .eq("id", 1)
    .select(SETTINGS_COLUMNS)
    .single();

  if (error || !data) {
    console.error(error);
    throw new Error("設定の更新に失敗しました");
  }
  return mapSettingsRow(data);
}

/** 就業開始通知を実際に送信した日付を記録する(notification-logic.md)。冪等。 */
export async function markStartNotificationSent(date: string): Promise<void> {
  validateDateString(date);
  const { error } = await supabaseServer
    .from("settings")
    .update({ last_start_notified_date: date })
    .eq("id", 1);

  if (error) {
    console.error(error);
    throw new Error("通知済み日時の更新に失敗しました");
  }
}

/** 就業終了通知を実際に送信した日付を記録する(notification-logic.md)。冪等。 */
export async function markEndNotificationSent(date: string): Promise<void> {
  validateDateString(date);
  const { error } = await supabaseServer
    .from("settings")
    .update({ last_end_notified_date: date })
    .eq("id", 1);

  if (error) {
    console.error(error);
    throw new Error("通知済み日時の更新に失敗しました");
  }
}
