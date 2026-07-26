-- VOID v0.13 cloud snapshot table.
-- Run this file once in the Supabase SQL Editor.

create table if not exists public.user_spaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  ideas jsonb not null default '[]'::jsonb,
  language text not null default 'zh-CN' check (language in ('zh-CN', 'en')),
  client_updated_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_spaces enable row level security;

grant select, insert, update, delete on public.user_spaces to authenticated;

drop policy if exists "Users can read their own VOID space" on public.user_spaces;
create policy "Users can read their own VOID space"
on public.user_spaces
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own VOID space" on public.user_spaces;
create policy "Users can create their own VOID space"
on public.user_spaces
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own VOID space" on public.user_spaces;
create policy "Users can update their own VOID space"
on public.user_spaces
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own VOID space" on public.user_spaces;
create policy "Users can delete their own VOID space"
on public.user_spaces
for delete
to authenticated
using ((select auth.uid()) = user_id);

create or replace function public.set_void_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_void_updated_at on public.user_spaces;
create trigger set_void_updated_at
before update on public.user_spaces
for each row execute function public.set_void_updated_at();

-- Enable Realtime for cross-device updates. This block is safe to run repeatedly.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'user_spaces'
  ) then
    alter publication supabase_realtime add table public.user_spaces;
  end if;
end $$;
