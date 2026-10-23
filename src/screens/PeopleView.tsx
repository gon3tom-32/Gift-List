import { useMemo, useState } from 'react';
import { useApp } from '../lib/context';
import { routeHref } from '../lib/route';
import { errorText } from '../lib/supabase';
import { isOpen } from '../lib/status';
import type { GroupIcon, Person } from '../lib/types';
import { formatCents, type Totals } from '../lib/money';
import { Icon } from '../components/Icon';
import { PersonCard } from '../components/Cards';
import { BudgetBar } from '../components/BudgetBar';
import type { HomeTools } from './Home';

const STARTERS: { name: string; icon: GroupIcon }[] = [
  { name: 'Our family', icon: 'gift' },
  { name: 'Kids', icon: 'star' },
  { name: 'Pets', icon: 'paw' },
  { name: 'Coworkers', icon: 'briefcase' },
  { name: 'Friends', icon: 'heart' },
];

export function PeopleView({ tools }: { tools: HomeTools }) {
  const { data, toast } = useApp();
  const [busy, setBusy] = useState(false);

  const groups = useMemo(
    () => [...data.groups].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)),
    [data.groups],
  );

  const giftStats = useMemo(() => {
    const m = new Map<string, { count: number; open: number }>();
    for (const g of data.gifts) {
      const s = m.get(g.person_id) ?? { count: 0, open: 0 };
      s.count++;
      if (isOpen(g.status)) s.open++;
      m.set(g.person_id, s);
    }
    return m;
  }, [data.gifts]);

  async function addStarter(name: string, icon: GroupIcon) {
    setBusy(true);
    try {
      await data.addGroup({ name, icon, budget: null });
    } catch (err) {
      toast(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  if (groups.length === 0) {
    return (
      <section className="empty-state">
        <div className="empty-art" aria-hidden="true">
          <Icon name="tree" size={56} />
        </div>
        <h2 className="display">Who's on the list?</h2>
        <p className="muted">Start with a group. You can rename it or add more later.</p>
        <div className="chip-row">
          {STARTERS.map((s) => (
            <button key={s.name} className="chip" disabled={busy} onClick={() => void addStarter(s.name, s.icon)}>
              <Icon name={s.icon} size={18} /> {s.name}
            </button>
          ))}
        </div>
        <button className="btn link" onClick={() => tools.openSheet({ kind: 'group' })}>
          Make your own group
        </button>
      </section>
    );
  }

  const unusedStarters = STARTERS.filter((s) => !groups.some((g) => g.name.toLowerCase() === s.name.toLowerCase()));

  return (
    <div className="groups">
      {groups.map((group) => {
        const people = data.people
          .filter((p) => p.group_id === group.id)
          .sort((a, b) => a.name.localeCompare(b.name));
        const families = data.families
          .filter((f) => f.group_id === group.id)
          .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
        const familyIds = new Set(families.map((f) => f.id));
        const loose = people.filter((p) => !p.family_id || !familyIds.has(p.family_id));
        const totals = tools.totalsByGroup.get(group.id) ?? { spent: 0, planned: 0 };
        const renderPerson = (p: Person) => {
          const stats = giftStats.get(p.id) ?? { count: 0, open: 0 };
          const t = tools.totalsByPerson.get(p.id) ?? { spent: 0, planned: 0 };
          return (
            <PersonCard
              key={p.id}
              person={p}
              giftCount={stats.count}
              openCount={stats.open}
              total={t.spent + t.planned}
              onOpen={() => (window.location.hash = routeHref({ name: 'person', id: p.id }))}
            />
          );
        };
        return (
          <section key={group.id} className="group" aria-labelledby={`group-${group.id}`}>
            <div className="group-head">
              <span className={`group-icon icon-${group.icon}`} aria-hidden="true">
                <Icon name={group.icon} />
              </span>
              <h2 id={`group-${group.id}`} className="h3">
                {group.name}
              </h2>
              <button
                type="button"
                className="btn tiny"
                onClick={() => tools.openSheet({ kind: 'family', groupId: group.id })}
              >
                <Icon name="plus" size={14} /> Family
              </button>
              <button
                type="button"
                className="icon-btn"
                onClick={() => tools.openSheet({ kind: 'group', id: group.id })}
                aria-label={`Edit ${group.name}`}
              >
                <Icon name="edit" size={18} />
              </button>
            </div>
            <BudgetBar budget={group.budget} totals={totals} label={group.name} />

            {families.map((fam) => {
              const members = people.filter((p) => p.family_id === fam.id);
              const famTotals = sumTotals(members.map((p) => tools.totalsByPerson.get(p.id)));
              const famGifts = members.reduce((n, p) => n + (giftStats.get(p.id)?.count ?? 0), 0);
              const famOpen = members.reduce((n, p) => n + (giftStats.get(p.id)?.open ?? 0), 0);
              return (
                <section key={fam.id} className="family" aria-labelledby={`family-${fam.id}`}>
                  <div className="family-head">
                    <span className="family-icon" aria-hidden="true">
                      <Icon name="home" size={16} />
                    </span>
                    <div className="family-title">
                      <h3 id={`family-${fam.id}`} className="h4">
                        {fam.name}
                      </h3>
                      <p className="small muted">
                        {members.length} {members.length === 1 ? 'person' : 'people'}
                        {famGifts > 0 && ` · ${famGifts} gift${famGifts === 1 ? '' : 's'}`}
                        {famOpen > 0 && ` · ${famOpen} open`}
                        {famTotals.spent + famTotals.planned > 0 &&
                          ` · ${formatCents(famTotals.spent + famTotals.planned, { whole: true })}`}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => tools.openSheet({ kind: 'family', id: fam.id, groupId: group.id })}
                      aria-label={`Edit ${fam.name}`}
                    >
                      <Icon name="edit" size={16} />
                    </button>
                  </div>
                  <div className="people-grid">
                    {members.map(renderPerson)}
                    <button
                      type="button"
                      className="person-card add"
                      onClick={() => tools.openSheet({ kind: 'person', groupId: group.id, familyId: fam.id })}
                    >
                      <span className="avatar add-avatar" aria-hidden="true">
                        <Icon name="plus" />
                      </span>
                      <span className="person-name">Add to family</span>
                    </button>
                  </div>
                </section>
              );
            })}

            <div className="people-grid">
              {loose.map(renderPerson)}
              <button
                type="button"
                className="person-card add"
                onClick={() => tools.openSheet({ kind: 'person', groupId: group.id })}
              >
                <span className="avatar add-avatar" aria-hidden="true">
                  <Icon name="plus" />
                </span>
                <span className="person-name">Add person</span>
                <span className="small muted">to {group.name}</span>
              </button>
            </div>
          </section>
        );
      })}

      <div className="add-group">
        <button className="btn" onClick={() => tools.openSheet({ kind: 'group' })}>
          <Icon name="plus" size={18} /> Add a group
        </button>
        {unusedStarters.length > 0 && (
          <div className="chip-row">
            {unusedStarters.slice(0, 3).map((s) => (
              <button key={s.name} className="chip small" disabled={busy} onClick={() => void addStarter(s.name, s.icon)}>
                <Icon name={s.icon} size={16} /> {s.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function sumTotals(list: (Totals | undefined)[]): Totals {
  return list.reduce<Totals>(
    (acc, t) => ({ spent: acc.spent + (t?.spent ?? 0), planned: acc.planned + (t?.planned ?? 0) }),
    { spent: 0, planned: 0 },
  );
}
