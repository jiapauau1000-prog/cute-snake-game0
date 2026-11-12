-- Break legacy rows where edit_token was copied from share_code.
update shared_trips
set edit_token = upper(substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 32))
where edit_token = share_code;

-- Durable throttling across server instances / deploys.
create table if not exists rate_limits (
  bucket_key text primary key,
  hit_count integer not null,
  reset_at timestamptz not null
);

create index if not exists rate_limits_reset_at_idx on rate_limits (reset_at);
