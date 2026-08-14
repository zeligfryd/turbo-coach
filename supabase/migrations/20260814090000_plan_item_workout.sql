-- Let a plan item name the workout it means, rather than describing one.
--
-- Items carry an archetype and a target duration, and activation resolves them
-- to a library workout with the matcher at the moment the plan is activated.
-- That is right for a plan the coach proposed — it is a prescription, and the
-- best match for it can legitimately change as the library grows.
--
-- It is wrong for a plan you built yourself. If you picked "Threshold 3x10" for
-- Tuesday, Tuesday should be that workout and not whatever the matcher likes
-- best on activation day. It is also the only way progression can work at all:
-- a derived workout is a new set of intervals, not an archetype, so there is
-- nothing for a matcher to find.
--
-- Both paths stay live. Set means "use exactly this"; null keeps the matcher,
-- so every existing plan behaves as before.
alter table public.plan_day_items
  add column if not exists workout_id uuid
    references public.workouts(id) on delete set null;

comment on column public.plan_day_items.workout_id is
  'The exact workout this item schedules. Set by the manual composer; null for coach-authored items, which resolve through the archetype matcher at activation. On delete set null so removing a workout degrades the item to its archetype rather than deleting the plan item.';

create index if not exists plan_day_items_workout_idx
  on public.plan_day_items(workout_id)
  where workout_id is not null;
