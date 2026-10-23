-- Gift-List RLS tests
--
-- Proves that someone outside a household can't read or change its rows,
-- and that the household's two partners can.
--
-- Safe to run in the Supabase SQL editor: everything happens inside one
-- transaction that is rolled back at the end, so no test data is kept.
-- The first failing check stops the script with an error starting "FAIL".
-- Success ends with the row 'ALL RLS TESTS PASSED'.

begin;

-- Test accounts -------------------------------------------------------------
create temp table t_ids (k text primary key, v uuid) on commit drop;
grant all on t_ids to authenticated, anon;

insert into t_ids values
  ('alice',   gen_random_uuid()),
  ('bob',     gen_random_uuid()),
  ('mallory', gen_random_uuid());

insert into auth.users (id, email)
select v, k || '@rls-test.example' from t_ids;

-- ===========================================================================
-- Alice (owner) sets up a household with a group, a person, a gift, a photo
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', (select v from t_ids where k = 'alice'),
                    'email', 'alice@rls-test.example', 'role', 'authenticated')::text, true);

insert into t_ids select 'home', create_household('Alice and Bob');
select invite_partner((select v from t_ids where k = 'home'), '  Bob@RLS-test.example ');

with g as (
  insert into gift_groups (household_id, name, icon)
  select v, 'Our family', 'gift' from t_ids where k = 'home'
  returning id
) insert into t_ids select 'group', id from g;

with p as (
  insert into people (household_id, group_id, name)
  select (select v from t_ids where k = 'home'), (select v from t_ids where k = 'group'), 'Grandma'
  returning id
) insert into t_ids select 'person', id from p;

-- Families: Grandma joins the "Rose family" in the same group
with f as (
  insert into families (household_id, group_id, name)
  select (select v from t_ids where k = 'home'), (select v from t_ids where k = 'group'), 'Rose family'
  returning id
) insert into t_ids select 'family', id from f;
update people set family_id = (select v from t_ids where k = 'family') where id = (select v from t_ids where k = 'person');

-- created_by is set from the signed-in user, even if the client sends another id
with x as (
  insert into gifts (household_id, person_id, name, estimate, created_by)
  select (select v from t_ids where k = 'home'), (select v from t_ids where k = 'person'),
         'Warm scarf', 25.00, (select v from t_ids where k = 'mallory')
  returning id
) insert into t_ids select 'gift', id from x;

insert into storage.objects (bucket_id, name)
select 'gift-photos', v || '/gifts/scarf.webp' from t_ids where k = 'home';

do $$
begin
  if (select created_by from gifts) is distinct from (select v from t_ids where k = 'alice') then
    raise exception 'FAIL: created_by should be Alice, not the id the client sent';
  end if;
  if (select count(*) from household_members) <> 1 then
    raise exception 'FAIL: Alice should see exactly her own membership';
  end if;
end $$;

-- Status changes are logged with who made them
update gifts set status = 'ordered', paid = 22.50;

do $$
begin
  if (select count(*) from gift_events) <> 2 then
    raise exception 'FAIL: expected 2 gift_events (created + ordered), got %', (select count(*) from gift_events);
  end if;
  if exists (select 1 from gift_events where user_id is distinct from (select v from t_ids where k = 'alice')) then
    raise exception 'FAIL: gift_events should record Alice as the user';
  end if;
end $$;

-- Assigning a buyer who isn't in the household is refused
do $$
declare ok boolean := false;
begin
  begin
    update gifts set assigned_to = (select v from t_ids where k = 'mallory');
  exception when others then ok := true;
  end;
  if not ok then raise exception 'FAIL: assigned_to accepted a non-member'; end if;
end $$;

-- ===========================================================================
-- Mallory (signed in, not a member) sees and changes nothing
-- ===========================================================================
select set_config('request.jwt.claims',
  json_build_object('sub', (select v from t_ids where k = 'mallory'),
                    'email', 'mallory@rls-test.example', 'role', 'authenticated')::text, true);
select accept_invites();  -- she has no invite, so this must not let her in

do $$
begin
  if (select count(*) from households)        <> 0 then raise exception 'FAIL: non-member can read households'; end if;
  if (select count(*) from household_members) <> 0 then raise exception 'FAIL: non-member can read household_members'; end if;
  if (select count(*) from household_invites) <> 0 then raise exception 'FAIL: non-member can read household_invites'; end if;
  if (select count(*) from gift_groups)       <> 0 then raise exception 'FAIL: non-member can read gift_groups'; end if;
  if (select count(*) from people)            <> 0 then raise exception 'FAIL: non-member can read people'; end if;
  if (select count(*) from gifts)             <> 0 then raise exception 'FAIL: non-member can read gifts'; end if;
  if (select count(*) from gift_events)       <> 0 then raise exception 'FAIL: non-member can read gift_events'; end if;
  if (select count(*) from families)          <> 0 then raise exception 'FAIL: non-member can read families'; end if;
  if (select count(*) from storage.objects where bucket_id = 'gift-photos') <> 0 then
    raise exception 'FAIL: non-member can read gift photos';
  end if;
  if is_household_member((select v from t_ids where k = 'home')) then
    raise exception 'FAIL: is_household_member is true for a non-member';
  end if;
