create table if not exists shared_trips (
  share_code text primary key,
  trip_id text not null,
  payload jsonb not null,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shared_trips_updated_at_idx on shared_trips (updated_at desc);
