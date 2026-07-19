"use client";

import { useState, type FormEvent } from "react";
import { updateSettings } from "@/actions/setting-actions";
import type { Settings, ValidationFieldError } from "@/types";
import styles from "./settings-form.module.css";

interface SettingsFormProps {
  settings: Settings;
}

export default function SettingsForm({ settings }: SettingsFormProps) {
  const [morningTime, setMorningTime] = useState(settings.morningTime?.slice(0, 5) ?? "");
  const [eveningTime, setEveningTime] = useState(settings.eveningTime?.slice(0, 5) ?? "");
  const [weekendNotificationEnabled, setWeekendNotificationEnabled] = useState(
    settings.weekendNotificationEnabled
  );
  const [errors, setErrors] = useState<ValidationFieldError[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  function errorFor(field: string): string | null {
    return errors.find((e) => e.field === field)?.message ?? null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrors([]);
    setSavedMessage(null);

    const result = await updateSettings({
      morningTime,
      eveningTime,
      weekendNotificationEnabled,
    });

    if (result.status === "ok") {
      setSavedMessage("設定を保存しました");
    } else {
      setErrors(result.errors ?? [{ field: "form", message: result.message }]);
    }
    setIsSubmitting(false);
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <label className={styles.field}>
        就業開始時刻
        <input
          type="time"
          value={morningTime}
          onChange={(e) => setMorningTime(e.target.value)}
          disabled={isSubmitting}
        />
        {errorFor("morningTime") ? <p className={styles.error}>{errorFor("morningTime")}</p> : null}
      </label>

      <label className={styles.field}>
        就業終了時刻
        <input
          type="time"
          value={eveningTime}
          onChange={(e) => setEveningTime(e.target.value)}
          disabled={isSubmitting}
        />
        {errorFor("eveningTime") ? <p className={styles.error}>{errorFor("eveningTime")}</p> : null}
      </label>

      <label className={styles.field}>
        <input
          type="checkbox"
          checked={weekendNotificationEnabled}
          onChange={(e) => setWeekendNotificationEnabled(e.target.checked)}
          disabled={isSubmitting}
        />
        {" "}土日の通知を有効にする
      </label>

      <button type="submit" disabled={isSubmitting} className={styles.button}>
        保存
      </button>

      {errorFor("form") ? <p className={styles.error}>{errorFor("form")}</p> : null}
      {savedMessage ? <p className={styles.success}>{savedMessage}</p> : null}
    </form>
  );
}
