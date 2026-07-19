"use server";

import { revalidatePath } from "next/cache";
import {
  updateSettings as updateSettingsService,
  markStartNotificationSent as markStartNotificationSentService,
  markEndNotificationSent as markEndNotificationSentService,
  type UpdateSettingsInput,
} from "@/lib/services/setting-service";
import { ValidationError } from "@/lib/validation/rules";
import type { ActionResponse, Settings } from "@/types";

function toErrorResponse(e: unknown): ActionResponse<never> {
  if (e instanceof ValidationError) {
    return { status: "error", message: "入力内容を確認してください", errors: e.errors };
  }
  console.error(e);
  return { status: "error", message: "予期しないエラーが発生しました" };
}

export async function updateSettings(
  input: UpdateSettingsInput
): Promise<ActionResponse<Settings>> {
  try {
    const settings = await updateSettingsService(input);
    revalidatePath("/settings");
    return { status: "ok", data: settings };
  } catch (e) {
    return toErrorResponse(e);
  }
}

// notification-manager.tsxから、実際にプッシュ通知を送信した直後にのみ呼ばれる
// (notification-logic.md)。画面表示に直接影響しないためrevalidatePathは不要。
export async function markStartNotificationSent(date: string): Promise<ActionResponse<void>> {
  try {
    await markStartNotificationSentService(date);
    return { status: "ok", data: undefined };
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function markEndNotificationSent(date: string): Promise<ActionResponse<void>> {
  try {
    await markEndNotificationSentService(date);
    return { status: "ok", data: undefined };
  } catch (e) {
    return toErrorResponse(e);
  }
}
