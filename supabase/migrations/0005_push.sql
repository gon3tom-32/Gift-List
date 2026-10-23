-- Gift-List: push notifications.
-- Each phone that turns notifications on stores its push address here.
-- A member can only see and manage their own phones' rows.

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
