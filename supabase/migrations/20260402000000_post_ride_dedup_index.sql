-- Prevent duplicate post-ride analyses for the same activity.
-- The dedup record in coach_insights uses metadata->>'activity_id' to identify
-- which activity was analysed. This unique index makes the insert fail atomically
-- if a concurrent call tries to analyse the same activity.

-- Remove any duplicate post_ride_analysis dedup rows, keeping only the oldest.
delete from public.coach_insights
where id in (
  select id from (
    select id,
           row_number() over (
             partition by user_id, (metadata->>'activity_id')
             order by created_at asc
           ) as rn
    from public.coach_insights
    where type = 'post_ride_analysis'
      and metadata->>'activity_id' is not null
  ) ranked
  where rn > 1
);

create unique index coach_insights_post_ride_dedup
  on public.coach_insights (user_id, (metadata->>'activity_id'))
  where type = 'post_ride_analysis';
