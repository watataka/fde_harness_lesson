"use client";

import { useState, type FormEvent } from "react";
import { createTodo } from "@/actions/todo-actions";
import { getLocalDateString } from "@/lib/date-utils";
import styles from "./todo-form.module.css";

export default function TodoForm() {
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const result = await createTodo(getLocalDateString(), content);

    if (result.status === "ok") {
      setContent("");
    } else {
      setError(result.errors?.[0]?.message ?? result.message);
    }
    setIsSubmitting(false);
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <input
        type="text"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        disabled={isSubmitting}
        placeholder="本日のTodoを入力"
        aria-label="Todo入力"
        className={styles.input}
      />
      <button type="submit" disabled={isSubmitting} className={styles.button}>
        登録
      </button>
      {error ? <p className={styles.error}>{error}</p> : null}
    </form>
  );
}
