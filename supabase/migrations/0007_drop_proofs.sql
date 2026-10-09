-- Check-ins no longer carry proofs (photos, voice notes, AI verification). Removes the proofs table,
-- the access policies on the `proofs` storage bucket and the habits' proof hint.
--
-- Not done here: the bucket itself. Supabase refuses to delete storage rows from SQL, so empty and delete
-- the `proofs` bucket in the dashboard (Storage). Until then nobody can reach its files: the policies below
-- were the only way in for signed-in users.
--
-- completions.code keeps its 1-5 check: old rows may hold 2-5 and the app reads them all as "done".

drop policy if exists proofs_files_select on storage.objects;
drop policy if exists proofs_files_insert on storage.objects;
drop policy if exists proofs_files_update on storage.objects;
drop policy if exists proofs_files_delete on storage.objects;

drop table if exists public.proofs;
alter table public.habits drop column if exists proof_hint;
