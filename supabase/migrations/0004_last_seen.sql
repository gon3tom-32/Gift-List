-- Gift-List: remember when each partner last looked at the list, so the app
-- can mark gifts the other partner added or changed since then.

alter table household_members add column if not exists last_seen_at timestamptz;

-- A member stamps only their own row.
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

revoke execute on function mark_seen() from public, anon;
grant  execute on function mark_seen() to authenticated;
