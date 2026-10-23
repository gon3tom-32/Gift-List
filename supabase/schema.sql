-- Gift-List schema: the full current database setup, for reference.
-- Don't edit this by hand to change the live database. Add a new file in
-- supabase/migrations/ and then update this file to match.

-- Gift-List: initial schema
-- Run once in the Supabase SQL editor for the Gift-List project
-- (or with `supabase db push`). Safe to re-run.
--
-- Changes from the original draft schema:
--   * composite foreign keys so a row can only point at rows in its own household
--   * gift_events has no client insert policy (only the trigger writes history)
--   * storage policies use try_uuid() so odd paths are denied instead of erroring
--   * created_by can't be spoofed; assigned_to must be a household member
--   * household_members keeps an email + display name so partners can see who's who
--   * RPC functions are not callable by signed-out (anon) users

-- ---------------------------------------------------------------------------
-- Households and membership
-- ---------------------------------------------------------------------------

create table if not exists households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default 'Our Gift List',
  budget      numeric(12,2) not null default 0 check (budget >= 0),
  created_at  timestamptz not null default now()
);

-- 0002: shared couple photo beside the list title
alter table households add column if not exists photo_path text;

create table if not exists household_members (
  household_id uuid not null references households(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null default 'editor' check (role in ('owner', 'editor')),
  email        text,
  display_name text check (display_name is null or length(display_name) <= 40),
  joined_at    timestamptz not null default now(),
  last_seen_at timestamptz,  -- when this member last looked; drives the "new" marker
  primary key (household_id, user_id)
);

create table if not exists household_invites (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  email        text not null check (email = lower(email)),
  invited_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  unique (household_id, email)
);

-- ---------------------------------------------------------------------------
-- Groups, people, gifts
-- ---------------------------------------------------------------------------

create table if not exists gift_groups (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name         text not null check (length(trim(name)) > 0),
  icon         text not null default 'gift'
                 check (icon in ('gift', 'paw', 'briefcase', 'tree', 'heart', 'star')),
  budget       numeric(12,2) check (budget is null or budget >= 0),
  sort_order   int not null default 0,
  created_at   timestamptz not null default now(),
  unique (id, household_id)
);

create table if not exists people (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  group_id     uuid not null,
  name         text not null check (length(trim(name)) > 0),
  budget       numeric(12,2) check (budget is null or budget >= 0),
  photo_path   text,   -- path inside the gift-photos bucket, e.g. '<household_id>/people/<id>.webp'
  created_at   timestamptz not null default now(),
  unique (id, household_id),
  -- the group must belong to the same household
  foreign key (group_id, household_id)
    references gift_groups(id, household_id) on delete cascade
);

create table if not exists gifts (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references households(id) on delete cascade,
  person_id      uuid not null,
  name           text not null check (length(trim(name)) > 0),
  store          text,
  link           text,
  photo_path     text,  -- path inside the gift-photos bucket, optional
  estimate       numeric(12,2) check (estimate is null or estimate >= 0),
  paid           numeric(12,2) check (paid is null or paid >= 0),
  status         text not null default 'idea'
                   check (status in ('idea', 'ordered', 'shipped', 'wrapped', 'given')),
  assigned_to    uuid references auth.users(id) on delete set null,
  shared         boolean not null default false,  -- true means both partners buy it
  ship_by        date,
  payment_method text,
  created_by     uuid not null references auth.users(id),
  updated_by     uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- the person must belong to the same household
  foreign key (person_id, household_id)
    references people(id, household_id) on delete cascade
);

-- Audit trail of status changes, with who made each one
create table if not exists gift_events (
  id           bigint generated always as identity primary key,
  gift_id      uuid not null references gifts(id) on delete cascade,
  household_id uuid not null references households(id) on delete cascade,
  user_id      uuid references auth.users(id) on delete set null,
  from_status  text,
  to_status    text not null,
  created_at   timestamptz not null default now()
);

create index if not exists idx_members_user       on household_members(user_id);
create index if not exists idx_invites_email      on household_invites(email) where accepted_at is null;
create index if not exists idx_groups_household   on gift_groups(household_id);
create index if not exists idx_people_household   on people(household_id);
create index if not exists idx_people_group       on people(group_id, household_id);
create index if not exists idx_gifts_household    on gifts(household_id);
create index if not exists idx_gifts_person       on gifts(person_id, household_id);
create index if not exists idx_events_gift        on gift_events(gift_id);
create index if not exists idx_events_household   on gift_events(household_id);

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------

-- True when the signed-in user belongs to the household.
-- security definer avoids recursive policy checks on household_members.
create or replace function is_household_member(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from household_members
    where household_id = hid and user_id = auth.uid()
  );
$$;

-- Turns text into a uuid, or null when it isn't one. Used by storage policies
-- so a path whose first folder isn't a household id is simply denied.
create or replace function try_uuid(t text)
returns uuid
language plpgsql
immutable
set search_path = public
as $$
begin
  return t::uuid;
exception when others then
  return null;
end;
$$;

-- Creates a household and makes the caller its owner.
create or replace function create_household(hname text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  hid uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in first';
  end if;

  insert into households (name)
  values (coalesce(nullif(trim(hname), ''), 'Our Gift List'))
  returning id into hid;

  insert into household_members (household_id, user_id, role, email)
  values (hid, auth.uid(), 'owner', lower(auth.jwt() ->> 'email'));

  return hid;
end;
$$;

-- Adds an invite for another person by email. Only members can invite.
create or replace function invite_partner(hid uuid, invite_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  clean text := lower(trim(invite_email));
begin
  if not is_household_member(hid) then
    raise exception 'Not a member of this household';
  end if;
  if clean !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'That email address does not look right';
  end if;

  insert into household_invites (household_id, email, invited_by)
  values (hid, clean, auth.uid())
  on conflict (household_id, email) do nothing;
end;
$$;

-- Called after sign-in: joins any households that invited this user's email.
create or replace function accept_invites()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := lower(auth.jwt() ->> 'email');
begin
  if auth.uid() is null or me is null then
    return;
  end if;

  insert into household_members (household_id, user_id, role, email)
  select household_id, auth.uid(), 'editor', me
  from household_invites
  where email = me and accepted_at is null
  on conflict (household_id, user_id) do nothing;

  update household_invites
  set accepted_at = now()
  where email = me and accepted_at is null;
end;
$$;

-- Lets a member set the name their partner sees (e.g. "Sam").
create or replace function set_display_name(new_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update household_members
  set display_name = nullif(left(trim(new_name), 40), '')
  where user_id = auth.uid();
end;
$$;

-- Stamps the caller's own membership row with the time they last looked.
create or replace function mark_seen()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update household_members
  set last_seen_at = now()
  where user_id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------------
-- Triggers: stamp edits and log status changes
-- ---------------------------------------------------------------------------

create or replace function gifts_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    -- Signed-in users can't claim someone else created the gift.
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.created_at := now();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;

  if new.assigned_to is not null and not exists (
    select 1 from household_members
    where household_id = new.household_id and user_id = new.assigned_to
  ) then
    raise exception 'The assigned buyer must be in this household';
  end if;

  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists gifts_before_write_trg on gifts;
create trigger gifts_before_write_trg
  before insert or update on gifts
  for each row execute function gifts_before_write();

-- Runs as the table owner, so gift_events needs no client insert policy.
create or replace function gifts_log_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into gift_events (gift_id, household_id, user_id, from_status, to_status)
    values (new.id, new.household_id, auth.uid(), null, new.status);
  elsif new.status is distinct from old.status then
    insert into gift_events (gift_id, household_id, user_id, from_status, to_status)
    values (new.id, new.household_id, auth.uid(), old.status, new.status);
  end if;
  return new;
end;
$$;

drop trigger if exists gifts_log_status_trg on gifts;
create trigger gifts_log_status_trg
  after insert or update on gifts
  for each row execute function gifts_log_status();

-- ---------------------------------------------------------------------------
-- Function permissions: signed-out visitors can't call the RPCs
-- ---------------------------------------------------------------------------

revoke execute on function create_household(text)        from public, anon;
revoke execute on function invite_partner(uuid, text)    from public, anon;
revoke execute on function accept_invites()              from public, anon;
revoke execute on function set_display_name(text)        from public, anon;
revoke execute on function mark_seen()                   from public, anon;
grant  execute on function create_household(text)        to authenticated;
grant  execute on function invite_partner(uuid, text)    to authenticated;
grant  execute on function accept_invites()              to authenticated;
grant  execute on function set_display_name(text)        to authenticated;
grant  execute on function mark_seen()                   to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table households         enable row level security;
alter table household_members  enable row level security;
alter table household_invites  enable row level security;
alter table gift_groups        enable row level security;
alter table people             enable row level security;
alter table gifts              enable row level security;
alter table gift_events        enable row level security;

-- Households: members can read and edit (name, budget) their household.
-- Creation goes through create_household(), so there is no direct insert policy.
drop policy if exists "members read household" on households;
create policy "members read household"
  on households for select
  using (is_household_member(id));

drop policy if exists "members update household" on households;
create policy "members update household"
  on households for update
  using (is_household_member(id))
  with check (is_household_member(id));

-- Membership: members can see who else is in their household.
-- Joining goes through create_household() and accept_invites().
drop policy if exists "members read membership" on household_members;
create policy "members read membership"
  on household_members for select
  using (is_household_member(household_id));

-- Invites: members can see and manage invites for their household.
drop policy if exists "members manage invites" on household_invites;
create policy "members manage invites"
  on household_invites for all
  using (is_household_member(household_id))
  with check (is_household_member(household_id));

-- Shared household data: any member can read, add, edit, and delete.
drop policy if exists "members manage groups" on gift_groups;
create policy "members manage groups"
  on gift_groups for all
  using (is_household_member(household_id))
  with check (is_household_member(household_id));

drop policy if exists "members manage people" on people;
create policy "members manage people"
  on people for all
  using (is_household_member(household_id))
  with check (is_household_member(household_id));

drop policy if exists "members manage gifts" on gifts;
create policy "members manage gifts"
  on gifts for all
  using (is_household_member(household_id))
  with check (is_household_member(household_id));

-- History is read-only for clients; the trigger writes it.
drop policy if exists "members read gift history" on gift_events;
create policy "members read gift history"
  on gift_events for select
  using (is_household_member(household_id));

drop policy if exists "members write gift history" on gift_events;

-- ---------------------------------------------------------------------------
-- Realtime: so both partners see changes right away
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['households', 'gift_groups', 'people', 'gifts'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Photo storage (private bucket)
-- Files are stored at '<household_id>/<kind>/<filename>', for example
-- '<household_id>/gifts/<gift_id>.webp'. The first folder must be the household ID.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gift-photos', 'gift-photos', false, 5242880, array['image/jpeg', 'image/webp', 'image/png'])
on conflict (id) do nothing;

drop policy if exists "members read gift photos" on storage.objects;
create policy "members read gift photos"
  on storage.objects for select
  using (
    bucket_id = 'gift-photos'
    and is_household_member(try_uuid((storage.foldername(name))[1]))
  );

drop policy if exists "members upload gift photos" on storage.objects;
create policy "members upload gift photos"
  on storage.objects for insert
  with check (
    bucket_id = 'gift-photos'
    and is_household_member(try_uuid((storage.foldername(name))[1]))
  );

drop policy if exists "members replace gift photos" on storage.objects;
create policy "members replace gift photos"
  on storage.objects for update
  using (
    bucket_id = 'gift-photos'
    and is_household_member(try_uuid((storage.foldername(name))[1]))
  )
  with check (
    bucket_id = 'gift-photos'
    and is_household_member(try_uuid((storage.foldername(name))[1]))
  );

drop policy if exists "members delete gift photos" on storage.objects;
create policy "members delete gift photos"
  on storage.objects for delete
  using (
    bucket_id = 'gift-photos'
    and is_household_member(try_uuid((storage.foldername(name))[1]))
  );

-- ---------------------------------------------------------------------------
-- 0003: families inside a group
-- ---------------------------------------------------------------------------

create table if not exists families (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  group_id     uuid not null,
  name         text not null check (length(trim(name)) > 0),
  sort_order   int not null default 0,
  created_at   timestamptz not null default now(),
  unique (id, group_id),
  -- the group must be in the same household
  foreign key (group_id, household_id)
    references gift_groups(id, household_id) on delete cascade
);

create index if not exists idx_families_group on families(group_id, household_id);

alter table people add column if not exists family_id uuid;
create index if not exists idx_people_family on people(family_id);

-- A person's family must be in the person's own group (so also the same
-- household). Deleting a family keeps its people and only clears family_id.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'people_family_fk') then
    alter table people add constraint people_family_fk
      foreign key (family_id, group_id) references families(id, group_id)
      on delete set null (family_id);
  end if;
end;
$$;

alter table families enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'families' and policyname = 'members manage families'
  ) then
    create policy "members manage families"
      on families for all
      using (is_household_member(household_id))
      with check (is_household_member(household_id));
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'families'
  ) then
    alter publication supabase_realtime add table public.families;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 0005: push notifications
-- ---------------------------------------------------------------------------
create table if not exists push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  created_at   timestamptz not null default now()
);

create index if not exists idx_push_household on push_subscriptions(household_id);
create index if not exists idx_push_user      on push_subscriptions(user_id);

alter table push_subscriptions enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'push_subscriptions' and policyname = 'members read own push') then
    create policy "members read own push"
      on push_subscriptions for select
      using (user_id = auth.uid() and is_household_member(household_id));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'push_subscriptions' and policyname = 'members add own push') then
    create policy "members add own push"
      on push_subscriptions for insert
      with check (user_id = auth.uid() and is_household_member(household_id));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'push_subscriptions' and policyname = 'members delete own push') then
    create policy "members delete own push"
      on push_subscriptions for delete
      using (user_id = auth.uid() and is_household_member(household_id));
  end if;
