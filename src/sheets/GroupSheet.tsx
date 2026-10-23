import { useState, type FormEvent } from 'react';
import { useApp } from '../lib/context';
import { errorText } from '../lib/supabase';
import { deletePhoto } from '../lib/photos';
import { GROUP_ICONS, type GroupIcon } from '../lib/types';
import type { Cents } from '../lib/money';
import { Sheet } from '../components/Sheet';
import { MoneyField, TextField } from '../components/Fields';
import { Icon } from '../components/Icon';
import { ConfirmButton } from '../components/ConfirmButton';
import { extrasByGift, giftsLostWith } from '../lib/recipients';

const ICON_LABELS: Record<GroupIcon, string> = {
  gift: 'Gift box',
  paw: 'Paw',
  briefcase: 'Briefcase',
  tree: 'Tree',
  heart: 'Heart',
  star: 'Star',
};

export function GroupSheet({ groupId, onClose }: { groupId?: string; onClose: () => void }) {
  const { data, toast } = useApp();
  const group = groupId ? data.groups.find((g) => g.id === groupId) : undefined;
  const [name, setName] = useState(group?.name ?? '');
  const [icon, setIcon] = useState<GroupIcon>(group?.icon ?? 'gift');
  const [budget, setBudget] = useState<Cents | null>(group?.budget ?? null);
  const [budgetOk, setBudgetOk] = useState(true);
  const [busy, setBusy] = useState(false);

  const people = group ? data.people.filter((p) => p.group_id === group.id) : [];

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !budgetOk) return;
    setBusy(true);
    try {
      const input = { name: name.trim().slice(0, 60), icon, budget };
      if (group) await data.updateGroup(group.id, input);
      else await data.addGroup(input);
      onClose();
    } catch (err) {
      toast(errorText(err));
      setBusy(false);
    }
  }

  async function remove() {
    if (!group) return;
    try {
      const ids = new Set(people.map((p) => p.id));
      const paths = [
        ...people.map((p) => p.photo_path),
        ...giftsLostWith(data.gifts, extrasByGift(data.recipients), ids).map((g) => g.photo_path),
      ];
      await data.deleteGroup(group.id);
      paths.forEach((p) => void deletePhoto(p));
      onClose();
    } catch (err) {
      toast(errorText(err));
    }
  }

  return (
    <Sheet
      title={group ? `Edit ${group.name}` : 'New group'}
      onClose={onClose}
      footer={
        <>
          {group && (
            <ConfirmButton
              confirmText={
                people.length ? `Delete with ${people.length} ${people.length === 1 ? 'person' : 'people'}?` : 'Tap again to delete'
              }
              onConfirm={() => void remove()}
            >
              Delete
            </ConfirmButton>
          )}
          <button type="submit" form="group-form" className="btn primary" disabled={busy || !name.trim() || !budgetOk}>
            {group ? 'Save' : 'Add group'}
          </button>
        </>
      }
    >
      <form id="group-form" className="stack" onSubmit={save}>
        <TextField
          label="Group name"
          value={name}
          onChange={setName}
          required
          maxLength={60}
          autoComplete="off"
          autoFocus={!group}
          placeholder="Wife's family, Coworkers…"
        />
        <fieldset className="icon-picker">
          <legend>Icon</legend>
          {GROUP_ICONS.map((i) => (
            <label key={i} className={`icon-option icon-${i}`}>
              <input type="radio" name="icon" value={i} checked={icon === i} onChange={() => setIcon(i)} />
              <Icon name={i} />
              <span className="visually-hidden">{ICON_LABELS[i]}</span>
            </label>
          ))}
        </fieldset>
        <MoneyField
          label="Budget (optional)"
          value={budget}
          onChange={setBudget}
          onValidChange={setBudgetOk}
          placeholder="No limit"
        />
      </form>
    </Sheet>
  );
}
