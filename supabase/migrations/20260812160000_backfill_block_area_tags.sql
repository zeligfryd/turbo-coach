-- Snapshot each routine-backed block's areas onto the block itself.
--
-- Blocks created from a routine carried `routine_id` but an empty `area_tags`,
-- because every path that schedules a routine went through scheduleRoutine,
-- which never passed them. Coverage still worked — it reads the routine's
-- coverage vector, which knows loaded from stretch and so is the better source
-- while the routine exists.
--
-- The problem is what happens when it stops existing. `block.routine_id` is
-- `on delete set null`, so deleting a routine silently erased the recorded
-- coverage of every session ever done from it: the blocks stayed, the history
-- they represented did not. It also meant the scheduling dialog showed areas it
-- then discarded on save.
--
-- Going forward scheduleRoutine writes them. This backfills what is already
-- there, so old sessions survive a routine being deleted too.
update public.block b
   set area_tags = coalesce(
         array(select jsonb_object_keys(r.coverage_vector)),
         '{}'
       )
  from public.routine r
 where r.id = b.routine_id
   and cardinality(b.area_tags) = 0
   and r.coverage_vector is not null
   and r.coverage_vector <> '{}'::jsonb;
