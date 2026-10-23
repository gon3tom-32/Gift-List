-- Gift-List: one gift for several people (a box of soaps for four).
-- gifts.person_id stays the main recipient; gift_recipients lists the EXTRA
-- people. Cost is divided equally in the app (never stored). Safe to re-run.

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
