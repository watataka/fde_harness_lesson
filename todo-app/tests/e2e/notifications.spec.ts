import { test, expect } from "@playwright/test";
import {
  TEST_DATE,
  cleanupTestTodos,
  getSettingsRow,
  restoreDefaultSettings,
  seedTestTodos,
  setTestSettings,
} from "./helpers/supabase-test-client";
import {
  clickCapturedNotification,
  getCapturedNotifications,
  mockNotificationApi,
} from "./helpers/notification-mock";

// settings(id=1)は全テストで共有されるシングルトンのため直列実行する。
// todo_date/通知済み日付にはTEST_DATE(2099-06-15、実利用と衝突しない未来日)を使う。
test.describe.serial("通知シナリオ(AC-2.x, AC-4.x)", () => {
  test.afterAll(async () => {
    await restoreDefaultSettings();
    await cleanupTestTodos();
  });

  function fixedTime(hour: number, minute: number): Date {
    const [y, m, d] = TEST_DATE.split("-").map(Number);
    return new Date(y, m - 1, d, hour, minute, 0);
  }

  test("AC-2.1, AC-2.8: 就業開始時刻になると、Todo登録有無に関わらず正しい文言で通知が発火する", async ({
    page,
  }) => {
    await setTestSettings({
      morningTime: "09:00:00",
      eveningTime: "18:00:00",
      weekendNotificationEnabled: true,
      lastStartNotifiedDate: null,
      lastEndNotifiedDate: null,
    });
    await seedTestTodos([{ content: "資料作成", status: "unset" }]);

    await mockNotificationApi(page, "granted");
    await page.clock.setFixedTime(fixedTime(9, 0));
    await page.goto("/");

    await expect(async () => {
      const notifications = await getCapturedNotifications(page);
      expect(notifications).toHaveLength(1);
      expect(notifications[0]).toEqual({
        title: "Todo入力のお知らせ",
        body: "就業開始時刻になりました。本日のTodoを入力してください。",
      });
    }).toPass({ timeout: 10_000 });
  });

  test("AC-2.7: 就業開始通知は同日中に再発火しない", async ({ page }) => {
    await setTestSettings({
      morningTime: "09:00:00",
      weekendNotificationEnabled: true,
      lastStartNotifiedDate: null,
    });

    await mockNotificationApi(page, "granted");
    await page.clock.setFixedTime(fixedTime(9, 0));
    await page.goto("/");

    await expect(async () => {
      expect(await getCapturedNotifications(page)).toHaveLength(1);
    }).toPass({ timeout: 10_000 });

    // Server Action(markStartNotificationSent)によるDB書き込みの完了を確認してから再読み込みする
    await expect(async () => {
      const row = await getSettingsRow();
      expect(row.last_start_notified_date).toBe(TEST_DATE);
    }).toPass({ timeout: 10_000 });

    await page.reload();
    await page.waitForTimeout(2000); // 再ポーリングが走る猶予

    expect(await getCapturedNotifications(page)).toHaveLength(0);
  });

  test("AC-2.5: 通知が拒否されていると、時刻になっても通知は出ず案内が表示される", async ({
    page,
  }) => {
    await setTestSettings({
      morningTime: "09:00:00",
      weekendNotificationEnabled: true,
      lastStartNotifiedDate: null,
    });

    await mockNotificationApi(page, "denied");
    await page.clock.setFixedTime(fixedTime(9, 5));
    await page.goto("/");

    await expect(
      page.getByText("通知が無効です。ブラウザの設定で通知を許可してください")
    ).toBeVisible();
    expect(await getCapturedNotifications(page)).toHaveLength(0);
  });

  test("AC-4.1, AC-4.6: 就業終了時刻になると未設定件数を含む通知が発火する", async ({ page }) => {
    await setTestSettings({
      eveningTime: "18:00:00",
      weekendNotificationEnabled: true,
      lastEndNotifiedDate: null,
    });
    await seedTestTodos([
      { content: "資料作成", status: "unset" },
      { content: "会議準備", status: "unset" },
      { content: "完了済み", status: "completed" },
    ]);

    await mockNotificationApi(page, "granted");
    await page.clock.setFixedTime(fixedTime(18, 0));
    await page.goto("/");

    await expect(async () => {
      const notifications = await getCapturedNotifications(page);
      expect(notifications).toHaveLength(1);
      expect(notifications[0]).toEqual({
        title: "Todoステータス確認",
        body: "ステータス未設定のTodoが2件あります。確認してください。",
      });
    }).toPass({ timeout: 10_000 });
  });

  test("AC-4.7: 就業終了通知は同日中に再発火しない", async ({ page }) => {
    await setTestSettings({
      eveningTime: "18:00:00",
      weekendNotificationEnabled: true,
      lastEndNotifiedDate: null,
    });
    await seedTestTodos([{ content: "資料作成", status: "unset" }]);

    await mockNotificationApi(page, "granted");
    await page.clock.setFixedTime(fixedTime(18, 0));
    await page.goto("/");

    await expect(async () => {
      expect(await getCapturedNotifications(page)).toHaveLength(1);
    }).toPass({ timeout: 10_000 });

    await expect(async () => {
      const row = await getSettingsRow();
      expect(row.last_end_notified_date).toBe(TEST_DATE);
    }).toPass({ timeout: 10_000 });

    await page.reload();
    await page.waitForTimeout(2000);

    expect(await getCapturedNotifications(page)).toHaveLength(0);
  });

  test("AC-4.2: 全Todoのステータスが設定済みなら通知は出ない", async ({ page }) => {
    await setTestSettings({
      eveningTime: "18:00:00",
      weekendNotificationEnabled: true,
      lastEndNotifiedDate: null,
    });
    await seedTestTodos([
      { content: "資料作成", status: "completed" },
      { content: "会議準備", status: "not_started" },
    ]);

    await mockNotificationApi(page, "granted");
    await page.clock.setFixedTime(fixedTime(18, 0));
    await page.goto("/");
    await page.waitForTimeout(2000);

    expect(await getCapturedNotifications(page)).toHaveLength(0);
  });

  test("AC-4.3: 当日Todoが0件なら通知の代わりに案内が表示される", async ({ page }) => {
    await setTestSettings({
      eveningTime: "18:00:00",
      weekendNotificationEnabled: true,
      lastEndNotifiedDate: null,
    });
    await seedTestTodos([]);

    await mockNotificationApi(page, "granted");
    await page.clock.setFixedTime(fixedTime(18, 5));
    await page.goto("/");

    await expect(page.getByText("本日のTodoが登録されていません")).toBeVisible();
    expect(await getCapturedNotifications(page)).toHaveLength(0);
  });

  test("AC-4.4: 就業終了通知をクリックすると未設定Todoが強調表示される", async ({ page }) => {
    await setTestSettings({
      eveningTime: "18:00:00",
      weekendNotificationEnabled: true,
      lastEndNotifiedDate: null,
    });
    await seedTestTodos([{ content: "資料作成", status: "unset" }]);

    await mockNotificationApi(page, "granted");
    await page.clock.setFixedTime(fixedTime(18, 0));
    await page.goto("/");

    await expect(async () => {
      expect(await getCapturedNotifications(page)).toHaveLength(1);
    }).toPass({ timeout: 10_000 });

    await clickCapturedNotification(page, 0);

    const item = page.locator("li", { hasText: "資料作成" });
    await expect(item).toHaveClass(/highlighted/);
  });
});
