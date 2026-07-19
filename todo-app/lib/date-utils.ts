// component-design.md「today(日付)の扱い」参照。クライアント発の操作は常にこの関数で
// 算出したブラウザのローカル日付を使う(サーバー側でのタイムゾーン推測は行わない)。

// SSR表示用の日付Cookie名。"use client"モジュール(notification-manager.tsx)から
// exportすると、Server Componentでのimport時に文字列ではなくクライアント参照として
// 扱われ、cookieStore.get()の名前マッチングが常に失敗する(実際に発生した不具合)。
// Server/Client両方から安全に参照できるよう、"use client"を持たないこのファイルに置く。
export const LOCAL_DATE_COOKIE = "local-date";

/** DateオブジェクトをローカルタイムゾーンでYYYY-MM-DD形式の文字列に変換する。 */
export function getLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
