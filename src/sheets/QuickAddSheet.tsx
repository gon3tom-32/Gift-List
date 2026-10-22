import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useApp } from '../lib/context';
import { errorText } from '../lib/supabase';
import { fetchLinkPreview, fetchPreviewImage, looksLikeUrl, storeFromUrl, type LinkPreview } from '../lib/linkPreview';
import { uploadPhoto } from '../lib/photos';
import type { Cents } from '../lib/money';
import type { Gift } from '../lib/types';
import { Sheet } from '../components/Sheet';
import { MoneyField, TextField } from '../components/Fields';
import { NEW_PERSON, PersonPicker } from './PersonPicker';

// Remembered for this visit only, so the next idea goes to the same person.
let lastPersonId: string | undefined;

/** Add an idea in a few seconds: only the name is required. */
export function QuickAddSheet({
  initialPersonId,
  onClose,
  onAdded,
}: {
  initialPersonId?: string;
  onClose: () => void;
  onAdded: (g: Gift) => void;
}) {
  const { data, toast } = useApp();
  const householdId = data.household!.id;
  const firstPerson = [initialPersonId, lastPersonId].find((id) => id && data.people.some((p) => p.id === id));

  const [name, setName] = useState('');
  const [personId, setPersonId] = useState(firstPerson ?? data.people[0]?.id ?? NEW_PERSON);
  const [newPerson, setNewPerson] = useState('');
  const [groupId, setGroupId] = useState(data.groups[0]?.id ?? '');
  const [estimate, setEstimate] = useState<Cents | null>(null);
  const [estimateOk, setEstimateOk] = useState(true);
  const [link, setLink] = useState('');
  const [preview, setPreview] = useState<LinkPreview | null>(null);
  const [looking, setLooking] = useState(false);
  const [saving, setSaving] = useState(false);
  const nameTouched = useRef(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  // Look up the link's title and picture. Never blocks saving.
  useEffect(() => {
    if (!looksLikeUrl(link)) {
      setPreview(null);
      return;
    }
    let live = true;
    const t = window.setTimeout(async () => {
      setLooking(true);
      const p = await fetchLinkPreview(link);
      if (!live) return;
      setLooking(false);
      setPreview(p);
      if (p?.title && !nameTouched.current) setName(p.title);
    }, 400);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [link]);

  async function save(e: FormEvent) {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName || !estimateOk) return;
    setSaving(true);
    try {
      let pid = personId;
      if (pid === NEW_PERSON) {
        const who = newPerson.trim();
        if (!who) throw new Error("Add the person's name.");
        let gid = groupId;
        if (!gid) gid = (await data.addGroup({ name: 'Our family', icon: 'gift', budget: null })).id;
        pid = (await data.addPerson({ name: who, group_id: gid })).id;
      }
      lastPersonId = pid;
      const cleanLink = looksLikeUrl(link) ? link.trim() : null;
      const gift = await data.addGift({
        person_id: pid,
        name: cleanName.slice(0, 200),
        link: cleanLink,
        store: preview?.site ?? (cleanLink ? storeFromUrl(cleanLink) : null),
        estimate,
      });
      onAdded(gift);

      // Bring the link's picture in after saving, in the background.
      if (preview?.image) {
        void (async () => {
          const blob = await fetchPreviewImage(preview.image!);
          if (!blob) return;
          const path = await uploadPhoto(householdId, 'gifts', gift.id, blob);
          await data.updateGift(gift.id, { photo_path: path });
        })().catch(() => undefined);
      }
    } catch (err) {
      toast(errorText(err));
      setSaving(false);
    }
  }

  const needsPerson = personId === NEW_PERSON;

  return (
    <Sheet title="New gift idea" onClose={onClose}>
      <form className="stack" onSubmit={save}>
        <TextField
          label="Gift idea"
          value={name}
          onChange={(v) => {
            // Pasting a link into the name box moves it to the link box.
            if (looksLikeUrl(v) && !link) {
              setLink(v.trim());
              setName('');
              return;
            }
            nameTouched.current = v.trim() !== '';
            setName(v);
          }}
          placeholder={looking ? 'Looking up the link…' : 'Cozy socks, a puzzle, a link…'}
          required
          maxLength={200}
          autoComplete="off"
          enterKeyHint="done"
          inputRef={nameRef}
        />

        {data.people.length > 0 && <PersonPicker value={personId} onChange={setPersonId} allowNew />}

        {needsPerson && (
          <div className="row-fields">
            <TextField
              label="Their name"
              value={newPerson}
              onChange={setNewPerson}
              required
              maxLength={80}
              autoComplete="off"
              placeholder="Grandma"
            />
            {data.groups.length > 0 && (
              <div className="field">
                <label htmlFor="qa-group">Group</label>
                <select id="qa-group" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                  {data.groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        <details className="more" open={link || estimate !== null ? true : undefined}>
          <summary>Price and link (optional)</summary>
          <div className="stack">
            <MoneyField label="Estimate" value={estimate} onChange={setEstimate} onValidChange={setEstimateOk} />
            <TextField
              label="Link"
              type="url"
              inputMode="url"
              value={link}
              onChange={setLink}
              placeholder="https://"
              autoComplete="off"
              hint={looking ? 'Looking up the link…' : preview?.title ? `Found: ${preview.title}` : undefined}
            />
          </div>
        </details>

        <button className="btn primary big" disabled={saving || !name.trim() || !estimateOk}>
          {saving ? 'Saving…' : 'Save idea'}
        </button>
      </form>
    </Sheet>
  );
}
