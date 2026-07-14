-- Deleting a backup needs both halves: the snapshot row and the objects under
-- the user's own prefix. Without these policies the delete is a silent no-op —
-- RLS denies by default and Postgres reports zero affected rows, not an error.
create policy "Users delete their backup snapshots" on public.backup_snapshots
for delete to authenticated using ((select auth.uid()) = user_id);

create policy "Users delete their backup objects" on storage.objects
for delete to authenticated using (bucket_id = 'user-backups'
  and (storage.foldername(name))[1] = 'users'
  and (storage.foldername(name))[2] = (select auth.uid())::text);
