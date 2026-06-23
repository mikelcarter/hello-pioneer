create table if not exists email_events (
  id          uuid        primary key default gen_random_uuid(),
  message_id  text        not null,
  note_id     uuid        references notes(id) on delete set null,
  recipient   text        not null,
  event_type  text        not null,
  created_at  timestamptz not null default now()
);

create index on email_events (message_id);
create index on email_events (note_id);

alter table email_events enable row level security;

create policy "anyone can read email events"
  on email_events for select
  using (true);

create policy "anyone can insert email events"
  on email_events for insert
  with check (true);
