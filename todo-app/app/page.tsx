import { cookies } from "next/headers";
import Link from "next/link";
import { getTodosByDate } from "@/lib/services/todo-service";
import { getLocalDateString } from "@/lib/date-utils";
import { LOCAL_DATE_COOKIE } from "@/components/notification-manager";
import TodoForm from "@/components/todo-form";
import TodoList from "@/components/todo-list";
import styles from "./page.module.css";

// Server Component、読み取り専用(component-design.md Rev.3)。繰越・クリーンアップ等の
// 書き込みは行わない(notification-manager.tsxのマウント時にServer Action
// `initializeToday`経由でクライアント確定日付でのみ実行される)。
export default async function Home() {
  const cookieStore = await cookies();
  const today = cookieStore.get(LOCAL_DATE_COOKIE)?.value ?? getLocalDateString();
  const todos = await getTodosByDate(today);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>就業Todo管理</h1>
        <Link href="/settings">設定</Link>
      </header>
      <main className={styles.main}>
        <TodoForm />
        <TodoList todos={todos} />
      </main>
    </div>
  );
}
