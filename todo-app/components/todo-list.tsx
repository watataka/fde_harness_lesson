import StatusSelector from "@/components/status-selector";
import type { Todo } from "@/types";
import styles from "./todo-list.module.css";

interface TodoListProps {
  todos: Todo[];
}

// Server Component。propsで受け取ったtodosを描画するだけの純粋な表示コンポーネント
// (component-design.md)。データ取得・書き込みは一切行わない。
export default function TodoList({ todos }: TodoListProps) {
  return (
    <ul className={styles.list}>
      {todos.map((todo) => (
        <StatusSelector key={todo.id} todo={todo} />
      ))}
    </ul>
  );
}
