-- Create users table for profile data
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  ftp integer,
  weight numeric(5, 1),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security
alter table public.users enable row level security;

-- Allow users to read their own profile
create policy "Users can read own profile"
  on public.users
  for select
  to authenticated
  using (auth.uid() = id);

-- Allow users to insert their own profile
create policy "Users can insert own profile"
  on public.users
  for insert
  to authenticated
  with check (auth.uid() = id);

-- Allow users to update their own profile
create policy "Users can update own profile"
  on public.users
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Create function to automatically create user profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id)
  values (new.id);
  return new;
end;
$$ language plpgsql security definer;

-- Create trigger to call function on user signup
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
