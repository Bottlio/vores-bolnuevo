-- Vores Bolnuevo: tabeller, adgangsregler og billedmappe

create table if not exists public.places (
  id text primary key default ('p' || replace(gen_random_uuid()::text, '-', '')),
  cat text not null default 'spisesteder',
  status text not null default 'tried' check (status in ('tried','wish')),
  name text not null,
  area text default '',
  note text default '',
  rating int check (rating between 1 and 5),
  price text default '',
  visits text[] default '{}',
  guess boolean default false,
  lat double precision,
  lon double precision,
  photos jsonb not null default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.editors (
  email text primary key
);

create or replace function public.is_editor() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.editors where lower(email) = lower(auth.jwt() ->> 'email'));
$$;

alter table public.places enable row level security;
alter table public.editors enable row level security;

drop policy if exists "alle kan læse steder" on public.places;
create policy "alle kan læse steder" on public.places for select using (true);
drop policy if exists "redaktører kan oprette" on public.places;
create policy "redaktører kan oprette" on public.places for insert to authenticated with check (public.is_editor());
drop policy if exists "redaktører kan rette" on public.places;
create policy "redaktører kan rette" on public.places for update to authenticated using (public.is_editor()) with check (public.is_editor());
drop policy if exists "redaktører kan slette" on public.places;
create policy "redaktører kan slette" on public.places for delete to authenticated using (public.is_editor());

drop policy if exists "se egen redaktør-række" on public.editors;
create policy "se egen redaktør-række" on public.editors for select to authenticated using (lower(email) = lower(auth.jwt() ->> 'email'));

-- Billedmappe (offentlig læsning, kun redaktører må skrive)
insert into storage.buckets (id, name, public) values ('photos', 'photos', true)
on conflict (id) do update set public = true;

drop policy if exists "redaktører uploader billeder" on storage.objects;
create policy "redaktører uploader billeder" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and public.is_editor());
drop policy if exists "redaktører sletter billeder" on storage.objects;
create policy "redaktører sletter billeder" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and public.is_editor());

-- Tilføjet 24.10.2026
alter table public.places add column if not exists website text, add column if not exists maps_url text, add column if not exists last_visit date, add column if not exists photo_credit text;

-- Vurderinger (24.10.2026)
alter table public.places add column if not exists ratings jsonb not null default '{}'::jsonb, add column if not exists rating_score numeric(2,1);
create table if not exists public.towns (name text primary key, ratings jsonb not null default '{}'::jsonb, rating_score numeric(2,1), rating integer, updated_at timestamptz not null default now());

-- Byer og områder (24.10.2026)
alter table public.towns add column if not exists region text, add column if not exists photos jsonb not null default '[]'::jsonb, add column if not exists note text, add column if not exists lat double precision, add column if not exists lon double precision, add column if not exists drive_km numeric, add column if not exists drive_min integer, add column if not exists visits text[] not null default '{}', add column if not exists last_visit date;
create table if not exists public.regions (name text primary key, photos jsonb not null default '[]'::jsonb, note text, visits text[] not null default '{}', last_visit date, sort integer, updated_at timestamptz not null default now());
