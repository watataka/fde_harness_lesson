-- get_advisors (performance) flagged carried_over_from_id as an unindexed foreign key.
create index idx_task_todos_carried_over_from_id on task_todos (carried_over_from_id);
