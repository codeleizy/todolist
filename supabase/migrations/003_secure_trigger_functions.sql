-- Fix Supabase security advisor warnings: trigger functions must not use a
-- caller-controlled search_path.
alter function public.set_task_updated_at() set search_path = public, pg_temp;
alter function public.complete_parent_when_children_complete() set search_path = public, pg_temp;
