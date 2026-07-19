-- Enum type for task_todos.status
create type todo_status as enum ('unset', 'not_started', 'completed', 'continuing');

-- Shared trigger function to keep updated_at current
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- task_todos table (renamed from "todos" to avoid colliding with a pre-existing unrelated table)
create table task_todos (
  id uuid primary key default gen_random_uuid(),
  todo_date date not null,
  content varchar(50) not null check (char_length(btrim(content)) > 0),
  status todo_status not null default 'unset',
  carried_over_from_id uuid references task_todos(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_task_todos_todo_date on task_todos (todo_date);

create trigger task_todos_set_updated_at
before update on task_todos
for each row execute function set_updated_at();

alter table task_todos enable row level security;

-- settings table (singleton, single row enforced by id=1 check)
create table settings (
  id smallint primary key default 1 check (id = 1),
  morning_time time not null default '09:00',
  evening_time time not null default '18:00',
  weekend_notification_enabled boolean not null default false,
  last_carryover_date date,
  last_start_notified_date date,
  last_end_notified_date date,
  updated_at timestamptz not null default now()
);

create trigger settings_set_updated_at
before update on settings
for each row execute function set_updated_at();

alter table settings enable row level security;

insert into settings (id) values (1);
