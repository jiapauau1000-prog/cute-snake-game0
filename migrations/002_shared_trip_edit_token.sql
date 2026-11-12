alter table shared_trips
  add column if not exists edit_token text;

-- Never backfill owner secrets from the public share code.
update shared_trips
set edit_token = upper(substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 32))
where edit_token is null;

alter table shared_trips
  alter column edit_token set not null;
