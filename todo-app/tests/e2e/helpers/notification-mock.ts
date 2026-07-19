import type { Page } from "@playwright/test";

export type MockPermission = "default" | "granted" | "denied";

/**
 * window.Notificationをモックに差し替える。実際のOS通知は出さず、生成されたインスタンス
 * (タイトル・本文・onclickハンドラ)をwindow.__notificationsに記録する。
 * ナビゲーション前に呼ぶこと(addInitScriptは次回ページ読み込みから有効になる)。
 */
export async function mockNotificationApi(
  page: Page,
  initialPermission: MockPermission
): Promise<void> {
  await page.addInitScript((permission) => {
    interface CapturedNotification {
      title: string;
      body?: string;
      onclick: (() => void) | null;
    }
    const w = window as unknown as {
      __notifications: CapturedNotification[];
      __notificationPermission: string;
      Notification: unknown;
    };
    w.__notifications = [];
    w.__notificationPermission = permission;

    class MockNotification implements CapturedNotification {
      title: string;
      body?: string;
      onclick: (() => void) | null = null;

      constructor(title: string, options?: { body?: string }) {
        this.title = title;
        this.body = options?.body;
        w.__notifications.push(this);
      }

      static get permission() {
        return w.__notificationPermission;
      }

      static requestPermission() {
        return Promise.resolve(w.__notificationPermission);
      }
    }

    w.Notification = MockNotification;
  }, initialPermission);
}

export interface CapturedNotification {
  title: string;
  body?: string;
}

export async function getCapturedNotifications(page: Page): Promise<CapturedNotification[]> {
  return page.evaluate(
    () =>
      (
        window as unknown as { __notifications: CapturedNotification[] }
      ).__notifications?.map((n) => ({ title: n.title, body: n.body })) ?? []
  );
}

export async function clickCapturedNotification(page: Page, index = 0): Promise<void> {
  await page.evaluate((i) => {
    const n = (
      window as unknown as { __notifications: { onclick: (() => void) | null }[] }
    ).__notifications[i];
    n?.onclick?.();
  }, index);
}
