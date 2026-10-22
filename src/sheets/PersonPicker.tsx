import { useMemo } from 'react';
import { useApp } from '../lib/context';
import { Field } from '../components/Fields';

export const NEW_PERSON = '__new__';

/** A "who is it for?" select, grouped by group. */
export function PersonPicker({
  value,
  onChange,
  allowNew,
}: {
  value: string;
  onChange: (id: string) => void;
  allowNew?: boolean;
}) {
  const { data } = useApp();
  const groups = useMemo(
    () => [...data.groups].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)),
    [data.groups],
  );
  return (
    <Field label="Who's it for?">
      {(id) => (
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)} required>
          {groups.map((g) => {
            const people = data.people.filter((p) => p.group_id === g.id).sort((a, b) => a.name.localeCompare(b.name));
            if (people.length === 0) return null;
            return (
              <optgroup key={g.id} label={g.name}>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
            );
          })}
          {allowNew && <option value={NEW_PERSON}>+ Someone new…</option>}
        </select>
      )}
    </Field>
  );
}
