-- 0009: a "person" can be a group of people who all get the same gift,
-- for example "Teachers" with 12 people. Gift prices stay per person and the
-- app multiplies by the headcount. Everyone already on a list stays at 1.

alter table people
  add column if not exists headcount int not null default 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'people_headcount_check' and conrelid = 'people'::regclass
  ) then
    alter table people
      add constraint people_headcount_check check (headcount between 1 and 500);
  end if;
end $$;
