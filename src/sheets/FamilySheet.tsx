import { useState, type FormEvent } from 'react';
import { useApp } from '../lib/context';
import { errorText } from '../lib/supabase';
import { Sheet } from '../components/Sheet';
import { TextField } from '../components/Fields';
import { Avatar } from '../components/Avatar';
import { ConfirmButton } from '../components/ConfirmButton';

/** Create or edit a family inside a group, and choose who's in it. */
export function FamilySheet({
  familyId,
  groupId,
  onClose,
}: {
  familyId?: string;
  groupId: string;
  onClose: () => void;
}) {
  const { data, toast } = useApp();
  const family = familyId ? data.families.find((f) => f.id === familyId) : undefined;
  const group = data.groups.find((g) => g.id === groupId);
  const people = data.people.filter((p) => p.group_id === groupId).sort((a, b) => a.name.localeCompare(b.name));
  const [name, setName] = useState(family?.name ?? '');
  const [chosen, setChosen] = useState<Set<string>>(
    () => new Set(family ? people.filter((p) => p.family_id === family.id).map((p) => p.id) : []),
  );
  const [busy, setBusy] = useState(false);

  function toggle(id: string) {
    setChosen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const clean = name.trim().slice(0, 60);
    if (!clean) return;
    setBusy(true);
    try {
      let id = family?.id;
      if (family) {
        if (family.name !== clean) await data.updateFamily(family.id, { name: clean });
      } else {
        id = (await data.addFamily({ name: clean, group_id: groupId })).id;
      }
      // Join ticked people, release unticked ones that were in this family.
      for (const p of people) {
        const inFamily = p.family_id === id;
        if (chosen.has(p.id) && !inFamily) await data.updatePerson(p.id, { family_id: id });
        if (!chosen.has(p.id) && inFamily) await data.updatePerson(p.id, { family_id: null });
      }
      onClose();
    } catch (err) {
      toast(errorText(err));
      setBusy(false);
    }
  }

  async function remove() {
    if (!family) return;
    try {
      await data.deleteFamily(family.id);
      toast(`${family.name} removed. Everyone is still in ${group?.name ?? 'the group'}.`);
      onClose();
    } catch (err) {
      toast(errorText(err));
    }
  }

  return (
    <Sheet
      title={family ? `Edit ${family.name}` : `New family in ${group?.name ?? 'group'}`}
      onClose={onClose}
      footer={
        <>
          {family && (
            <ConfirmButton confirmText="Delete? People stay in the group" onConfirm={() => void remove()}>
              Delete family
            </ConfirmButton>
          )}
          <button type="submit" form="family-form" className="btn primary" disabled={busy || !name.trim()}>
            {family ? 'Save' : 'Add family'}
          </button>
        </>
      }
    >
      <form id="family-form" className="stack" onSubmit={save}>
        <TextField
          label="Family name"
          value={name}
          onChange={setName}
          required
          maxLength={60}
          autoComplete="off"
          autoFocus={!family}
          placeholder="Mike, Sarah & kids"
        />
        <fieldset className="family-pick">
          <legend>Who's in this family?</legend>
          {people.length === 0 ? (
            <p className="muted small">No one in {group?.name ?? 'this group'} yet. Add people, then put them in a family.</p>
          ) : (
            <ul>
              {people.map((p) => {
                const other = p.family_id && p.family_id !== family?.id ? data.families.find((f) => f.id === p.family_id) : null;
                return (
                  <li key={p.id}>
                    <label className="family-pick-row">
                      <input type="checkbox" checked={chosen.has(p.id)} onChange={() => toggle(p.id)} />
                      <Avatar name={p.name} photoPath={p.photo_path} size={32} />
                      <span>
                        {p.name}
                        {other && <small className="muted"> · now in {other.name}</small>}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </fieldset>
      </form>
    </Sheet>
  );
}
