import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { useHouseholdData } from '../lib/data';
import { AppContext, UNDO_MS, type AppContextValue, type ToastAction } from '../lib/context';
import { routeHref, useRoute } from '../lib/route';
import { personTotals, sumGifts, type Totals } from '../lib/money';
import { extrasByGift, recipientIds } from '../lib/recipients';
import { isOpen, shouldCelebrate, statusIndex, type GiftStatus } from '../lib/status';
import { errorText } from '../lib/supabase';
import type { Gift } from '../lib/types';
import { isNewFromPartner } from '../lib/newness';
import { supabase } from '../lib/supabase';
import { Header } from '../components/Header';
import { Icon } from '../components/Icon';
import { GiftCard } from '../components/Cards';
import { confetti } from '../components/delight';
import { PeopleView } from './PeopleView';
import { PersonView } from './PersonView';
import { GiftsView } from './GiftsView';
import { QuickAddSheet } from '../sheets/QuickAddSheet';
import { GiftSheet } from '../sheets/GiftSheet';
import { PersonSheet } from '../sheets/PersonSheet';
import { GroupSheet } from '../sheets/GroupSheet';
import { FamilySheet } from '../sheets/FamilySheet';
import { SettingsSheet } from '../sheets/SettingsSheet';

export type SheetState =
  | { kind: 'quick'; personId?: string; link?: string | null; name?: string | null }
  | { kind: 'gift'; id: string }
  | { kind: 'person'; id?: string; groupId?: string; familyId?: string }
  | { kind: 'group'; id?: string }
  | { kind: 'family'; id?: string; groupId: string }
  | { kind: 'settings' };

export interface HomeTools {
  openSheet: (s: SheetState) => void;
  changeStatus: (g: Gift, to: GiftStatus) => Promise<void>;
  justAdded: string | null;
  markAdded: (giftId: string) => void;
  totalsByPerson: Map<string, Totals>;
  totalsByGroup: Map<string, Totals>;
  newGifts: Set<string>;
  renderGift: (g: Gift, opts?: { showPerson?: boolean }) => ReactElement;
}