end $$;

-- Updates and deletes silently match zero rows
update households set budget = 999999 where id = (select v from t_ids where k = 'home');
update households set photo_path = 'evil.webp' where id = (select v from t_ids where k = 'home');

do $$
declare ok boolean := false;
begin
  begin
    insert into storage.objects (bucket_id, name)
    select 'gift-photos', v || '/household/evil.webp' from t_ids where k = 'home';
  exception when others then ok := true;
  end;
  if not ok then raise exception 'FAIL: non-member uploaded a household photo'; end if;
end $$;
update gifts set name = 'hacked';
update families set name = 'hacked';

do $$
declare ok boolean := false;
begin
  begin
    insert into families (household_id, group_id, name)
    select (select v from t_ids where k = 'home'), (select v from t_ids where k = 'group'), 'Sneaky family';
  exception when others then ok := true;
  end;
  if not ok then raise exception 'FAIL: non-member created a family'; end if;
end $$;
delete from gifts;
delete from people;
delete from gift_groups;

-- Inserts into Alice's household are refused
do $$
declare ok boolean := false;
begin
  begin
    insert into gift_groups (household_id, name) select v, 'Sneaky' from t_ids where k = 'home';
  exception when others then ok := true;
  end;
  if not ok then raise exception 'FAIL: non-member inserted a group'; end if;
end $$;

do $$
declare ok boolean := false;
begin
  begin
    insert into storage.objects (bucket_id, name)
    select 'gift-photos', v || '/gifts/evil.webp' from t_ids where k = 'home';
  exception when others then ok := true;
  end;
  if not ok then raise exception 'FAIL: non-member uploaded a photo'; end if;
end $$;

-- A path whose first folder isn't a household id is denied (not a crash)
do $$
declare ok boolean := false;
begin
  begin
    insert into storage.objects (bucket_id, name) values ('gift-photos', 'not-a-uuid/x.webp');
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL: odd photo path was not denied by policy'; end if;
end $$;

do $$
declare ok boolean := false;
begin
  begin
    perform invite_partner((select v from t_ids where k = 'home'), 'mallory2@rls-test.example');
  exception when others then ok := true;
  end;
  if not ok then raise exception 'FAIL: non-member sent an invite'; end if;
end $$;

do $$
declare ok boolean := false;
begin
  begin
    insert into gift_events (gift_id, household_id, to_status)
    select (select v from t_ids where k = 'gift'), (select v from t_ids where k = 'home'), 'given';
  exception when others then ok := true;
  end;
  if not ok then raise exception 'FAIL: client wrote a gift_events row directly'; end if;
end $$;

-- Mallory's own household can't point at Alice's person
insert into t_ids select 'evil_home', create_household('Mallory');

do $$
declare ok boolean := false;
begin
  begin
    insert into gifts (household_id, person_id, name)
    select (select v from t_ids where k = 'evil_home'), (select v from t_ids where k = 'person'), 'Trojan';
  exception when others then ok := true;
  end;
  if not ok then raise exception 'FAIL: gift linked to a person in another household'; end if;
end $$;

do $$
declare ok boolean := false;
begin
  begin
    insert into people (household_id, group_id, name)
    select (select v from t_ids where k = 'evil_home'), (select v from t_ids where k = 'group'), 'Trojan';
  exception when others then ok := true;
  end;
  if not ok then raise exception 'FAIL: person linked to a group in another household'; end if;
end $$;

-- Her household can't make a family in Alice's group
do $$
declare ok boolean := false;
begin
  begin
    insert into families (household_id, group_id, name)
    select (select v from t_ids where k = 'evil_home'), (select v from t_ids where k = 'group'), 'Trojan family';
  exception when others then ok := true;
  end;
  if not ok then raise exception 'FAIL: family linked to a group in another household'; end if;
end $$;

-- ...and her own person can't join Alice's family
with g as (
  insert into gift_groups (household_id, name) select v, 'Evil group' from t_ids where k = 'evil_home' returning id
) insert into t_ids select 'evil_group', id from g;

