-- Earshot community reports. Run this in Supabase: SQL Editor > New query > Run.
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  lat double precision not null check (lat between -90 and 90),
  lon double precision not null check (lon between -180 and 180),
  type text not null check (type in ('traffic','honking','nightlife','construction','neighbours','dogs','loudspeaker','trains','aircraft','industry','other')),
  slot text not null check (slot in ('morning','afternoon','evening','night')),
  loudness smallint not null check (loudness between 1 and 5),
  measured_db smallint check (measured_db between 20 and 130),
  note text check (char_length(note) <= 240)
);

create index if not exists reports_lat_lon on public.reports (lat, lon);

-- Anyone can read and add reports anonymously; nobody can edit or delete through the API.
alter table public.reports enable row level security;

drop policy if exists "read reports" on public.reports;
create policy "read reports" on public.reports for select to anon using (true);

drop policy if exists "add reports" on public.reports;
create policy "add reports" on public.reports for insert to anon with check (true);
