-- Proof photos and voice notes: private bucket, one folder per user.
-- Path: <user_id>/<proof id>.<ext>

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('proofs', 'proofs', false, 5242880, array['image/jpeg', 'audio/webm', 'audio/mp4', 'video/webm', 'video/mp4'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy proofs_files_select on storage.objects for select to authenticated
  using (bucket_id = 'proofs' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy proofs_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'proofs' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy proofs_files_update on storage.objects for update to authenticated
  using (bucket_id = 'proofs' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy proofs_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'proofs' and (storage.foldername(name))[1] = (select auth.uid())::text);
