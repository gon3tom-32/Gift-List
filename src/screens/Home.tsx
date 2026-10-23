import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { useHouseholdData } from '../lib/data';
import { AppContext, type AppContextValue } from '../lib/context';
import { routeHref, useRoute } from '../lib/route';
import { sumGifts, type Totals } from '../lib/money';
import { isOpen, shouldCelebrate, statusIndex, type GiftStatus } from '../lib/status';
import { errorText } from '../lib/supabase';
import type { Gift } from '../lib/types';
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
  renderGift: (g: Gift, opts?: { showPerson?: boolean }) => ReactElement;
}

export function Home({ householdId, me }: { householdId: string; me: string }) {
  const data = useHouseholdData(householdId);
  const route = useRoute();
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [toastText, setToastText] = useState<string | null>(null);
  const toastTimer = useRef<number>(undefined);

  const toast = useCallback((message: string) => {
    setToastText(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastText(null), 3500);
  }, []);

  const ctx: AppContextValue = useMemo(() => ({ data, me, toast }), [data, me, toast]);

  const totals = useMemo(() => sumGifts(data.gifts), [data.gifts]);
  const openCount = useMemo(() => data.gifts.filter((g) => isOpen(g.status)).length, [data.gifts]);

  const totalsByPerson = useMemo(() => {
    const byPerson = new Map<string, Gift[]>();
    for (const g of data.gifts) byPerson.set(g.person_id, [...(byPerson.get(g.person_id) ?? []), g]);
    return new Map([...byPerson].map(([id, gifts]) => [id, sumGifts(gifts)]));
  }, [data.gifts]);

  const totalsByGroup = useMemo(() => {
    const groupOf = new Map(data.people.map((p) => [p.id, p.group_id]));
    const byGroup = new Map<string, Gift[]>();
    for (const g of data.gifts) {
      const gid = groupOf.get(g.person_id);
      if (gid) byGroup.set(gid, [...(byGroup.get(gid) ?? []), g]);
    }
    return new Map([...byGroup].map(([id, gifts]) => [id, sumGifts(gifts)]));
  }, [data.gifts, data.people]);

  const markAdded = useCallback((id: string) => {
    setJustAdded(id);
    window.setTimeout(() => setJustAdded((cur) => (cur === id ? null : cur)), 1200);
  }, []);

  const { updateGift } = data;
  const changeStatus = useCallback(
    async (g: Gift, to: GiftStatus) => {
      try {
        await updateGift(g.id, { status: to });
        if (shouldCelebrate(g.status, to)) {
          confetti();
          toast(`${g.name} is given. Ho ho ho!`);
        } else if (statusIndex(to) < statusIndex(g.status)) {
          toast(`Moved back to ${to}.`);
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
    renderGift: (g, opts) => (
      <GiftCard
        key={g.id}
        gift={g}
        person={opts?.showPerson ? peopleById.get(g.person_id) : undefined}
        members={data.members}
        me={me}
        wiggle={justAdded === g.id}
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
        {toastText && <div className="toast">{toastText}</div>}
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
        <GiftSheet giftId={sheet.id} onClose={() => setSheet(null)} onStatus={changeStatus} />
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
