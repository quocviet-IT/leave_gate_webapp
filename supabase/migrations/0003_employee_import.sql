-- Employee master data: an import path for C&B, and a name search for the
-- public form (PRD sections XIV and X, rule 2).
--
-- Both are SECURITY DEFINER functions rather than table policies. The import
-- needs a role check that a policy cannot express as clearly, and the search
-- must return names *without* the employee number, which is HR's internal key
-- and has no business in a browser.
--
-- Supabase installs extensions into the `extensions` schema, so every function
-- here puts it on the search path before using unaccent().

create extension if not exists unaccent with schema extensions;

create function lg_import_employees(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_inserted int := 0;
  v_updated  int := 0;
  v_actor    text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if lg_current_role() is distinct from 'cnb' then
    raise exception 'Chỉ C&B được nhập danh sách nhân sự';
  end if;

  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'Dữ liệu nhập phải là một mảng';
  end if;

  if jsonb_array_length(p_rows) > 5000 then
    raise exception 'Một lần nhập tối đa 5000 dòng';
  end if;

  with incoming as (
    select
      upper(btrim(r ->> 'code'))                            as code,
      btrim(r ->> 'fullName')                               as full_name,
      nullif(btrim(coalesce(r ->> 'title', '')), '')        as title,
      nullif(btrim(coalesce(r ->> 'department', '')), '')    as department,
      nullif(lower(btrim(coalesce(r ->> 'email', ''))), '')  as email
    from jsonb_array_elements(p_rows) as r
  ),
  upserted as (
    insert into lg_employee (code, full_name, email, title, department, active, synced_at)
    select code, full_name, email, title, department, true, now()
    from incoming
    where code <> '' and full_name <> ''
    on conflict (code) do update
      set full_name  = excluded.full_name,
          email      = excluded.email,
          title      = excluded.title,
          department = excluded.department,
          active     = true,
          synced_at  = now()
    -- xmax is zero on a fresh insert and non-zero when the row was updated.
    returning (xmax = 0) as was_insert
  )
  select
    coalesce(count(*) filter (where was_insert), 0),
    coalesce(count(*) filter (where not was_insert), 0)
  into v_inserted, v_updated
  from upserted;

  insert into lg_audit (entity, entity_id, action, actor, detail)
  values (
    'lg_employee',
    'import',
    'import',
    coalesce(nullif(v_actor, ''), 'unknown'),
    jsonb_build_object(
      'inserted', v_inserted,
      'updated', v_updated,
      'rows', jsonb_array_length(p_rows)
    )
  );

  return jsonb_build_object('inserted', v_inserted, 'updated', v_updated);
end;
$$;

comment on function lg_import_employees(jsonb) is
  'Upsert staff rows by employee number. C&B only. Deactivates nobody.';

revoke all on function lg_import_employees(jsonb) from public;
grant execute on function lg_import_employees(jsonb) to authenticated;

-- The public form's name picker, and the only thing the form learns about a
-- person. Deliberately narrow: two characters minimum, at most eight rows, and
-- never the employee number. Inactive people are excluded so a leaver cannot be
-- filed for.
create function lg_search_employees(p_query text)
returns table (id uuid, full_name text, title text, department text)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select e.id, e.full_name, e.title, e.department
  from lg_employee e
  where e.active
    and length(btrim(coalesce(p_query, ''))) >= 2
    and unaccent(lower(e.full_name)) like '%' || unaccent(lower(btrim(p_query))) || '%'
  order by e.full_name
  limit 8;
$$;

comment on function lg_search_employees(text) is
  'Name search for the public form. Never returns the employee number.';

revoke all on function lg_search_employees(text) from public;
grant execute on function lg_search_employees(text) to anon, authenticated;
