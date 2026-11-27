-- Gift-List: receipts. A receipt photo (kept in the private gift-photos bucket under
-- '<household_id>/receipts/') can be attached to one or more gifts. Safe to re-run.

create table if not exists receipts (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  photo_path   text not null,
  total        numeric(12,2) check (total is null or total >= 0),
  store        text check (store is null or char_length(store) <= 80),
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (id, household_id)
);

create index if not exists idx_receipts_household on receipts(household_id);

create table if not exists gift_receipts (
  gift_id      uuid not null,
  receipt_id   uuid not null,
  household_id uuid not null references households(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (gift_id, receipt_id),
  -- the gift and the receipt must both be in this household
  foreign key (gift_id, household_id) references gifts(id, household_id) on delete cascade,
  foreign key (receipt_id, household_id) references receipts(id, household_id) on delete cascade
);

create index if not exists idx_gift_receipts_receipt on gift_receipts(receipt_id);
create index if not exists idx_gift_receipts_household on gift_receipts(household_id);

alter table receipts enable row level security;
alter table gift_receipts enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'receipts' and policyname = 'members manage receipts') then
    create policy "members manage receipts"
      on receipts for all
      using (is_household_member(household_id))
      with check (is_household_member(household_id));
  end if;

  if not exists (select 1 from pg_policies where tablename = 'gift_receipts' and policyname = 'members manage gift receipts') then
    create policy "members manage gift receipts"
      on gift_receipts for all
      using (is_household_member(household_id))
      with check (is_household_member(household_id));
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'receipts'
  ) then
    alter publication supabase_realtime add table public.receipts;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'gift_receipts'
  ) then
    alter publication supabase_realtime add table public.gift_receipts;
  end if;
end;
$$;

-- At most 300 receipts per list.
create or replace function enforce_receipt_limit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (select count(*) from receipts where household_id = new.household_id) >= 300 then
    raise exception 'This list is full (300 receipts). Remove one to add another.';
  end if;
  return new;
end;
$$;

drop trigger if exists receipts_limit_trg on receipts;
create trigger receipts_limit_trg
  before insert on receipts
  for each row execute function enforce_receipt_limit();

-- A receipt that no longer covers any gift is removed (its file is deleted by the app).
create or replace function drop_orphan_receipt()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  delete from receipts
  where id = old.receipt_id
    and not exists (select 1 from gift_receipts where receipt_id = old.receipt_id);
  return old;
end;
$$;

drop trigger if exists gift_receipts_orphan_trg on gift_receipts;
create trigger gift_receipts_orphan_trg
  after delete on gift_receipts
  for each row execute function drop_orphan_receipt();
