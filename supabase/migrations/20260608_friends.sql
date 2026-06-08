-- profiles: stores each user's public friend tag
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  friend_tag text unique not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.profiles force row level security;

-- anyone authenticated can look up a profile by tag (needed for search)
create policy "profiles_select_authenticated" on public.profiles
  for select to authenticated using (true);

create policy "profiles_insert_own" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);

create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- friend_requests: pending / accepted / rejected
create table if not exists public.friend_requests (
  id bigint generated always as identity primary key,
  sender_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  unique(sender_id, receiver_id)
);

alter table public.friend_requests enable row level security;
alter table public.friend_requests force row level security;

create policy "friend_requests_select_involved" on public.friend_requests
  for select to authenticated
  using ((select auth.uid()) = sender_id or (select auth.uid()) = receiver_id);

create policy "friend_requests_insert_own" on public.friend_requests
  for insert to authenticated
  with check ((select auth.uid()) = sender_id);

create policy "friend_requests_update_receiver" on public.friend_requests
  for update to authenticated
  using ((select auth.uid()) = receiver_id);

create policy "friend_requests_delete_involved" on public.friend_requests
  for delete to authenticated
  using ((select auth.uid()) = sender_id or (select auth.uid()) = receiver_id);

-- shared_movies: one user sends a movie recommendation to a friend
create table if not exists public.shared_movies (
  id bigint generated always as identity primary key,
  sender_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  movie_id bigint not null,
  movie_title text not null,
  movie_poster_path text,
  media_type text not null default 'movie',
  seen_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.shared_movies enable row level security;
alter table public.shared_movies force row level security;

create policy "shared_movies_select_involved" on public.shared_movies
  for select to authenticated
  using ((select auth.uid()) = sender_id or (select auth.uid()) = receiver_id);

create policy "shared_movies_insert_own" on public.shared_movies
  for insert to authenticated
  with check ((select auth.uid()) = sender_id);

create policy "shared_movies_update_receiver" on public.shared_movies
  for update to authenticated
  using ((select auth.uid()) = receiver_id);

create policy "shared_movies_delete_involved" on public.shared_movies
  for delete to authenticated
  using ((select auth.uid()) = sender_id or (select auth.uid()) = receiver_id);

revoke all on table public.profiles from anon;
revoke all on table public.friend_requests from anon;
revoke all on table public.shared_movies from anon;

grant select, insert, update on table public.profiles to authenticated;
grant select, insert, update, delete on table public.friend_requests to authenticated;
grant select, insert, update, delete on table public.shared_movies to authenticated;
grant usage, select on all sequences in schema public to authenticated;
