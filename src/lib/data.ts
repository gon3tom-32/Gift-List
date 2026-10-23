// Loads one household's list from Supabase, keeps it live with Realtime,
// and offers the edits the screens need. Nothing is cached in browser storage.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './supabase';
import { centsToDb, type Cents } from './money';
import {
  fromDb,
  type Gift,
  type GiftEvent,
  type Group,
  type GroupIcon,
  type Household,
  type Invite,
  type Member,
  type Person,
} from './types';
import type { GiftStatus } from './status';

export interface HouseholdState {
  loading: boolean;
  error: string | null;
  household: Household | null;
  members: Member[];
  invites: Invite[];
  groups: Group[];
  people: Person[];
  gifts: Gift[];
}

const empty: HouseholdState = {
  loading: true,
  error: null,
  household: null,
  members: [],
  invites: [],
  groups: [],
  people: [],
  gifts: [],
};

export interface GroupInput {
  name: string;
  icon: GroupIcon;
  budget: Cents | null;
}

export interface PersonInput {
  name: string;
  group_id: string;
  budget?: Cents | null;
  photo_path?: string | null;
}

export interface GiftInput {
  person_id: string;
  name: string;
  store?: string | null;
  link?: string | null;
  photo_path?: string | null;
  estimate?: Cents | null;
  paid?: Cents | null;
  status?: GiftStatus;
  assigned_to?: string | null;
  shared?: boolean;
  ship_by?: string | null;
  payment_method?: string | null;
}

const MONEY_KEYS = new Set(['budget', 'estimate', 'paid']);

/** Money fields go to Postgres as exact strings, never floats. */
function toDb<T extends object>(patch: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    out[k] = MONEY_KEYS.has(k) ? centsToDb(v as Cents | null) : v;
  }
  return out;
}

function upsert<T extends { id: string }>(list: T[], row: T): T[] {
  const i = list.findIndex((x) => x.id === row.id);
  if (i === -1) return [...list, row];
  const copy = list.slice();
  copy[i] = row;
  return copy;
}

function remove<T extends { id: string }>(list: T[], id: string): T[] {
  return list.some((x) => x.id === id) ? list.filter((x) => x.id !== id) : list;
}

function check<T>(res: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (res.error) throw new Error(res.error.message);
  if (res.data === null || res.data === undefined) throw new Error('Nothing came back from the server.');
  return res.data as NonNullable<T>;
}

