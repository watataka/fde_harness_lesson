import { NextResponse, type NextRequest } from "next/server";
import { getTodosByDate } from "@/lib/services/todo-service";
import { ValidationError } from "@/lib/validation/rules";
import type { ActionResponse, Todo } from "@/types";

// Client Component(notification-manager.tsx)のポーリング専用。読み取り専用で
// ビジネスロジックを持たない薄いラッパー(CLAUDE.md 1.1)。`date`はブラウザの
// ローカル日付をクライアントが計算してクエリパラメータで渡す(notification-logic.md)。
export async function GET(request: NextRequest): Promise<NextResponse<ActionResponse<Todo[]>>> {
  const date = request.nextUrl.searchParams.get("date");

  if (!date) {
    return NextResponse.json(
      { status: "error", message: "dateクエリパラメータは必須です" },
      { status: 400 }
    );
  }

  try {
    const todos = await getTodosByDate(date);
    return NextResponse.json({ status: "ok", data: todos });
  } catch (e) {
    if (e instanceof ValidationError) {
      return NextResponse.json(
        { status: "error", message: "入力内容を確認してください", errors: e.errors },
        { status: 400 }
      );
    }
    console.error(e);
    return NextResponse.json(
      { status: "error", message: "予期しないエラーが発生しました" },
      { status: 500 }
    );
  }
}
