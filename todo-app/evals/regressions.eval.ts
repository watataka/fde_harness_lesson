import { describe, it } from "vitest";

// 「トラウマ事例集」— 開発中に見つかった実際のバグを、代表入力→期待性質の形で回帰ケース化し蓄積するファイル。
// evals/validation-rules.eval.ts / evals/notification-logic.eval.ts が「主要な入力クラスの網羅的サンプリング」
// を目的とするのに対し、こちらは「過去に一度壊れた具体的なケースを二度と壊さない」ことだけを目的とする。
//
// 運用ルール:
//   1. バグを見つけたら、まずこのファイルに再現ケースを追加し `npm run eval` で失敗する(red)ことを確認する
//   2. コードを修正し、`npm run eval` が通る(green)まで直す
//   3. コミットする。pre-commitフックが evals/ 全体(このファイルを含む)を自動実行する
//
// 書き方: 対象モジュールごとに describe ブロックを分け、1バグにつき1つの it() を追加する。
// it() のタイトルは "YYYY-MM-DD 何が起きたか" とし、発見日と事象が一目で分かるようにする。
//
// 例:
//   import { ValidationError, validateSettingsTimes } from "@/lib/validation/rules";
//
//   describe("[regression] validateSettingsTimes", () => {
//     it("2026-07-20 就業開始・終了が同時刻でも登録できてしまっていた", () => {
//       expect(() => validateSettingsTimes("09:00", "09:00")).toThrow(ValidationError);
//     });
//   });

describe("[regression] トラウマ事例集", () => {
  it.todo("バグが見つかったら、ここ(または対象モジュール別のdescribeブロック)にケースを追加する");
});
