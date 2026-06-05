do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'favorite_movies'
  loop
    execute format('drop policy if exists %I on public.favorite_movies', policy_record.policyname);
  end loop;
end $$;

alter table if exists public.favorite_movies
  add column if not exists media_type text not null default 'movie',
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.favorite_movies
  drop constraint if exists favorite_movies_user_id_movie_id_key;

create unique index if not exists favorite_movies_user_media_title_key
  on public.favorite_movies (user_id, media_type, movie_id);

create table if not exists public.recently_watched (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  movie_id bigint not null,
  media_type text not null default 'movie',
  movie_data jsonb not null,
  watched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists recently_watched_user_media_title_key
  on public.recently_watched (user_id, media_type, movie_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_favorite_movies_updated_at on public.favorite_movies;
create trigger set_favorite_movies_updated_at
before update on public.favorite_movies
for each row
execute function public.set_updated_at();

drop trigger if exists set_recently_watched_updated_at on public.recently_watched;
create trigger set_recently_watched_updated_at
before update on public.recently_watched
for each row
execute function public.set_updated_at();

alter table public.favorite_movies enable row level security;
alter table public.favorite_movies force row level security;
alter table public.recently_watched enable row level security;
alter table public.recently_watched force row level security;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'recently_watched'
  loop
    execute format('drop policy if exists %I on public.recently_watched', policy_record.policyname);
  end loop;
end $$;

create policy "favorite_movies_select_own"
on public.favorite_movies
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "favorite_movies_insert_own"
on public.favorite_movies
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "favorite_movies_update_own"
on public.favorite_movies
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "favorite_movies_delete_own"
on public.favorite_movies
for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "recently_watched_select_own"
on public.recently_watched
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "recently_watched_insert_own"
on public.recently_watched
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "recently_watched_update_own"
on public.recently_watched
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "recently_watched_delete_own"
on public.recently_watched
for delete
to authenticated
using ((select auth.uid()) = user_id);

revoke all on table public.favorite_movies from anon;
revoke all on table public.recently_watched from anon;
grant select, insert, update, delete on table public.favorite_movies to authenticated;
grant select, insert, update, delete on table public.recently_watched to authenticated;
grant usage, select on all sequences in schema public to authenticated;
