alter table shared_trips
  add column if not exists edit_token text;

update shared_trips
set edit_token = share_code
where edit_token is null;

alter table shared_trips
  alter column edit_token set not null;
