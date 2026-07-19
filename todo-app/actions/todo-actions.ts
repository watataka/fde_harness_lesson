"use server";

import { revalidatePath } from "next/cache";
import {
  createTodo as createTodoService,
  updateTodoStatus as updateTodoStatusService,
  initializeTodayTodos,
  ConflictError,
} from "@/lib/services/todo-service";
import { ValidationError } from "@/lib/validation/rules";
import type { ActionResponse, Todo } from "@/types";

// CLAUDE.md 4.1のレスポンス形式。サービス層が投げる例外を3分岐で変換する
// (service-layer-api.md「共通のレスポンス形式」)。
function toErrorResponse(e: unknown): ActionResponse<never> {
  if (e instanceof ValidationError) {
    return { status: "error", message: "入力内容を確認してください", errors: e.errors };
  }
  if (e instanceof ConflictError) {
    console.error(e);
    return {
      status: "error",
      message: "他の操作により更新されています。最新の状態を確認してください",
    };
  }
  console.error(e);
  return { status: "error", message: "予期しないエラーが発生しました" };
}

export async function createTodo(date: string, content: string): Promise<ActionResponse<Todo>> {
  try {
    const todo = await createTodoService(date, content);
    revalidatePath("/");
    return { status: "ok", data: todo };
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function updateTodoStatus(
  id: string,
  status: string
): Promise<ActionResponse<Todo>> {
  try {
    const todo = await updateTodoStatusService(id, status);
    revalidatePath("/");
    return { status: "ok", data: todo };
  } catch (e) {
    if (e instanceof ConflictError) {
      // 他の操作によって実際にDBは変わっているため、最新状態を画面に反映する
      // (component-design.mdの決定)。ValidationErrorはDBに触れていないため不要。
      revalidatePath("/");
    }
    return toErrorResponse(e);
  }
}

// 繰越・クリーンアップ。クライアントが直接計算したブラウザのローカル日付でのみ呼ぶこと。
// component-design.md Rev.3: Server Componentのレンダリング経路からは呼ばない。
export async function initializeToday(date: string): Promise<ActionResponse<void>> {
  try {
    await initializeTodayTodos(date);
    revalidatePath("/");
    return { status: "ok", data: undefined };
  } catch (e) {
    return toErrorResponse(e);
  }
}
