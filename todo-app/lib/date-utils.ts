// component-design.md「today(日付)の扱い」参照。クライアント発の操作は常にこの関数で
// 算出したブラウザのローカル日付を使う(サーバー側でのタイムゾーン推測は行わない)。

/** DateオブジェクトをローカルタイムゾーンでYYYY-MM-DD形式の文字列に変換する。 */
export function getLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
