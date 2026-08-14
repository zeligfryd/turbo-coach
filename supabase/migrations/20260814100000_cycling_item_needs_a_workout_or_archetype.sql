-- A cycling item must say what it is. There are now two ways to say it.
--
-- The old rule required an archetype and a target duration, because a
-- coach-authored item is a prescription — "threshold, about an hour" — that the
-- matcher resolves to a workout at activation.
--
-- An item composed by hand names the workout outright. It has no archetype and
-- needs none: there is nothing to match, the answer is already there. A derived
-- workout has no archetype either, since it is a new set of intervals rather
-- than a member of a category.
--
-- So the requirement becomes: either a prescription to resolve, or a workout to
-- use. An item with neither is still rejected, which is the point of the
-- constraint — it catches a half-built item before it reaches activation and
-- silently disappears from the calendar.
alter table public.plan_day_items
  drop constraint if exists cycling_requires_archetype;

alter table public.plan_day_items
  add constraint cycling_item_is_resolvable check (
    kind <> 'cycling'
    or workout_id is not null
    or (archetype is not null and target_duration_min is not null)
  );
