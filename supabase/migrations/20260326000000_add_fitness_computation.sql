-- Postgres function for inserting computed fitness data.
-- Only inserts new rows for dates without any existing wellness data.
-- Never overwrites ICU-sourced wellness data (which is the ground truth).

create or replace function public.upsert_computed_fitness(
  p_user_id uuid,
  p_data jsonb
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer;
begin
  -- Insert rows for dates that don't have any wellness entry yet.
  -- These are typically dates beyond the 90-day ICU sync window.
  insert into wellness (user_id, date, ctl, atl, tsb, ramp_rate, source, updated_at)
  select
    p_user_id,
    (d.value->>'date')::date,
    (d.value->>'ctl')::numeric,
    (d.value->>'atl')::numeric,
    (d.value->>'tsb')::numeric,
    (d.value->>'rampRate')::numeric,
    'computed',
    now()
  from jsonb_array_elements(p_data) as d(value)
  where not exists (
    select 1 from wellness w2
    where w2.user_id = p_user_id
      and w2.date = (d.value->>'date')::date
  );

  get diagnostics inserted_count = row_count;

  return inserted_count;
end;
$$;
