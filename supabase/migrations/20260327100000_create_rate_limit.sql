create table public.rate_limit_buckets (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  request_count int not null default 0,
  window_start timestamp with time zone not null default now(),
  primary key (user_id, key)
);

alter table public.rate_limit_buckets enable row level security;

-- Users can only see and modify their own buckets
create policy "Users can manage their own rate limit buckets"
  on public.rate_limit_buckets
  for all
  to authenticated
  using (user_id = auth.uid());

-- Atomically check and increment a rate limit bucket.
-- Returns true if the request is allowed, false if rate limited.
-- window_seconds: rolling window length (e.g. 60)
-- max_requests: max allowed calls per window (e.g. 20)
create or replace function public.check_rate_limit(
  p_user_id uuid,
  p_key text,
  p_window_seconds int,
  p_max_requests int
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_start timestamp with time zone;
  v_count int;
begin
  -- Lock the row for this user+key
  insert into public.rate_limit_buckets (user_id, key, request_count, window_start)
  values (p_user_id, p_key, 0, now())
  on conflict (user_id, key) do nothing;

  select request_count, window_start
  into v_count, v_window_start
  from public.rate_limit_buckets
  where user_id = p_user_id and key = p_key
  for update;

  -- Reset window if expired
  if extract(epoch from (now() - v_window_start)) >= p_window_seconds then
    update public.rate_limit_buckets
    set request_count = 1, window_start = now()
    where user_id = p_user_id and key = p_key;
    return true;
  end if;

  -- Deny if limit reached
  if v_count >= p_max_requests then
    return false;
  end if;

  -- Increment and allow
  update public.rate_limit_buckets
  set request_count = request_count + 1
  where user_id = p_user_id and key = p_key;

  return true;
end;
$$;
