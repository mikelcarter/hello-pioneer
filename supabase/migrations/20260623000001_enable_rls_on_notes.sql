alter table notes enable row level security;

create policy "anyone can read notes"
  on notes for select
  using (true);

create policy "anyone can write a note"
  on notes for insert
  with check (true);
