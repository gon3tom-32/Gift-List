-- Gift-List: families inside a group (e.g. "Mike, Sarah & kids" in "Wife's family").
-- People stay in exactly one group; belonging to a family is optional.
-- Safe to re-run.

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
