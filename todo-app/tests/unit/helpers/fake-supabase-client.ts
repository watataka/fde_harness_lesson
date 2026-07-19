// lib/services のテスト専用インメモリFake。実際のPostgreSQL/PostgRESTの挙動のうち、
// このアプリのサービス層が依存する範囲(eq/lt/order/limit/single/maybeSingle、
// insert/update/deleteのデフォルト値・updated_atトリガー相当の挙動)のみを再現する。
// 汎用のSupabaseモックライブラリではなく、このテストスイート専用の最小実装。

type Row = Record<string, unknown>;

interface Filter {
  type: "eq" | "lt";
  column: string;
  value: unknown;
}

interface FakeResult<T> {
  data: T;
  error: { message: string; code?: string } | null;
}

let idCounter = 0;

export class FakeTable {
  rows: Row[] = [];

  constructor(private readonly defaults: () => Row = () => ({})) {}

  insertRow(input: Row): Row {
    const now = new Date().toISOString();
    const row: Row = {
      ...this.defaults(),
      id: `fake-id-${++idCounter}`,
      created_at: now,
      updated_at: now,
      ...input,
    };
    this.rows.push(row);
    return { ...row };
  }

  updateMatching(filters: Filter[], patch: Row, bumpUpdatedAt: boolean): Row[] {
    const matched = this.rows.filter((row) => matches(row, filters));
    for (const row of matched) {
      Object.assign(row, patch);
      if (bumpUpdatedAt) {
        row.updated_at = new Date().toISOString();
      }
    }
    return matched.map((row) => ({ ...row }));
  }

  deleteMatching(filters: Filter[]): void {
    this.rows = this.rows.filter((row) => !matches(row, filters));
  }

  seed(rows: Row[]): void {
    this.rows.push(...rows.map((r) => ({ ...r })));
  }
}

function matches(row: Row, filters: Filter[]): boolean {
  return filters.every((f) => {
    const rowVal = row[f.column];
    if (f.type === "eq") return rowVal === f.value;
    if (f.type === "lt") return String(rowVal) < String(f.value);
    return true;
  });
}

// updated_atをアプリ側のUPDATEペイロードで明示的に更新することはない(DBトリガー相当の
// 自動更新のみ)ため、"status"や"last_carryover_date"等のUPDATEでは常にbumpする。
class FakeQueryBuilder<T = Row> implements PromiseLike<FakeResult<T>> {
  private filters: Filter[] = [];
  private orderCol?: string;
  private orderAsc = true;
  private limitN?: number;
  private mode: "select" | "insert" | "update" | "delete" = "select";
  private payload: Row | Row[] | null = null;
  private wantSingle: "none" | "single" | "maybeSingle" = "none";

  constructor(private readonly table: FakeTable) {}

  // 実際のPostgRESTと同じ引数形を受け取れるようにするが、Fakeでは列選択を再現しない
  // (常に全カラムを返す。テストは呼び出し側の`select`文字列に依存していないため無害)。
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  select(_columns?: string): this {
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push({ type: "eq", column, value });
    return this;
  }

  lt(column: string, value: unknown): this {
    this.filters.push({ type: "lt", column, value });
    return this;
  }

  order(column: string, opts?: { ascending?: boolean }): this {
    this.orderCol = column;
    this.orderAsc = opts?.ascending ?? true;
    return this;
  }

  limit(n: number): this {
    this.limitN = n;
    return this;
  }

  insert(payload: Row | Row[]): this {
    this.mode = "insert";
    this.payload = payload;
    return this;
  }

  update(payload: Row): this {
    this.mode = "update";
    this.payload = payload;
    return this;
  }

  delete(): this {
    this.mode = "delete";
    return this;
  }

  single(): this {
    this.wantSingle = "single";
    return this;
  }

  maybeSingle(): this {
    this.wantSingle = "maybeSingle";
    return this;
  }

  private execute(): FakeResult<T> {
    if (this.mode === "insert") {
      const rows = Array.isArray(this.payload) ? this.payload : [this.payload as Row];
      const inserted = rows.map((r) => this.table.insertRow(r));
      const data = this.wantSingle !== "none" ? (inserted[0] ?? null) : inserted;
      return { data: data as T, error: null };
    }

    if (this.mode === "update") {
      const updated = this.table.updateMatching(this.filters, this.payload as Row, true);
      const data = this.wantSingle !== "none" ? (updated[0] ?? null) : updated;
      return { data: data as T, error: null };
    }

    if (this.mode === "delete") {
      this.table.deleteMatching(this.filters);
      return { data: null as T, error: null };
    }

    // select
    let result = this.table.rows.filter((r) => matches(r, this.filters));
    if (this.orderCol) {
      const col = this.orderCol;
      result = [...result].sort((a, b) => {
        const av = String(a[col]);
        const bv = String(b[col]);
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return this.orderAsc ? cmp : -cmp;
      });
    }
    if (this.limitN !== undefined) {
      result = result.slice(0, this.limitN);
    }
    const cloned = result.map((r) => ({ ...r }));

    if (this.wantSingle === "single") {
      if (cloned.length !== 1) {
        return { data: null as T, error: { message: "not found", code: "PGRST116" } };
      }
      return { data: cloned[0] as T, error: null };
    }
    if (this.wantSingle === "maybeSingle") {
      return { data: (cloned[0] ?? null) as T, error: null };
    }
    return { data: cloned as T, error: null };
  }

  then<TResult1 = FakeResult<T>, TResult2 = never>(
    onfulfilled?: ((value: FakeResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }
}

export interface FakeSupabaseClient {
  from(table: "task_todos" | "settings"): FakeQueryBuilder;
  tables: { task_todos: FakeTable; settings: FakeTable };
}

export function createFakeSupabaseClient(): FakeSupabaseClient {
  const tables = {
    task_todos: new FakeTable(() => ({ status: "unset", carried_over_from_id: null })),
    settings: new FakeTable(),
  };

  return {
    from(table) {
      return new FakeQueryBuilder(tables[table]);
    },
    tables,
  };
}

export function seedDefaultSettings(
  client: FakeSupabaseClient,
  overrides: Partial<Row> = {}
): void {
  client.tables.settings.seed([
    {
      id: 1,
      morning_time: "09:00:00",
      evening_time: "18:00:00",
      weekend_notification_enabled: false,
      last_carryover_date: null,
      last_start_notified_date: null,
      last_end_notified_date: null,
      updated_at: new Date().toISOString(),
      ...overrides,
    },
  ]);
}
