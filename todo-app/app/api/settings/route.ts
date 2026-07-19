import { NextResponse } from "next/server";
import { getSettings } from "@/lib/services/setting-service";
import type { ActionResponse, Settings } from "@/types";

// Client Component(notification-manager.tsx)のポーリング専用。読み取り専用の薄いラッパー
// (CLAUDE.md 1.1)。settingsはシングルトンのためクエリパラメータは不要。
export async function GET(): Promise<NextResponse<ActionResponse<Settings>>> {
  try {
    const settings = await getSettings();
    return NextResponse.json({ status: "ok", data: settings });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { status: "error", message: "予期しないエラーが発生しました" },
      { status: 500 }
    );
  }
}
