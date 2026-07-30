-- Second half of the lock-down, and the reason 0005 was not enough.
--
-- There are two separate grants that make a function reachable by anon:
--   1. a direct grant to the `anon` role — Supabase's default privileges do this,
--      and 0005 revoked it;
--   2. PostgreSQL's own default, which grants EXECUTE on every new function to
--      **PUBLIC** — and 0001 never revoked it for its helper functions.
--
-- After 0005 the verification still reported four functions reachable by anon:
-- lg_current_role, lg_current_department, lg_next_request_sequence and
-- lg_bump_version. They were reachable through PUBLIC, not through the anon role.
--
-- Revoking from PUBLIC also takes the privilege away from `authenticated`, so the
-- two helpers the RLS policies call are granted back explicitly. A policy runs as
-- the querying role, so without that grant every admin read would fail.

revoke execute on function lg_current_role() from public;
revoke execute on function lg_current_department() from public;
revoke execute on function lg_next_request_sequence(text, text) from public;
revoke execute on function lg_bump_version() from public;

grant execute on function lg_current_role() to authenticated, service_role;
grant execute on function lg_current_department() to authenticated, service_role;

-- lg_next_request_sequence and lg_bump_version get no grant at all: the only
-- callers are SECURITY DEFINER functions and a trigger, both of which run as the
-- owner and do not need one.
