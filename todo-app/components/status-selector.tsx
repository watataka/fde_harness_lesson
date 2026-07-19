"use client";

import { useState } from "react";
import { updateTodoStatus } from "@/actions/todo-actions";
import { useHighlight } from "@/components/notification-manager";
import type { Todo, TodoStatus } from "@/types";
import styles from "./status-selector.module.css";

const STATUS_OPTIONS: { value: Exclude<TodoStatus, "unset">; label: string }[] = [
  { value: "not_started", label: "未着手" },
  { value: "completed", label: "完了" },
  { value: "continuing", label: "継続" },
];

interface StatusSelectorProps {
  todo: Todo;
}

export default function StatusSelector({ todo }: StatusSelectorProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const highlight = useHighlight();
  const isHighlighted = highlight && todo.status === "unset";

  async function handleSelect(status: Exclude<TodoStatus, "unset">) {
    if (isSubmitting || status === todo.status) return;
    setIsSubmitting(true);
    setError(null);

    const result = await updateTodoStatus(todo.id, status);

    if (result.status === "error") {
      setError(result.message);
    }
    setIsSubmitting(false);
  }

  return (
    <li className={isHighlighted ? styles.highlighted : styles.item}>
      <span className={styles.content}>{todo.content}</span>
      <span className={styles.buttons}>
        {STATUS_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={isSubmitting}
            aria-pressed={todo.status === option.value}
            className={todo.status === option.value ? styles.selected : styles.option}
            onClick={() => handleSelect(option.value)}
          >
            {option.label}
          </button>
        ))}
      </span>
      {error ? <p className={styles.error}>{error}</p> : null}
    </li>
  );
}