export function useHouseholdData(householdId: string) {
  const [state, setState] = useState<HouseholdState>(empty);
  const alive = useRef(true);

  const load = useCallback(async () => {
    try {
      const [h, m, inv, g, p, gifts] = await Promise.all([
        supabase.from('households').select('id, name, budget, photo_path').eq('id', householdId).single(),
        supabase
          .from('household_members')
          .select('user_id, role, email, display_name')
          .eq('household_id', householdId)
          .order('joined_at'),
        supabase
          .from('household_invites')
          .select('id, email, accepted_at')
          .eq('household_id', householdId)
          .is('accepted_at', null),
        supabase.from('gift_groups').select('*').eq('household_id', householdId),
        supabase.from('people').select('*').eq('household_id', householdId),
        supabase.from('gifts').select('*').eq('household_id', householdId),
      ]);
      if (!alive.current) return;
      setState({
        loading: false,
        error: null,
        household: fromDb.household(check(h)),
        members: check(m) as Member[],
        invites: check(inv) as Invite[],
        groups: check(g).map(fromDb.group),
        people: check(p).map(fromDb.person),
        gifts: check(gifts).map(fromDb.gift),
      });
    } catch (err) {
      if (!alive.current) return;
      setState((s) => ({ ...s, loading: false, error: err instanceof Error ? err.message : 'Could not load' }));
    }
  }, [householdId]);

  useEffect(() => {
    alive.current = true;
    setState(empty);
    void load();

    // Live updates from the partner's phone.
    const filter = `household_id=eq.${householdId}`;
    const channel = supabase
      .channel(`household:${householdId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gifts', filter }, (e) => {
        if (e.eventType === 'DELETE') return;
        setState((s) => ({ ...s, gifts: upsert(s.gifts, fromDb.gift(e.new)) }));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'people', filter }, (e) => {
        if (e.eventType === 'DELETE') return;
        setState((s) => ({ ...s, people: upsert(s.people, fromDb.person(e.new)) }));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gift_groups', filter }, (e) => {
        if (e.eventType === 'DELETE') return;
        setState((s) => ({ ...s, groups: upsert(s.groups, fromDb.group(e.new)) }));
      })
      // Deletes can't be filtered by household; they only carry the id,
      // and removing an id we don't have is a no-op.
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'gifts' }, (e) => {
        const id = (e.old as { id?: string }).id;
        if (id) setState((s) => ({ ...s, gifts: remove(s.gifts, id) }));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'people' }, (e) => {
        const id = (e.old as { id?: string }).id;
        if (id)
          setState((s) => ({
            ...s,
            people: remove(s.people, id),
            gifts: s.gifts.filter((g) => g.person_id !== id),
          }));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'gift_groups' }, (e) => {
        const id = (e.old as { id?: string }).id;
        if (!id) return;
        setState((s) => {
          const gone = new Set(s.people.filter((p) => p.group_id === id).map((p) => p.id));
          return {
            ...s,
            groups: remove(s.groups, id),
            people: s.people.filter((p) => !gone.has(p.id)),
            gifts: s.gifts.filter((g) => !gone.has(g.person_id)),
          };
        });
      })
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'households', filter: `id=eq.${householdId}` },
        (e) => setState((s) => ({ ...s, household: fromDb.household(e.new) })),
      )
      .subscribe((status) => {
        // After a dropped connection, catch up on anything we missed.
        if (status === 'SUBSCRIBED') void load();
      });

    // Coming back to the app (phone unlocked, tab switched): refresh.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      alive.current = false;
      document.removeEventListener('visibilitychange', onVisible);
      void supabase.removeChannel(channel);
    };
  }, [householdId, load]);

  const actions = useMemo(
    () => ({
      reload: load,

      async updateHousehold(patch: { name?: string; budget?: Cents; photo_path?: string | null }) {
        const row = check(
          await supabase.from('households').update(toDb(patch)).eq('id', householdId).select('id, name, budget, photo_path').single(),
        );
        setState((s) => ({ ...s, household: fromDb.household(row) }));
      },

      async addGroup(input: GroupInput): Promise<Group> {
        const row = fromDb.group(
          check(
            await supabase
              .from('gift_groups')
              .insert({ ...toDb(input), household_id: householdId, sort_order: Date.now() % 2147483647 })
              .select()
              .single(),
          ),
        );
        setState((s) => ({ ...s, groups: upsert(s.groups, row) }));
        return row;
      },

      async updateGroup(id: string, patch: Partial<GroupInput>) {
        const row = fromDb.group(check(await supabase.from('gift_groups').update(toDb(patch)).eq('id', id).select().single()));
        setState((s) => ({ ...s, groups: upsert(s.groups, row) }));
      },

      async deleteGroup(id: string) {
        const del = await supabase.from('gift_groups').delete().eq('id', id);
        if (del.error) throw new Error(del.error.message);
        setState((s) => {
          const gone = new Set(s.people.filter((p) => p.group_id === id).map((p) => p.id));
          return {
            ...s,
            groups: remove(s.groups, id),
            people: s.people.filter((p) => !gone.has(p.id)),
            gifts: s.gifts.filter((g) => !gone.has(g.person_id)),
          };
        });
      },

      async addPerson(input: PersonInput): Promise<Person> {
        const row = fromDb.person(
          check(await supabase.from('people').insert({ ...toDb(input), household_id: householdId }).select().single()),
        );
        setState((s) => ({ ...s, people: upsert(s.people, row) }));
        return row;
      },

      async updatePerson(id: string, patch: Partial<PersonInput>) {
        const row = fromDb.person(check(await supabase.from('people').update(toDb(patch)).eq('id', id).select().single()));
        setState((s) => ({ ...s, people: upsert(s.people, row) }));
      },

      async deletePerson(id: string) {
        const del = await supabase.from('people').delete().eq('id', id);
        if (del.error) throw new Error(del.error.message);
        setState((s) => ({
          ...s,
          people: remove(s.people, id),
          gifts: s.gifts.filter((g) => g.person_id !== id),
        }));
      },

      async addGift(input: GiftInput): Promise<Gift> {
        const { data: auth } = await supabase.auth.getUser();
        const row = fromDb.gift(
          check(
            await supabase
              .from('gifts')
              .insert({ ...toDb(input), household_id: householdId, created_by: auth.user?.id })
              .select()
              .single(),
          ),
        );
        setState((s) => ({ ...s, gifts: upsert(s.gifts, row) }));
        return row;
      },

      async updateGift(id: string, patch: Partial<GiftInput>): Promise<Gift> {
        const row = fromDb.gift(check(await supabase.from('gifts').update(toDb(patch)).eq('id', id).select().single()));
        setState((s) => ({ ...s, gifts: upsert(s.gifts, row) }));
        return row;
      },

      async deleteGift(id: string) {
        const del = await supabase.from('gifts').delete().eq('id', id);
        if (del.error) throw new Error(del.error.message);
        setState((s) => ({ ...s, gifts: remove(s.gifts, id) }));
      },

      async giftHistory(giftId: string): Promise<GiftEvent[]> {
        return check(
          await supabase
            .from('gift_events')
            .select('id, gift_id, user_id, from_status, to_status, created_at')
            .eq('gift_id', giftId)
            .order('created_at', { ascending: false })
            .limit(20),
        ) as GiftEvent[];
      },

      async invite(email: string) {
        const res = await supabase.rpc('invite_partner', { hid: householdId, invite_email: email });
        if (res.error) throw new Error(res.error.message);
        await load();
      },

      /** Creates the partner's login (owner only) via the add-partner Edge Function. */
      async addPartner(email: string, password: string) {
        const { data: auth } = await supabase.auth.getSession();
        const token = auth.session?.access_token;
        if (!token) throw new Error('Sign in first.');
        let res: Response;
        try {
          res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/add-partner`, {
            method: 'POST',
            headers: {
              authorization: `Bearer ${token}`,
              apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
              'content-type': 'application/json',
            },
            body: JSON.stringify({ household_id: householdId, email, password }),
          });
        } catch {
          throw new Error('Could not reach the server. Check your connection and try again.');
        }
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(body.error ?? 'Could not add your partner.');
        await load();
      },

      async cancelInvite(id: string) {
        const del = await supabase.from('household_invites').delete().eq('id', id);
        if (del.error) throw new Error(del.error.message);
        setState((s) => ({ ...s, invites: s.invites.filter((i) => i.id !== id) }));
      },

      async setDisplayName(name: string) {
        const res = await supabase.rpc('set_display_name', { new_name: name });
        if (res.error) throw new Error(res.error.message);
        await load();
      },
    }),
    [householdId, load],
  );

  return { ...state, ...actions };
}

export type HouseholdData = ReturnType<typeof useHouseholdData>;
