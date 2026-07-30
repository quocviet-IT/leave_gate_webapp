-- Take EXECUTE away from `anon` on everything it has no business calling.
--
-- 0003 and 0004 said `revoke all on function … from public`, which does nothing
-- here: Supabase's default privileges grant EXECUTE **directly to the anon and
-- authenticated roles**, not through PUBLIC. So every lg_ function was callable
-- with the anon key that ships to the browser — including lg_submit_request,
-- where a hand-made call could have filed a request with any number of hours it
-- liked. The verification script caught it; this migration closes it.
--
-- What anon keeps, and why:
--   lg_search_employees  — the public form's name picker. Bounded to 8 rows, two
--                          characters minimum, and never returns a code.
--   lg_status_by_code    — answers with a status and nothing else, by design.
--
-- Everything else is either a signed-in path or internal.

revoke execute on function lg_submit_request(uuid, lg_request_kind, jsonb, int, text) from anon;
revoke execute on function lg_import_employees(jsonb) from anon;

-- Internal helpers. `authenticated` must keep lg_current_role() and
-- lg_current_department(): the RLS policies in 0001 call them, and a policy runs
-- as the querying role, so removing that grant would break every admin read.
revoke execute on function lg_current_role() from anon;
revoke execute on function lg_current_department() from anon;

-- The code sequence and the version trigger are called by other functions, never
-- by a client. Left reachable, anon could burn sequence numbers and leave gaps in
-- the request codes.
revoke execute on function lg_next_request_sequence(text, text) from anon, authenticated;
revoke execute on function lg_bump_version() from anon, authenticated;

-- Stop the next migration from repeating the mistake: new functions in this schema
-- are no longer executable by anon or authenticated unless a grant says so.
-- Every later migration must grant deliberately.
alter default privileges in schema public revoke execute on functions from anon;
alter default privileges in schema public revoke execute on functions from authenticated;
