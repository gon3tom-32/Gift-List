-- Gift-List: send notifications when gifts change, and a daily Christmas countdown.
-- The database calls the send-push Edge Function over HTTP (pg_net, so it never
-- slows or blocks saving a gift). The shared secret lives in Vault under the
-- name 'push_secret' and is set once by hand; it is never in this file.

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
  end if;
end;
$$;

create or replace function gifts_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  secret text;
  person text;
begin
  -- Only new gifts, status changes and money changes can matter.
  if tg_op = 'UPDATE'
     and new.status is not distinct from old.status
     and new.estimate is not distinct from old.estimate
     and new.paid is not distinct from old.paid then
    return new;
  end if;

  select decrypted_secret into secret from vault.decrypted_secrets where name = 'push_secret';
  if secret is null then
    return new;
  end if;

  select name into person from people where id = new.person_id;

  perform net.http_post(
    url := 'https://bvqpvaevudapljsskmzx.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object('content-type', 'application/json', 'x-push-secret', secret),
    body := jsonb_build_object(
      'kind', 'activity',
      'household_id', new.household_id,
      'actor', auth.uid(),
      'op', lower(tg_op),
      'gift_name', new.name,
      'person_name', person,
      'old_status', case when tg_op = 'UPDATE' then old.status end,
      'new_status', new.status
    )
  );
  return new;
exception when others then
  -- Notifications are a nicety: never stop a gift from saving.
  return new;
end;
$$;

revoke execute on function gifts_notify() from public, anon, authenticated;

drop trigger if exists gifts_notify_trg on gifts;
create trigger gifts_notify_trg
  after insert or update on gifts
  for each row execute function gifts_notify();

-- Daily at 17:00 UTC (10am Pacific in summer, 9am in winter); the function only
-- speaks up on countdown milestones (30, 14, 7, 3, 1 days and Christmas Day).
create or replace function push_daily_countdown()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  secret text;
begin
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'push_secret';
  if secret is null then
    return;
  end if;
  perform net.http_post(
    url := 'https://bvqpvaevudapljsskmzx.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object('content-type', 'application/json', 'x-push-secret', secret),
    body := jsonb_build_object('kind', 'countdown')
  );
end;
$$;

revoke execute on function push_daily_countdown() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'gift-list-countdown';
    perform cron.schedule('gift-list-countdown', '0 17 * * *', 'select push_daily_countdown()');
  end if;
end;
$$;
