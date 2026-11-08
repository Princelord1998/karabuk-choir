-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- Safe to run again (everything is "if not exists").

create table if not exists section_types (
  id          int generated always as identity primary key,
  name        text not null unique,
  mass_order  int  not null
);

create table if not exists masses (
  id         bigint generated always as identity primary key,
  mass_date  date not null,
  occasion   text,
  notes      text
);
create index if not exists masses_date_idx on masses (mass_date);

create table if not exists songs (
  id               bigint generated always as identity primary key,
  section_type_id  int  not null references section_types(id),
  title            text not null,
  melody           text,
  language         text,
  psalm_number     int
);
create index if not exists songs_section_idx on songs (section_type_id);

create table if not exists verses (
  id        bigint generated always as identity primary key,
  song_id   bigint not null references songs(id) on delete cascade,
  kind      text   not null default 'verse' check (kind in ('refrain', 'verse', 'coda')),
  verse_no  int,
  text      text   not null
);
create index if not exists verses_song_idx on verses (song_id);

create table if not exists mass_songs (
  mass_id          bigint not null references masses(id) on delete cascade,
  section_type_id  int    not null references section_types(id),
  position         int    not null default 1,
  song_id          bigint not null references songs(id),
  primary key (mass_id, section_type_id, position)
);
create index if not exists mass_songs_song_idx on mass_songs (song_id);

create table if not exists app_users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  role text not null check (role in ('admin', 'editor')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists app_users_role_idx on app_users(role);

-- faster searching in titles and lyrics (optional but recommended)
create extension if not exists pg_trgm with schema extensions;
create index if not exists songs_title_trgm  on songs  using gin (title extensions.gin_trgm_ops);
create index if not exists verses_text_trgm  on verses using gin (text  extensions.gin_trgm_ops);

insert into section_types (name, mass_order) values
  ('Entrée', 1), ('Kyrie', 2), ('Gloria', 3), ('Psaume', 4), ('Acclamation', 5),
  ('Prière universelle', 6), ('Offertoire', 7), ('Sanctus', 8), ('Agnus Dei', 9),
  ('Communion', 10), ('Action de grâce', 11), ('Sortie', 12), ('Autres', 13)
on conflict (name) do nothing;

-- Security: the website talks to the database only through your backend (service_role key).
-- Row Level Security ON with NO policies = nobody can read or write directly with the public anon key.
alter table section_types enable row level security;
alter table masses        enable row level security;
alter table songs         enable row level security;
alter table verses        enable row level security;
alter table mass_songs    enable row level security;
alter table app_users     enable row level security;
