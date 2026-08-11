-- Let a synced ride satisfy the workout that was planned for that day.
--
-- Background: 71 workouts were scheduled between April and July. 54 of them
-- had a real ride recorded on the same day. All 71 were still 'planned',
-- because nothing ever connected the two sides: the plan was written by hand
-- and the rides arrive from intervals.icu, and no code closed the loop.
--
-- The visible cost was a backlog that only manual ticking could clear, on a
-- screen you visit to find out what to do next. The plan was abandoned in July
-- while rides kept arriving through August.
--
-- completed_activity_id is what makes this honest and repeatable: a workout is
-- marked done *because of* a specific ride, so the pairing can be shown,
-- undone, or recomputed rather than being an opaque status flip.

alter table public.scheduled_workouts
  add column if not exists completed_activity_id uuid
    references public.activities(id) on delete set null;

comment on column public.scheduled_workouts.completed_activity_id is
  'The synced activity that satisfied this planned workout. Set by reconciliation, never by hand. Null when the session was ticked off manually or is still outstanding.';

create index if not exists scheduled_workouts_completed_activity_idx
  on public.scheduled_workouts(completed_activity_id)
  where completed_activity_id is not null;

-- Backfill what is already provable, so the existing backlog clears without
-- waiting for the next sync.
--
-- Pairing is one-to-one within a day: the nth workout planned for a day is
-- matched to the nth ride recorded that day. A day with two planned workouts
-- and one ride therefore settles one of them and leaves the other outstanding,
-- which is the truthful outcome — the alternative, letting one ride satisfy
-- every workout on the date, would silently overstate what was done.
with planned as (
  select id, user_id, scheduled_date,
         row_number() over (
           partition by user_id, scheduled_date
           order by day_part, created_at, id
         ) as rn
    from public.scheduled_workouts
   where status = 'planned'
),
ridden as (
  select id, user_id, activity_date,
         row_number() over (
           partition by user_id, activity_date
           order by moving_time desc nulls last, id
         ) as rn
    from public.activities
)
update public.scheduled_workouts s
   set status = 'done',
       completed_activity_id = ridden.id
  from planned
  join ridden
    on ridden.user_id = planned.user_id
   and ridden.activity_date = planned.scheduled_date
   and ridden.rn = planned.rn
 where s.id = planned.id;