end;
$$;

-- Remembers that the "over budget" alert was already sent, so it fires once.
alter table households add column if not exists over_budget_notified boolean not null default false;

-- ---------------------------------------------------------------------------
-- 0006: push notification triggers and daily countdown
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 0007: one gift for several people
-- ---------------------------------------------------------------------------
-- Composite foreign keys need a unique (id, household_id) on gifts.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'gifts_id_household_key') then
    alter table gifts add constraint gifts_id_household_key unique (id, household_id);
  end if;
end;
$$;

create table if not exists gift_recipients (
  gift_id      uuid not null,
  person_id    uuid not null,
  household_id uuid not null references households(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (gift_id, person_id),
  -- the gift and the person must both be in this household
  foreign key (gift_id, household_id) references gifts(id, household_id) on delete cascade,
  foreign key (person_id, household_id) references people(id, household_id) on delete cascade
);

create index if not exists idx_gift_recipients_person on gift_recipients(person_id);
create index if not exists idx_gift_recipients_household on gift_recipients(household_id);

alter table gift_recipients enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'gift_recipients' and policyname = 'members manage gift recipients') then
    create policy "members manage gift recipients"
      on gift_recipients for all
      using (is_household_member(household_id))
      with check (is_household_member(household_id));
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'gift_recipients'
  ) then
    alter publication supabase_realtime add table public.gift_recipients;
  end if;