do $$
declare ok boolean := false;
begin
  begin
    insert into people (household_id, group_id, name, family_id)
    select (select v from t_ids where k = 'evil_home'), (select v from t_ids where k = 'evil_group'), 'Trojan',
           (select v from t_ids where k = 'family');
  exception when others then ok := true;
  end;
  if not ok then raise exception 'FAIL: person joined a family in another household'; end if;
end $$;

-- Moving the gift into her household is also impossible: she can't see it
update gifts set household_id = (select v from t_ids where k = 'evil_home');

-- ===========================================================================
-- Signed-out visitor (anon) sees nothing and can't call the RPCs
-- ===========================================================================
reset role;
set local role anon;
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);

do $$
begin
  if (select count(*) from gifts) <> 0 then raise exception 'FAIL: anon can read gifts'; end if;
  if (select count(*) from households) <> 0 then raise exception 'FAIL: anon can read households'; end if;
end $$;

do $$
declare ok boolean := false;
begin
  begin
    perform create_household('Anon');
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL: anon could call create_household'; end if;
end $$;

-- ===========================================================================
-- Bob (invited partner) joins and sees and edits everything
-- ===========================================================================
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', (select v from t_ids where k = 'bob'),
                    'email', 'bob@rls-test.example', 'role', 'authenticated')::text, true);

do $$
begin
  if (select count(*) from gifts) <> 0 then raise exception 'FAIL: Bob sees gifts before accepting'; end if;
end $$;

select accept_invites();

do $$
begin
  if (select count(*) from households) <> 1        then raise exception 'FAIL: Bob should see 1 household'; end if;
  if (select count(*) from household_members) <> 2 then raise exception 'FAIL: Bob should see 2 members'; end if;
  if (select count(*) from gifts) <> 1             then raise exception 'FAIL: Bob should see 1 gift'; end if;
  if (select name from gifts) <> 'Warm scarf'      then raise exception 'FAIL: Mallory changed the gift name'; end if;
  if (select household_id from gifts) <> (select v from t_ids where k = 'home') then
    raise exception 'FAIL: Mallory moved the gift';
  end if;
  if (select budget from households) <> 0          then raise exception 'FAIL: Mallory changed the budget'; end if;
  if (select photo_path from households) is not null then raise exception 'FAIL: Mallory set the household photo'; end if;
  if (select count(*) from families) <> 1 then raise exception 'FAIL: Bob should see 1 family'; end if;
  if (select name from families) <> 'Rose family' then raise exception 'FAIL: Mallory renamed the family'; end if;
  if (select family_id from people) is distinct from (select v from t_ids where k = 'family') then
    raise exception 'FAIL: Grandma should be in the Rose family';
  end if;
  if (select count(*) from storage.objects where bucket_id = 'gift-photos') <> 1 then
    raise exception 'FAIL: Bob should see the photo';
  end if;
end $$;

update gifts set status = 'wrapped', assigned_to = (select v from t_ids where k = 'bob');
-- Bob adds a second family; a person in another group can't join it
with f as (
  insert into families (household_id, group_id, name)
  select (select v from t_ids where k = 'home'), (select v from t_ids where k = 'group'), 'Kids'
  returning id
) insert into t_ids select 'family2', id from f;
update people set family_id = (select v from t_ids where k = 'family2');

with g as (
  insert into gift_groups (household_id, name) select v, 'Coworkers' from t_ids where k = 'home' returning id
) insert into t_ids select 'group2', id from g;

do $$
declare ok boolean := false;
begin
  begin
    insert into people (household_id, group_id, name, family_id)
    select (select v from t_ids where k = 'home'), (select v from t_ids where k = 'group2'), 'Priya',
           (select v from t_ids where k = 'family2');
  exception when others then ok := true;
  end;
  if not ok then raise exception 'FAIL: person joined a family from another group'; end if;
end $$;

update households set budget = 500.00, photo_path = (select v from t_ids where k = 'home') || '/household/us.webp';

do $$
begin
  if (select status from gifts) <> 'wrapped' then raise exception 'FAIL: Bob could not update the gift'; end if;
  if (select budget from households) <> 500.00 then raise exception 'FAIL: Bob could not set the budget'; end if;
  if (select photo_path from households) not like '%/household/us.webp' then raise exception 'FAIL: Bob could not set the household photo'; end if;
  if (select family_id from people where name = 'Grandma') is distinct from (select v from t_ids where k = 'family2') then
    raise exception 'FAIL: Bob could not move Grandma to another family';
  end if;
  if not exists (select 1 from gift_events where to_status = 'wrapped'
                 and user_id = (select v from t_ids where k = 'bob')) then
    raise exception 'FAIL: Bob''s status change was not logged as his';
  end if;
end $$;

-- "Last looked": a member stamps their own row only
select mark_seen();

