import Link from "next/link";
import { getSettings } from "@/lib/services/setting-service";
import SettingsForm from "@/components/settings-form";
import styles from "./page.module.css";

// Server Component。設定は日付に依存しないためCookie経由の日付は不要(component-design.md)。
export default async function SettingsPage() {
  const settings = await getSettings();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>設定</h1>
        <Link href="/">Todoに戻る</Link>
      </header>
      <main>
        <SettingsForm settings={settings} />
      </main>
    </div>
  );
}
