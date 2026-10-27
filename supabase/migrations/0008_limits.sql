-- Gift-List: sensible caps per list, and one list per person.
-- Anyone can now make their own list, so each list has generous limits that protect
-- the shared project (storage, database size). Safe to re-run.
--
--   people per list ........ 300      gifts per list ......... 2,000
--   groups per list ........ 30       families per list ...... 100
--   gifts with a photo ..... 200      lists per person ....... 1

create or replace function enforce_household_limits()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  cap int;
  noun text;
  n int;
begin
  if tg_table_name = 'people' then
    cap := 300; noun := 'people';
  elsif tg_table_name = 'gifts' then
    cap := 2000; noun := 'gifts';
  elsif tg_table_name = 'gift_groups' then
    cap := 30; noun := 'groups';
  elsif tg_table_name = 'families' then
    cap := 100; noun := 'families';
  else
    return new;
  end if;

  execute format('select count(*) from %I where household_id = $1', tg_table_name) into n using new.household_id;
  if n >= cap then
    raise exception 'This list is full (% %). Remove one to add another.', cap, noun;
  end if;
  return new;
end;
$$;

create or replace trigger people_limit_trg
  before insert on people
  for each row execute function enforce_household_limits();

create or replace trigger gifts_limit_trg
  before insert on gifts
  for each row execute function enforce_household_limits();

create or replace trigger groups_limit_trg
  before insert on gift_groups
  for each row execute function enforce_household_limits();

create or replace trigger families_limit_trg
  before insert on families
  for each row execute function enforce_household_limits();

-- At most 200 gifts with a photo per list (counted when a photo is first attached).
create or replace function enforce_photo_limit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.photo_path is not null and (tg_op = 'INSERT' or old.photo_path is null) then
    if (select count(*) from gifts where household_id = new.household_id and photo_path is not null) >= 200 then
      raise exception 'This list has 200 pictures already. Remove one to add another.';
    end if;
  end if;
  return new;
end;
$$;

create or replace trigger gifts_photo_limit_trg
  before insert or update of photo_path on gifts
  for each row execute function enforce_photo_limit();

-- One list per person.
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

  if exists (select 1 from household_members where user_id = auth.uid()) then
    raise exception 'You already have a list.';
  end if;

  insert into households (name)
  values (coalesce(nullif(trim(hname), ''), 'Our Gift List'))
  returning id into hid;

  insert into household_members (household_id, user_id, role, email)
  values (hid, auth.uid(), 'owner', lower(auth.jwt() ->> 'email'));

  return hid;
end;
$$;
