insert into storage.buckets (id, name, public)
values ('user-backups', 'user-backups', false)
on conflict (id) do update set public = false;

create table if not exists public.backup_snapshots (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null,
  app_version text not null,
  schema_version integer not null,
  status text not null check (status = 'complete'),
  unique (user_id, id)
);

alter table public.backup_snapshots enable row level security;

create policy "Users read their backup snapshots" on public.backup_snapshots
for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users create their backup snapshots" on public.backup_snapshots
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users read their backup objects" on storage.objects
for select to authenticated using (bucket_id = 'user-backups'
  and (storage.foldername(name))[1] = 'users'
  and (storage.foldername(name))[2] = (select auth.uid())::text);
create policy "Users create their backup objects" on storage.objects
for insert to authenticated with check (bucket_id = 'user-backups'
  and (storage.foldername(name))[1] = 'users'
  and (storage.foldername(name))[2] = (select auth.uid())::text);
