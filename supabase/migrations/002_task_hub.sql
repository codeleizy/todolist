-- Task Hub: projects, categories and the complete task detail model.
-- Run this in the Supabase SQL editor (or apply it through the Supabase CLI)
-- after 001_mvp_tasks.sql.

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  color text not null default '#5b7cfa' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  created_at timestamptz not null default now(),
  unique (project_id, name)
);

alter table public.tasks
  add column if not exists description text not null default '',
  add column if not exists due_at timestamptz,
  add column if not exists scheduled_for date,
  add column if not exists reminder_at timestamptz,
  add column if not exists project_id uuid references public.projects(id) on delete set null,
  add column if not exists category_id uuid references public.categories(id) on delete set null,
  add column if not exists parent_id uuid references public.tasks(id) on delete cascade,
  add column if not exists manual_order numeric not null default 0,
  add column if not exists completed_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists hide_incomplete_children_notice boolean not null default false;

alter table public.tasks
  drop constraint if exists tasks_parent_id_check;
alter table public.tasks
  add constraint tasks_parent_id_check check (parent_id is null or parent_id <> id);

create index if not exists tasks_user_order_idx on public.tasks(user_id, archived_at, status, due_at);
create index if not exists tasks_parent_idx on public.tasks(parent_id);
create index if not exists projects_user_idx on public.projects(user_id);
create index if not exists categories_user_project_idx on public.categories(user_id, project_id);

alter table public.projects enable row level security;
alter table public.categories enable row level security;

drop policy if exists "Users manage only their own projects" on public.projects;
create policy "Users manage only their own projects" on public.projects
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage only their own categories" on public.categories;
create policy "Users manage only their own categories" on public.categories
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.set_task_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  if new.status = '已完成' and old.status is distinct from '已完成' then
    new.completed_at = coalesce(new.completed_at, now());
  elsif new.status <> '已完成' and old.status = '已完成' then
    new.completed_at = null;
  end if;
  return new;
end;
$$;

drop trigger if exists set_task_updated_at on public.tasks;
create trigger set_task_updated_at
before update on public.tasks
for each row execute function public.set_task_updated_at();

-- When every child is completed, the parent is completed too. A parent may still
-- be completed manually while its children stay untouched, as specified.
create or replace function public.complete_parent_when_children_complete()
returns trigger language plpgsql as $$
begin
  if new.parent_id is not null and new.status = '已完成' then
    if not exists (
      select 1 from public.tasks child
      where child.parent_id = new.parent_id and child.status <> '已完成'
    ) then
      update public.tasks
      set status = '已完成'
      where id = new.parent_id and status <> '已完成';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists complete_parent_when_children_complete on public.tasks;
create trigger complete_parent_when_children_complete
after insert or update of status on public.tasks
for each row execute function public.complete_parent_when_children_complete();
