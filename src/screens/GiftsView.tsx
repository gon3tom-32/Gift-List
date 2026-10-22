import { useMemo, useState } from 'react';
import { useApp } from '../lib/context';
import { isOpen, statusIndex } from '../lib/status';
import type { Gift } from '../lib/types';
import type { HomeTools } from './Home';

type Filter = 'all' | 'ideas' | 'progress' | 'given';

const FILTERS: { id: Filter; label: string; test: (g: Gift) => boolean }[] = [
  { id: 'all', label: 'All', test: () => true },
  { id: 'ideas', label: 'Ideas', test: (g) => g.status === 'idea' },
  { id: 'progress', label: 'On the way', test: (g) => g.status !== 'idea' && isOpen(g.status) },
  { id: 'given', label: 'Given', test: (g) => g.status === 'given' },
];

export function GiftsView({ tools }: { tools: HomeTools }) {
  const { data, me } = useApp();
  const [filter, setFilter] = useState<Filter>('all');
  const [mine, setMine] = useState(false);

  const gifts = useMemo(() => {
    const f = FILTERS.find((x) => x.id === filter)!;
    return data.gifts
      .filter(f.test)
      .filter((g) => !mine || g.shared || g.assigned_to === me)
      .sort((a, b) => {
        // Soonest ship-by first, then by status, then newest.
        if (a.ship_by && b.ship_by && a.ship_by !== b.ship_by) return a.ship_by.localeCompare(b.ship_by);
        if (a.ship_by && !b.ship_by && isOpen(a.status)) return -1;
        if (b.ship_by && !a.ship_by && isOpen(b.status)) return 1;
        return statusIndex(a.status) - statusIndex(b.status) || b.created_at.localeCompare(a.created_at);
      });
  }, [data.gifts, filter, mine, me]);

  return (
    <div className="gifts-view">
      <div className="filters">
        <div className="chip-row" role="group" aria-label="Filter gifts">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className="chip"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <label className="toggle">
          <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />
          <span>Just mine</span>
        </label>
      </div>
      {gifts.length === 0 ? (
        <p className="empty-note muted">
          {data.gifts.length === 0 ? 'No gifts yet. Tap + to add the first idea.' : 'Nothing here with these filters.'}
        </p>
      ) : (
        <div className="gift-grid">{gifts.map((g) => tools.renderGift(g, { showPerson: true }))}</div>
      )}
    </div>
  );
}
