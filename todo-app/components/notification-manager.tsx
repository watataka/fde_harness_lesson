"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { getLocalDateString } from "@/lib/date-utils";
import { initializeToday } from "@/actions/todo-actions";
import { markStartNotificationSent, markEndNotificationSent } from "@/actions/setting-actions";
import type { ActionResponse, Settings, Todo } from "@/types";
import styles from "./notification-manager.module.css";

// notification-logic.md参照。ポーリング間隔・Cookie名。
export const POLL_INTERVAL_MS = 20_000;
export const LOCAL_DATE_COOKIE = "local-date";

const HighlightContext = createContext(false);
/** AC-4.4: 就業終了通知クリック時にstatus-selector.tsxが「未設定」Todoを強調表示するために使う。 */
export const useHighlight = () => useContext(HighlightContext);

export function readCookie(cookieString: string, name: string): string | null {
  const match = cookieString.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function isWeekend(dateString: string): boolean {
  // "T00:00:00"(タイムゾーン指定なし)はローカル時刻として解釈されるため、
  // dateStringが表すローカルの曜日を正しく取得できる。
  const day = new Date(`${dateString}T00:00:00`).getDay();
  return day === 0 || day === 6;
}

function isNotificationSuppressed(dateString: string, settings: Settings): boolean {
  return isWeekend(dateString) && !settings.weekendNotificationEnabled;
}

/** 就業開始プッシュ通知の発火判定(完全一致・1日1回、notification-logic.md)。 */
export function shouldFireStartNotification(
  settings: Settings,
  today: string,
  nowHHmm: string
): boolean {
  if (!settings.morningTime) return false;
  if (isNotificationSuppressed(today, settings)) return false;
  if (nowHHmm !== settings.morningTime.slice(0, 5)) return false;
  return settings.lastStartNotifiedDate !== today;
}

/** 就業終了プッシュ通知の発火判定。未設定件数はバナー表示にも使うため併せて返す。 */
export function shouldFireEndNotification(
  settings: Settings,
  todos: Todo[],
  today: string,
  nowHHmm: string
): { shouldFire: boolean; unsetCount: number } {
  const unsetCount = todos.filter((t) => t.status === "unset").length;
  if (!settings.eveningTime) return { shouldFire: false, unsetCount };
  if (isNotificationSuppressed(today, settings)) return { shouldFire: false, unsetCount };
  if (nowHHmm !== settings.eveningTime.slice(0, 5)) return { shouldFire: false, unsetCount };
  if (settings.lastEndNotifiedDate === today) return { shouldFire: false, unsetCount };
  return { shouldFire: unsetCount > 0, unsetCount };
}

/** 状態バナー(denied案内)。プッシュ通知とは独立して`>=`判定で毎回評価する。 */
export function shouldShowDeniedBanner(
  settings: Settings | null,
  permission: NotificationPermission | null,
  today: string,
  nowHHmm: string
): boolean {
  if (!settings?.morningTime || permission !== "denied") return false;
  if (isNotificationSuppressed(today, settings)) return false;
  return nowHHmm >= settings.morningTime.slice(0, 5);
}

/** 状態バナー(0件Todo案内)。同上、独立して`>=`判定で毎回評価する。 */
export function shouldShowNoTodosBanner(
  settings: Settings | null,
  todos: Todo[] | null,
  today: string,
  nowHHmm: string
): boolean {
  if (!settings?.eveningTime || todos === null) return false;
  if (isNotificationSuppressed(today, settings)) return false;
  if (todos.length !== 0) return false;
  return nowHHmm >= settings.eveningTime.slice(0, 5);
}

interface NotificationManagerProps {
  children: ReactNode;
}

export default function NotificationManager({ children }: NotificationManagerProps) {
  const router = useRouter();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [todos, setTodos] = useState<Todo[] | null>(null);
  // 遅延初期化: SSR時はNotificationが存在しないためnull、クライアント初回レンダリング時
  // (ハイドレーション)には実際の許可状態を同期的に取得できる。エフェクト内での同期的
  // setState(react-hooks/set-state-in-effect)を避けるため、初期値としてここで求める。
  const [permission, setPermission] = useState<NotificationPermission | null>(() =>
    typeof Notification === "undefined" ? null : Notification.permission
  );
  const [highlight, setHighlight] = useState(false);

  const isFetchingRef = useRef(false);
  const lastInitializedDateRef = useRef<string | null>(null);

  // 通知許可リクエスト(AC-2.4)。アプリの初回マウント時にどのページであっても実行する。
  // setPermissionはrequestPermission()の非同期コールバック内でのみ呼ぶ。
  useEffect(() => {
    if (typeof Notification === "undefined" || Notification.permission !== "default") return;
    Notification.requestPermission().then(setPermission);
  }, []);

  useEffect(() => {
    function syncToday() {
      const browserToday = getLocalDateString();
      if (readCookie(document.cookie, LOCAL_DATE_COOKIE) !== browserToday) {
        document.cookie = `${LOCAL_DATE_COOKIE}=${browserToday}; path=/; max-age=172800; SameSite=Lax`;
        router.refresh();
      }
      if (lastInitializedDateRef.current !== browserToday) {
        initializeToday(browserToday)
          .then((result: ActionResponse<void>) => {
            if (result.status === "ok") {
              lastInitializedDateRef.current = browserToday;
            }
          })
          .catch((e) => console.error(e));
      }
    }

    async function evaluateNotifications(
      today: string,
      currentSettings: Settings,
      currentTodos: Todo[]
    ) {
      if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
      const nowHHmm = new Date().toTimeString().slice(0, 5);

      if (shouldFireStartNotification(currentSettings, today, nowHHmm)) {
        const notification = new Notification("Todo入力のお知らせ", {
          body: "就業開始時刻になりました。本日のTodoを入力してください。",
        });
        notification.onclick = () => window.focus();
        await markStartNotificationSent(today);
      }

      const { shouldFire, unsetCount } = shouldFireEndNotification(
        currentSettings,
        currentTodos,
        today,
        nowHHmm
      );
      if (shouldFire) {
        const notification = new Notification("Todoステータス確認", {
          body: `ステータス未設定のTodoが${unsetCount}件あります。確認してください。`,
        });
        notification.onclick = () => {
          window.focus();
          router.push("/");
          setHighlight(true);
        };
        await markEndNotificationSent(today);
      }
    }

    async function poll() {
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;
      try {
        const today = getLocalDateString();
        const [settingsRes, todosRes]: [ActionResponse<Settings>, ActionResponse<Todo[]>] =
          await Promise.all([
            fetch("/api/settings").then((r) => r.json()),
            fetch(`/api/todos?date=${today}`).then((r) => r.json()),
          ]);

        if (settingsRes.status === "ok") {
          setSettings(settingsRes.data);
        } else {
          console.error(settingsRes.message);
        }

        if (todosRes.status === "ok") {
          setTodos(todosRes.data);
        } else {
          console.error(todosRes.message);
        }

        if (settingsRes.status === "ok" && todosRes.status === "ok") {
          await evaluateNotifications(today, settingsRes.data, todosRes.data);
        }
      } catch (e) {
        console.error(e);
      } finally {
        isFetchingRef.current = false;
      }
    }

    syncToday();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") syncToday();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    poll();
    const intervalId = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      clearInterval(intervalId);
    };
    // マウント時に1回だけ購読を開始する。poll/syncToday内部の判定はrefと引数から
    // 都度フレッシュに計算されるため、古いクロージャを参照する問題は生じない。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const now = new Date();
  const today = getLocalDateString(now);
  const nowHHmm = now.toTimeString().slice(0, 5);

  const showDeniedBanner = shouldShowDeniedBanner(settings, permission, today, nowHHmm);
  const showNoTodosBanner = shouldShowNoTodosBanner(settings, todos, today, nowHHmm);

  return (
    <HighlightContext.Provider value={highlight}>
      {showDeniedBanner ? (
        <p className={styles.banner}>通知が無効です。ブラウザの設定で通知を許可してください</p>
      ) : null}
      {showNoTodosBanner ? <p className={styles.banner}>本日のTodoが登録されていません</p> : null}
      {children}
    </HighlightContext.Provider>
  );
}
