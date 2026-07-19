// ドメイン型定義。service-layer-api.md「ドメイン型」節に対応する。

export type TodoStatus = "unset" | "not_started" | "completed" | "continuing";
// UIが選択肢として表示できるのはこのうち3つ(not_started/completed/continuing)のみ。
// 'unset'は登録直後の内部状態(spec.md 4章冒頭の用語定義)。

export interface Todo {
  id: string;
  todoDate: string; // YYYY-MM-DD
  content: string;
  status: TodoStatus;
  carriedOverFromId: string | null;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

export interface Settings {
  morningTime: string | null; // HH:mm
  eveningTime: string | null; // HH:mm
  weekendNotificationEnabled: boolean;
  lastCarryoverDate: string | null; // YYYY-MM-DD
  lastStartNotifiedDate: string | null; // YYYY-MM-DD
  lastEndNotifiedDate: string | null; // YYYY-MM-DD
  updatedAt: string;
}

export interface ValidationFieldError {
  field: string;
  message: string;
}

// Server Action / Route Handler のレスポンス形式(CLAUDE.md 4.1)
export type ActionResponse<T> =
  | { status: "ok"; data: T }
  | { status: "error"; message: string; errors?: ValidationFieldError[] };
