import type { TodoStatus, ValidationFieldError } from "@/types";

// service-layer-api.md「共通のレスポンス形式」に対応するバリデーション例外。
// サービス層はこれを投げ、呼び出し元(actions/route.ts)が ActionResponse に変換する。
export class ValidationError extends Error {
  constructor(
    public readonly errors: ValidationFieldError[],
    message = "Validation failed"
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

// spec.md AC-1.5, AC-1.6, CLAUDE.md 4.3
export const TODO_CONTENT_MAX_LENGTH = 50;

// UIが選択可能な3値のみ。'unset'は登録直後の内部状態でありユーザーが選択する値ではない
// (spec.md 4章冒頭の用語定義)。
export const USER_SELECTABLE_STATUSES = [
  "not_started",
  "completed",
  "continuing",
] as const satisfies readonly Exclude<TodoStatus, "unset">[];

export type UserSelectableStatus = (typeof USER_SELECTABLE_STATUSES)[number];

const DATE_STRING_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_STRING_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

// CLAUDE.md 4.2: 日付文字列は YYYY-MM-DD 形式のみ許可。実在しない日付(2024-02-30等)も弾く。
export function isValidDateString(value: string): boolean {
  if (!DATE_STRING_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return false;
  return date.toISOString().slice(0, 10) === value;
}

// spec.md 6.1: 就業開始/終了時刻は HH:mm 形式
export function isValidTimeString(value: string): boolean {
  return TIME_STRING_PATTERN.test(value);
}

/**
 * 日付文字列(YYYY-MM-DD)をバリデーションする。getTodosByDate, initializeTodayTodos,
 * createTodo, markStartNotificationSent, markEndNotificationSent 全てに統一適用する
 * (service-layer-api.md)。
 */
export function validateDateString(value: string, field = "date"): void {
  if (!isValidDateString(value)) {
    throw new ValidationError([{ field, message: "日付の形式が不正です" }]);
  }
}

/**
 * Todo本文をバリデーションし、trim済みの文字列を返す。
 * 空文字・空白のみ(AC-1.5, AC-1.6)、50文字超過(CLAUDE.md 4.3)をエラーにする。
 */
export function validateTodoContent(content: string): string {
  const trimmed = content.trim();
  if (trimmed.length === 0) {
    throw new ValidationError([{ field: "content", message: "Todoを入力してください" }]);
  }
  if (trimmed.length > TODO_CONTENT_MAX_LENGTH) {
    throw new ValidationError([
      { field: "content", message: `${TODO_CONTENT_MAX_LENGTH}文字以内で入力してください` },
    ]);
  }
  return trimmed;
}

/**
 * ステータス値がユーザー選択可能な3値のいずれかであることを検証する
 * (型レベルの Exclude<TodoStatus, 'unset'> は呼び出し境界を越えると型消去されるため、
 * ランタイムでも 'unset' 等の不正値を拒否する。service-layer-api.md参照)。
 */
export function validateTodoStatus(status: string): UserSelectableStatus {
  if (!(USER_SELECTABLE_STATUSES as readonly string[]).includes(status)) {
    throw new ValidationError([{ field: "status", message: "不正なステータスです" }]);
  }
  return status as UserSelectableStatus;
}

/**
 * 就業開始/終了時刻のバリデーション(spec.md 6.1, 異常系No.6)。
 * 空欄・形式不正・時刻の前後関係を検証する。
 */
export function validateSettingsTimes(morningTime: string, eveningTime: string): void {
  const errors: ValidationFieldError[] = [];

  if (morningTime.trim().length === 0) {
    errors.push({ field: "morningTime", message: "時刻を入力してください" });
  } else if (!isValidTimeString(morningTime)) {
    errors.push({ field: "morningTime", message: "時刻の形式が不正です" });
  }

  if (eveningTime.trim().length === 0) {
    errors.push({ field: "eveningTime", message: "時刻を入力してください" });
  } else if (!isValidTimeString(eveningTime)) {
    errors.push({ field: "eveningTime", message: "時刻の形式が不正です" });
  }

  if (errors.length > 0) {
    throw new ValidationError(errors);
  }

  // ここに到達する時点で両方とも HH:mm 形式が保証されているため、文字列の辞書順比較が
  // そのまま時刻の前後関係の比較になる。
  if (eveningTime <= morningTime) {
    throw new ValidationError([
      {
        field: "eveningTime",
        message: "就業終了時刻は就業開始時刻より後に設定してください",
      },
    ]);
  }
}
