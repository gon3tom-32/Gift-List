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

export function PersonSheet({
  personId,
  groupId,
  onClose,
}: {
  personId?: string;
  groupId?: string;
  onClose: () => void;
}) {
  const { data, toast } = useApp();
  const person = personId ? data.people.find((p) => p.id === personId) : undefined;
  const [name, setName] = useState(person?.name ?? '');
  const [group, setGroup] = useState(person?.group_id ?? groupId ?? data.groups[0]?.id ?? '');
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
    setBusy(true);
    try {
      if (person) {
        await data.updatePerson(person.id, { name: name.trim().slice(0, 80), group_id: group, budget });
      } else {
        const created = await data.addPerson({ name: name.trim().slice(0, 80), group_id: group, budget });
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
            <select id={id} value={group} onChange={(e) => setGroup(e.target.value)} required>
              {data.groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          )}
        </Field>
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
