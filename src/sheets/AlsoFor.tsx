import { useMemo } from 'react';
import { useApp } from '../lib/context';

/** "Also for…": tick more people to share one gift (the cost is split equally). */
export function AlsoFor({
  mainId,
  selected,
  onChange,
}: {
  mainId: string;
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const { data } = useApp();
  const groups = useMemo(
    () => [...data.groups].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)),
    [data.groups],
  );
  const chosen = new Set(selected);
  const toggle = (id: string) => onChange(chosen.has(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <details className="also-for" open={selected.length > 0}>
      <summary>{selected.length > 0 ? `Also for ${selected.length} more` : 'Also for someone else?'}</summary>
      <p className="small muted">Tick everyone it is for. The cost is split equally between them.</p>
      <div className="also-for-list">
        {groups.map((g) => {
          const people = data.people
            .filter((p) => p.group_id === g.id && p.id !== mainId)
            .sort((a, b) => a.name.localeCompare(b.name));
          if (people.length === 0) return null;
          return (
            <fieldset key={g.id}>
              <legend>{g.name}</legend>
              {people.map((p) => (
                <label key={p.id} className="check">
                  <input type="checkbox" checked={chosen.has(p.id)} onChange={() => toggle(p.id)} />
                  <span>{p.name}</span>
                </label>
              ))}
            </fieldset>
          );
        })}
      </div>
    </details>
  );
}
