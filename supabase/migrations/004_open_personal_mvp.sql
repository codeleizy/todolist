-- Personal, no-login MVP mode.
-- Only rows with user_id IS NULL are public. Existing authenticated-user data
-- remains protected by the existing ownership policies.
alter table public.tasks alter column user_id drop not null;
alter table public.projects alter column user_id drop not null;
alter table public.categories alter column user_id drop not null;

grant select, insert, update, delete on public.tasks, public.projects, public.categories to anon;

drop policy if exists "Anonymous users manage public MVP tasks" on public.tasks;
create policy "Anonymous users manage public MVP tasks" on public.tasks
  for all to anon
  using (user_id is null)
  with check (user_id is null);

drop policy if exists "Anonymous users manage public MVP projects" on public.projects;
create policy "Anonymous users manage public MVP projects" on public.projects
  for all to anon
  using (user_id is null)
  with check (user_id is null);

drop policy if exists "Anonymous users manage public MVP categories" on public.categories;
create policy "Anonymous users manage public MVP categories" on public.categories
  for all to anon
  using (user_id is null)
  with check (user_id is null);