do $$
begin
  if (select last_seen_at from household_members where user_id = (select v from t_ids where k = 'bob')) is null then
    raise exception 'FAIL: mark_seen did not stamp Bob';
  end if;
  if (select last_seen_at from household_members where user_id = (select v from t_ids where k = 'alice')) is not null then
    raise exception 'FAIL: mark_seen stamped Alice''s row';
  end if;
end $$;

-- Push subscriptions: each member manages only their own phones
insert into push_subscriptions (household_id, user_id, endpoint, p256dh, auth)
select (select v from t_ids where k = 'home'), (select v from t_ids where k = 'bob'), 'https://push.example/bob', 'k', 'a';

do $$
declare ok boolean := false;
begin
  -- Bob can't register a phone for Alice
  begin
    insert into push_subscriptions (household_id, user_id, endpoint, p256dh, auth)
    select (select v from t_ids where k = 'home'), (select v from t_ids where k = 'alice'), 'https://push.example/fake', 'k', 'a';
  exception when others then ok := true;
  end;
  if not ok then raise exception 'FAIL: Bob registered a phone for Alice'; end if;
  if (select count(*) from push_subscriptions) <> 1 then raise exception 'FAIL: Bob cannot see exactly his own phone'; end if;
end $$;

-- Gifts for several people: extras live in gift_recipients
with a as (
  insert into people (household_id, group_id, name)
  select (select v from t_ids where k = 'home'), (select v from t_ids where k = 'group'), 'Aunt A'
  returning id
) insert into t_ids select 'auntA', id from a;
with b as (
  insert into people (household_id, group_id, name)
  select (select v from t_ids where k = 'home'), (select v from t_ids where k = 'group'), 'Aunt B'
  returning id
) insert into t_ids select 'auntB', id from b;
with s as (
  insert into gifts (household_id, person_id, name, estimate)
  select (select v from t_ids where k = 'home'), (select v from t_ids where k = 'auntA'), 'Soap box', 25.00
  returning id
) insert into t_ids select 'soap', id from s;

insert into gift_recipients (gift_id, person_id, household_id)
select (select v from t_ids where k = 'soap'), (select v from t_ids where k = 'auntB'), (select v from t_ids where k = 'home');

do $$
declare ok boolean := false;
begin
  -- the main person can't also be an extra
  begin
    insert into gift_recipients (gift_id, person_id, household_id)
    select (select v from t_ids where k = 'soap'), (select v from t_ids where k = 'auntA'), (select v from t_ids where k = 'home');
  exception when others then ok := true;
  end;
  if not ok then raise exception 'FAIL: the main person was added as an extra recipient'; end if;
end $$;

-- Deleting the main person keeps the shared gift: Aunt B becomes the main person
delete from people where id = (select v from t_ids where k = 'auntA');

do $$
begin
  if (select person_id from gifts where id = (select v from t_ids where k = 'soap')) is distinct from (select v from t_ids where k = 'auntB') then
    raise exception 'FAIL: the shared gift did not move to the next person';
  end if;
  if exists (select 1 from gift_recipients where gift_id = (select v from t_ids where k = 'soap')) then
    raise exception 'FAIL: the promoted person is still listed as an extra';
  end if;
end $$;

-- Deleting the last person deletes the gift
delete from people where id = (select v from t_ids where k = 'auntB');
do $$
begin
  if exists (select 1 from gifts where name = 'Soap box') then raise exception 'FAIL: gift survived with no recipients'; end if;
end $$;

reset role;

-- Signed-out visitors can't call it
set local role anon;
do $$
declare ok boolean := false;
begin
  begin
    perform mark_seen();
  exception when others then ok := true;
  end;
  if not ok then raise exception 'FAIL: anon could call mark_seen'; end if;
end $$;
reset role;

-- Neither the partner nor an outsider can read Bob's phone
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', (select v from t_ids where k = 'alice'),
                    'email', 'alice@rls-test.example', 'role', 'authenticated')::text, true);
do $$
begin
  if (select count(*) from push_subscriptions) <> 0 then raise exception 'FAIL: Alice can read Bob''s push subscription'; end if;
end $$;
select set_config('request.jwt.claims',
  json_build_object('sub', (select v from t_ids where k = 'mallory'),
                    'email', 'mallory@rls-test.example', 'role', 'authenticated')::text, true);
do $$
begin
  if (select count(*) from push_subscriptions) <> 0 then raise exception 'FAIL: an outsider can read push subscriptions'; end if;
end $$;
do $$
declare ok boolean := false;
begin
  if (select count(*) from gift_recipients) <> 0 then raise exception 'FAIL: an outsider can read gift recipients'; end if;
end $$;
reset role;

select 'ALL RLS TESTS PASSED' as result;

rollback;