export function Home({ householdId, me }: { householdId: string; me: string }) {
  const data = useHouseholdData(householdId);
  const route = useRoute();
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [toastText, setToastText] = useState<{ message: string; action?: ToastAction } | null>(null);
  const toastTimer = useRef<number>(undefined);

  const toast = useCallback((message: string, action?: ToastAction) => {
    setToastText({ message, action });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastText(null), action ? UNDO_MS : 3500);
  }, []);

  const ctx: AppContextValue = useMemo(() => ({ data, me, toast }), [data, me, toast]);

  const totals = useMemo(() => sumGifts(data.gifts), [data.gifts]);
  const openCount = useMemo(() => data.gifts.filter((g) => isOpen(g.status)).length, [data.gifts]);

  // A gift shared between people counts once overall; each person carries their share.
  const totalsByPerson = useMemo(() => {
    const extras = extrasByGift(data.recipients);
    return personTotals(data.gifts, (g) => recipientIds(g, extras));
  }, [data.gifts, data.recipients]);

  const totalsByGroup = useMemo(() => {
    const groupOf = new Map(data.people.map((p) => [p.id, p.group_id]));
    const byGroup = new Map<string, Totals>();
    for (const [personId, t] of totalsByPerson) {
      const gid = groupOf.get(personId);
      if (!gid) continue;
      const cur = byGroup.get(gid) ?? { spent: 0, planned: 0 };
      byGroup.set(gid, { spent: cur.spent + t.spent, planned: cur.planned + t.planned });
    }
    return byGroup;
  }, [totalsByPerson, data.people]);

  // "New" is measured against when I last looked at the start of this visit.
  // The stamp moves forward when I leave, so markers last for the whole visit.
  const seenAt = useRef<string | null | undefined>(undefined);
  if (seenAt.current === undefined && !data.loading && data.household) {
    seenAt.current = data.members.find((m) => m.user_id === me)?.last_seen_at ?? null;
  }
  const newGifts = useMemo(
    () => new Set(data.gifts.filter((g) => isNewFromPartner(g, me, seenAt.current ?? null)).map((g) => g.id)),
    [data.gifts, me],
  );
  useEffect(() => {
    const stamp = () => {
      if (document.visibilityState === 'hidden') void supabase.rpc('mark_seen');
    };
    document.addEventListener('visibilitychange', stamp);
    window.addEventListener('pagehide', stamp);
    return () => {
      document.removeEventListener('visibilitychange', stamp);
      window.removeEventListener('pagehide', stamp);
    };
  }, []);

  const markAdded = useCallback((id: string) => {
    setJustAdded(id);
    window.setTimeout(() => setJustAdded((cur) => (cur === id ? null : cur)), 1200);
  }, []);

  const { updateGift } = data;
  const changeStatus = useCallback(
    async (g: Gift, to: GiftStatus) => {
      try {
        await updateGift(g.id, { status: to });
        const undo: ToastAction = {
          label: 'Undo',
          run: async () => {
            try {
              await updateGift(g.id, { status: g.status });
            } catch (err) {
              toast(errorText(err));
            }
          },
        };
        if (shouldCelebrate(g.status, to)) {
          confetti();
          toast(`${g.name} is given. Ho ho ho!`, undo);
        } else if (statusIndex(to) < statusIndex(g.status)) {
          toast(`Moved back to ${to}.`, undo);
        } else {
          toast(`Marked ${to}.`, undo);
        }
      } catch (err) {
        toast(errorText(err));
      }
    },
    [updateGift, toast],
  );

  const peopleById = useMemo(() => new Map(data.people.map((p) => [p.id, p])), [data.people]);

  const tools: HomeTools = {
    openSheet: setSheet,
    changeStatus,
    justAdded,
    markAdded,
    totalsByPerson,
    totalsByGroup,
    newGifts,
    renderGift: (g, opts) => (
      <GiftCard
        key={g.id}
        gift={g}
        person={opts?.showPerson ? peopleById.get(g.person_id) : undefined}
        members={data.members}
        me={me}
        wiggle={justAdded === g.id}
        isNew={newGifts.has(g.id)}
        onOpen={() => setSheet({ kind: 'gift', id: g.id })}
        onStatus={(to) => void changeStatus(g, to)}
      />
    ),
  };

  // A person that was deleted (maybe by the partner) sends us back home.
  // Shared from another app: open quick-add with the link, then tidy the address
  // so a reload doesn't open it again.
  const shared = route.name === 'add' && !data.loading && data.household ? route : null;
  useEffect(() => {
    if (!shared) return;
    setSheet({ kind: 'quick', link: shared.url, name: shared.text });
    window.history.replaceState(null, '', window.location.pathname + window.location.search + '#/');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }, [shared]);

  // Coming back from a person's page (the Everyone link or the phone's back
  // gesture): scroll to their card instead of the top of the list.
  const lastPerson = useRef<string | null>(null);
  const routeName = route.name;
  const routePersonId = route.name === 'person' ? route.id : null;
  useEffect(() => {
    if (routePersonId) {
      lastPerson.current = routePersonId;
      return;
    }
    if (routeName !== 'people' || data.loading) return;
    const id = lastPerson.current;
    lastPerson.current = null;
    if (!id) return;
    const card = document.querySelector<HTMLElement>(`[data-person-id="${CSS.escape(id)}"]`);
    if (!card) return;
    card.scrollIntoView({ block: 'center' });
    card.classList.add('returned-to');
    const t = window.setTimeout(() => card.classList.remove('returned-to'), 1600);
    return () => window.clearTimeout(t);
  }, [routeName, routePersonId, data.loading]);

  const personMissing = route.name === 'person' && !data.loading && !peopleById.has(route.id);
  useEffect(() => {
    if (personMissing) window.location.hash = routeHref({ name: 'people' });
  }, [personMissing]);

  if (data.loading) {
    return (
      <main className="center-screen" aria-busy="true">
        <p className="loading-text">Unwrapping your list…</p>
      </main>
    );
  }

  if (data.error || !data.household) {
    return (
      <main className="center-screen">
        <div className="card narrow" role="alert">
          <h1 className="display">Oh, snow!</h1>
          <p>{data.error ?? 'We could not find your list.'}</p>
          <button className="btn primary" onClick={() => void data.reload()}>
            Try again
          </button>
        </div>
      </main>
    );
  }

  const currentPersonId = route.name === 'person' ? route.id : undefined;

  return (
    <AppContext.Provider value={ctx}>
      <a className="skip-link" href="#main">
        Skip to list
      </a>
      <Header
        household={data.household}
        totals={totals}
        openCount={openCount}
        peopleCount={data.people.length}
        onSettings={() => setSheet({ kind: 'settings' })}
      />

      {route.name !== 'person' && (
        <nav className="tabs" aria-label="Views">
          <a href={routeHref({ name: 'people' })} aria-current={route.name === 'people' ? 'page' : undefined}>
            <Icon name="users" size={18} /> People
          </a>
          <a href={routeHref({ name: 'gifts' })} aria-current={route.name === 'gifts' ? 'page' : undefined}>
            <Icon name="list" size={18} /> All gifts
          </a>
        </nav>
      )}

      <main id="main" className="content" tabIndex={-1}>
        {route.name === 'people' && <PeopleView tools={tools} />}
        {route.name === 'gifts' && <GiftsView tools={tools} />}
        {route.name === 'person' && peopleById.has(route.id) && <PersonView personId={route.id} tools={tools} />}
      </main>

      <button
        type="button"
        className="fab"
        onClick={() => setSheet({ kind: 'quick', personId: currentPersonId })}
        aria-label="Quick add a gift idea"
      >
        <Icon name="plus" size={28} />
      </button>

      <div className="toast-region" aria-live="polite" role="status">
        {toastText && (
          <div className="toast">
            <span>{toastText.message}</span>
            {toastText.action && (
              <button
                type="button"
                className="toast-action"
                onClick={() => {
                  const { run } = toastText.action!;
                  setToastText(null);
                  void run();
                }}
              >
                {toastText.action.label}
              </button>
            )}
          </div>
        )}
      </div>

      {sheet?.kind === 'quick' && (
        <QuickAddSheet
          initialPersonId={sheet.personId}
          initialLink={sheet.link}
          initialName={sheet.name}
          onClose={() => setSheet(null)}
          onAdded={(g) => {
            markAdded(g.id);
            setSheet(null);
            // Show the new idea in the full list, wherever you were.
            window.location.hash = routeHref({ name: 'gifts' });
            document.getElementById('main')?.scrollIntoView({ block: 'start' });
          }}
        />
      )}
      {sheet?.kind === 'gift' && (
        <GiftSheet
          giftId={sheet.id}
          onClose={() => setSheet(null)}
          onStatus={changeStatus}
          onOpenGift={(id) => setSheet({ kind: 'gift', id })}
        />
      )}
      {sheet?.kind === 'person' && (
        <PersonSheet
          personId={sheet.id}
          groupId={sheet.groupId}
          familyId={sheet.familyId}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.kind === 'group' && <GroupSheet groupId={sheet.id} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'family' && (
        <FamilySheet familyId={sheet.id} groupId={sheet.groupId} onClose={() => setSheet(null)} />
      )}
      {sheet?.kind === 'settings' && <SettingsSheet onClose={() => setSheet(null)} />}
    </AppContext.Provider>
  );
}
