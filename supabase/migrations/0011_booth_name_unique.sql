-- lg_set_booth_pin upserts on the booth name, which needs a unique constraint
-- to match against. 0001 created lg_booth without one, so the function raised
-- 42P10 the first time it ran. Caught by verify-booth.mjs; 0010 is already
-- applied, so the fix is another migration rather than an edit.
--
-- Two booths sharing a name would in any case be two names for one gate.

alter table lg_booth add constraint lg_booth_name_key unique (name);
