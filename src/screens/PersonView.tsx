import { useMemo, useRef, useState, type FormEvent } from 'react';
import { useApp } from '../lib/context';
import { routeHref } from '../lib/route';
import { errorText } from '../lib/supabase';
import { statusIndex } from '../lib/status';
import { Avatar } from '../components/Avatar';
import { BudgetBar } from '../components/BudgetBar';
import { Icon } from '../components/Icon';
import type { HomeTools } from './Home';

export function PersonView({ personId, tools }: { personId: string; tools: HomeTools }) {
  const { data, toast } = useApp();
  const person = data.people.find((p) => p.id === personId)!;
  const group = data.groups.find((g) => g.id === person.group_id);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const gifts = useMemo(
    () =>
      data.gifts
        .filter((g) => g.person_id === personId)
        .sort((a, b) => statusIndex(a.status) - statusIndex(b.status) || b.created_at.localeCompare(a.created_at)),
    [data.gifts, personId],
  );
  const totals = tools.totalsByPerson.get(personId) ?? { spent: 0, planned: 0 };

  async function quickAdd(e: FormEvent) {
    e.preventDefault();
    const clean = name.trim();
    if (!clean) return;
    setSaving(true);
    try {
      const g = await data.addGift({ person_id: personId, name: clean });
      setName('');
      tools.markAdded(g.id);
      inputRef.current?.focus();
    } catch (err) {
      toast(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="person-view">
      <a className="back-link" href={routeHref({ name: 'people' })}>
        <Icon name="back" size={18} /> Everyone
      </a>

      <section className="person-hero card">
        <Avatar name={person.name} photoPath={person.photo_path} size={72} />
        <div className="person-hero-text">
          <h2 className="display">{person.name}</h2>
          {group && (
            <p className="small muted">
              <Icon name={group.icon} size={14} /> {group.name}
            </p>
          )}
          <BudgetBar budget={person.budget} totals={totals} label={person.name} />
        </div>
        <button
          type="button"
          className="icon-btn"
          onClick={() => tools.openSheet({ kind: 'person', id: person.id })}
          aria-label={`Edit ${person.name}`}
        >
          <Icon name="edit" size={18} />
        </button>
      </section>

      <form className="inline-add" onSubmit={quickAdd}>
        <label htmlFor="inline-add" className="visually-hidden">
          New gift idea for {person.name}
        </label>
        <input
          id="inline-add"
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={`Add an idea for ${person.name}…`}
          autoComplete="off"
          enterKeyHint="done"
          maxLength={200}
        />
        <button className="btn primary" disabled={saving || !name.trim()}>
          Add
        </button>
      </form>

      {gifts.length === 0 ? (
        <p className="empty-note muted">No ideas yet. Type one above, it only needs a name.</p>
      ) : (
        <div className="gift-grid">{gifts.map((g) => tools.renderGift(g))}</div>
      )}
    </div>
  );
}
