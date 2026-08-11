-- Make an activity's metrics traceable to the system that produced them, and
-- keep the intervals.icu id when one exists.
--
-- Background: every row in `activities` is Strava-sourced today, and
-- `icu_training_load` means two different things depending on when the row was
-- ingested — Strava's heart-rate "Relative Effort" on the backfill path, a TSS
-- computed from power streams on the incremental path. Nothing recorded which.
--
-- intervals.icu now receives rides from Garmin directly and carries real TSS
-- against a known FTP, plus intensity factor, neither of which Strava exposes.
-- Its Strava-fed rows are empty shells, so it can only improve the rides Garmin
-- covers; indoor sessions (Zwift, arriving via Strava) stay as they are.
--
-- metrics_source is what stops the two syncs fighting: once intervals.icu has
-- supplied the numbers for a ride, the Strava sync must not overwrite them with
-- a suffer score on its next pass.

alter table public.activities
  add column if not exists icu_activity_id text,
  add column if not exists metrics_source text
    check (metrics_source in ('intervals.icu', 'strava-streams', 'strava-summary')),
  add column if not exists trimp numeric,
  add column if not exists device_name text;

create index if not exists activities_icu_activity_idx
  on public.activities(user_id, icu_activity_id)
  where icu_activity_id is not null;

comment on column public.activities.icu_activity_id is
  'intervals.icu activity id, set when a row has been matched to or ingested from intervals.icu. Lets the detail view fetch streams from intervals.icu rather than Strava.';
comment on column public.activities.metrics_source is
  'Which system produced icu_training_load and the power/HR figures. intervals.icu is authoritative where present: its load is a true TSS against a known FTP. strava-streams means we computed TSS ourselves from power streams; strava-summary means the value is Strava''s heart-rate Relative Effort and is NOT a TSS.';
comment on column public.activities.trimp is
  'Heart-rate based training load from intervals.icu. Useful for sessions without power.';

-- Label what is already there, so the mixed units stop being invisible.
-- A row with a normalized power we computed came through the stream path;
-- anything else with a load carries Strava's Relative Effort.
update public.activities
   set metrics_source = case
         when normalized_power is not null then 'strava-streams'
         when icu_training_load is not null then 'strava-summary'
         else null
       end
 where source = 'strava' and metrics_source is null;
