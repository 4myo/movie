create table if not exists public.favorite_movies (
  id bigint generated always as identity primary key,
  user_id text not null,
  movie_id bigint not null,
  movie_data jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, movie_id)
);

alter table public.favorite_movies enable row level security;

create policy "Allow default user read favorites"
on public.favorite_movies
for select
using (user_id = 'default');

create policy "Allow default user insert favorites"
on public.favorite_movies
for insert
with check (user_id = 'default');

create policy "Allow default user delete favorites"
on public.favorite_movies
for delete
using (user_id = 'default');
