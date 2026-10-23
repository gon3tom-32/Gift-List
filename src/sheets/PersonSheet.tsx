import { useState, type FormEvent } from 'react';
import { useApp } from '../lib/context';
import { errorText } from '../lib/supabase';
import { deletePhoto, uploadPhoto } from '../lib/photos';
import { routeHref } from '../lib/route';
import type { Cents } from '../lib/money';
import { Sheet } from '../components/Sheet';
import { Field, MoneyField, TextField } from '../components/Fields';
import { Avatar } from '../components/Avatar';
import { PhotoPicker } from '../components/PhotoPicker';
import { ConfirmButton } from '../components/ConfirmButton';

const NEW_FAMILY = '__new_family__';

export function PersonSheet({
  personId,
  groupId,
  familyId,
  onClose,
}: {
  personId?: string;
  groupId?: string;
  familyId?: string;
  onClose: () => void;
}) {
  const { data, toast } = useApp();
  const person = personId ? data.people.find((p) => p.id === personId) : undefined;
  const [name, setName] = useState(person?.name ?? '');
  const [group, setGroup] = useState(person?.group_id ?? groupId ?? data.groups[0]?.id ?? '');
  // '' = no family, NEW_FAMILY = make one now
  const [family, setFamily] = useState(person?.family_id ?? familyId ?? '');
  const [newFamilyName, setNewFamilyName] = useState('');
  const groupFamilies = data.families.filter((f) => f.group_id === group);
  const [budget, setBudget] = useState<Cents | null>(person?.budget ?? null);
  const [budgetOk, setBudgetOk] = useState(true);
  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const householdId = data.household!.id;
  const giftCount = person ? data.gifts.filter((g) => g.person_id === person.id).length : 0;

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !group || !budgetOk) return;
    if (family === NEW_FAMILY && !newFamilyName.trim()) return;
    setBusy(true);
    try {
      let family_id: string | null = family || null;
      if (family === NEW_FAMILY) {
        family_id = (await data.addFamily({ name: newFamilyName.trim().slice(0, 60), group_id: group })).id;
      }
      if (person) {
        await data.updatePerson(person.id, { name: name.trim().slice(0, 80), group_id: group, family_id, budget });
      } else {
        const created = await data.addPerson({ name: name.trim().slice(0, 80), group_id: group, family_id, budget });
        if (pendingPhoto) {
          try {
            const path = await uploadPhoto(householdId, 'people', created.id, pendingPhoto);
            await data.updatePerson(created.id, { photo_path: path });
          } catch (err) {
            toast(`Saved, but the picture didn't upload: ${errorText(err)}`);
          }
        }
      }
      onClose();
    } catch (err) {
      toast(errorText(err));
      setBusy(false);
    }
  }

  async function pickPhoto(file: File) {
    if (!person) {
      setPendingPhoto(file);
      setPendingUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(file);
      });
      return;
    }
    setBusy(true);
    try {
      const old = person.photo_path;
      const path = await uploadPhoto(householdId, 'people', person.id, file);
      await data.updatePerson(person.id, { photo_path: path });
      void deletePhoto(old);
    } catch (err) {
      toast(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function removePhoto() {
    if (!person) {
      setPendingPhoto(null);
      setPendingUrl(null);
      return;
    }
    const old = person.photo_path;
    await data.updatePerson(person.id, { photo_path: null }).catch((err) => toast(errorText(err)));
    void deletePhoto(old);
  }

  async function remove() {
    if (!person) return;
    try {
      const paths = [person.photo_path, ...data.gifts.filter((g) => g.person_id === person.id).map((g) => g.photo_path)];
      await data.deletePerson(person.id);
      paths.forEach((p) => void deletePhoto(p));
      window.location.hash = routeHref({ name: 'people' });
      onClose();
    } catch (err) {
      toast(errorText(err));
    }
  }

  return (
    <Sheet
      title={person ? `Edit ${person.name}` : 'Add a person'}
      onClose={onClose}
      footer={
        <>
          {person && (
            <ConfirmButton
              confirmText={giftCount ? `Delete with ${giftCount} gift${giftCount === 1 ? '' : 's'}?` : 'Tap again to delete'}
              onConfirm={() => void remove()}
            >
              Delete
            </ConfirmButton>
          )}
          <button type="submit" form="person-form" className="btn primary" disabled={busy || !name.trim() || !budgetOk}>
            {person ? 'Save' : 'Add person'}
          </button>
        </>
      }
    >
      <PhotoPicker
        preview={
          pendingUrl ? (
            <img className="avatar" src={pendingUrl} alt="" style={{ width: 72, height: 72 }} />
          ) : (
            <Avatar name={name || '?'} photoPath={person?.photo_path} size={72} />
          )
        }
        hasPhoto={Boolean(person?.photo_path || pendingPhoto)}
        busy={busy}
        onPick={(f) => void pickPhoto(f)}
        onRemove={() => void removePhoto()}
        prompt="Add a photo"
      />
      <form id="person-form" className="stack" onSubmit={save}>
        <TextField
          label="Name"
          value={name}
          onChange={setName}
          required
          maxLength={80}
          autoComplete="off"
          autoFocus={!person}
          placeholder="Grandma, Max the dog…"
        />
        <Field label="Group">
          {(id) => (
            <select
              id={id}
              value={group}
              onChange={(e) => {
                setGroup(e.target.value);
                // Families belong to one group, so changing group clears it.
                setFamily('');
              }}
              required
            >
              {data.groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Family (optional)" hint="People in a family show together inside the group.">
          {(id, describedBy) => (
            <select id={id} value={family} onChange={(e) => setFamily(e.target.value)} aria-describedby={describedBy}>
              <option value="">No family</option>
              {groupFamilies.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
              <option value={NEW_FAMILY}>+ New family…</option>
            </select>
          )}
        </Field>
        {family === NEW_FAMILY && (
          <TextField
            label="New family name"
            value={newFamilyName}
            onChange={setNewFamilyName}
            required
            maxLength={60}
            autoComplete="off"
            placeholder="Mike, Sarah & kids"
          />
        )}
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
