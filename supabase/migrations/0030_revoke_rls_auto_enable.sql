-- rls_auto_enable() is the event-trigger helper that turns on RLS for new public tables. It is not an API:
-- nobody should call it through /rest/v1/rpc. Revoke it from the API roles (already applied on Momentum).
-- Safe to rerun; skipped when the function does not exist (local databases).
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;
