-- Remove ICU-sourced activities. Strava is now the sole activity source.
-- ICU connection is kept for wellness data only (RHR, HRV).
DELETE FROM activities WHERE source = 'intervals.icu';
