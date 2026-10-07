create table if not exists documents (
  path text primary key,
  content text not null,
  version int not null default 1,
  updated_at timestamptz not null default now(),
  updated_by text
);
create table if not exists revisions (
  id bigserial primary key,
  path text not null,
  content text,
  version int not null,
  created_at timestamptz not null default now(),
  author text
);
create index if not exists revisions_path_idx on revisions (path, id desc);
create table if not exists media (
  url text primary key,
  pathname text not null,
  size int not null,
  content_type text not null,
  created_at timestamptz not null default now()
);