end;
$$;

-- An extra recipient can't also be the gift's main person.
create or replace function gift_recipients_check()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (select 1 from gifts where id = new.gift_id and person_id = new.person_id) then
    raise exception 'That person is already the main recipient of this gift';
  end if;
  return new;
end;
$$;

drop trigger if exists gift_recipients_check_trg on gift_recipients;
create trigger gift_recipients_check_trg
  before insert or update on gift_recipients
  for each row execute function gift_recipients_check();

-- If the main person changes to someone who was an extra, drop that extra row.
create or replace function gifts_drop_extra_main()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  delete from gift_recipients where gift_id = new.id and person_id = new.person_id;
  return new;
end;
$$;

drop trigger if exists gifts_drop_extra_main_trg on gifts;
create trigger gifts_drop_extra_main_trg
  after update of person_id on gifts
  for each row execute function gifts_drop_extra_main();

-- Deleting a person must not delete a gift that is shared with others:
-- the first extra person becomes the main recipient instead.
create or replace function people_keep_shared_gifts()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  g record;
  next_person uuid;
begin
  for g in select id from gifts where person_id = old.id loop
    select person_id into next_person
    from gift_recipients
    where gift_id = g.id and person_id <> old.id
    order by created_at, person_id
    limit 1;
    if next_person is not null then
      update gifts set person_id = next_person where id = g.id;
    end if;
  end loop;
  return old;
end;
$$;

drop trigger if exists people_keep_shared_gifts_trg on people;
create trigger people_keep_shared_gifts_trg
  before delete on people
  for each row execute function people_keep_shared_gifts();
