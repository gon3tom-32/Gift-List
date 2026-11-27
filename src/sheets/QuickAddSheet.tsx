import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useApp } from '../lib/context';
import { errorText } from '../lib/supabase';
import { fetchLinkPreview, fetchPreviewImage, looksLikeUrl, storeFromUrl, type LinkPreview } from '../lib/linkPreview';
import { uploadPhoto } from '../lib/photos';
import { eachText, formatCents, splitCents, toCents, type Cents } from '../lib/money';
import type { Gift } from '../lib/types';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { MoneyField, TextField } from '../components/Fields';
import { PhotoPicker } from '../components/PhotoPicker';
import { NEW_PERSON, PersonPicker } from './PersonPicker';
import { AlsoFor } from './AlsoFor';

// Remembered for this visit only, so the next idea goes to the same person.
let lastPersonId: string | undefined;

/** Add an idea in a few seconds: only the name is required. */
export function QuickAddSheet({
  initialPersonId,
  initialLink,
  initialName,
  onClose,
  onAdded,
}: {
  initialPersonId?: string;
  /** Pre-filled when something is shared into the app. */
  initialLink?: string | null;
  initialName?: string | null;
  onClose: () => void;
  onAdded: (g: Gift) => void;
}) {
  const { data, toast } = useApp();
  const householdId = data.household!.id;
  const firstPerson = [initialPersonId, lastPersonId].find((id) => id && data.people.some((p) => p.id === id));

  const [name, setName] = useState(initialName ?? '');
  const [personId, setPersonId] = useState(firstPerson ?? data.people[0]?.id ?? NEW_PERSON);
  const [newPerson, setNewPerson] = useState('');
  const [also, setAlso] = useState<string[]>([]);
  const [groupId, setGroupId] = useState(data.groups[0]?.id ?? '');
  const [estimate, setEstimate] = useState<Cents | null>(null);
  const [estimateOk, setEstimateOk] = useState(true);
  const [link, setLink] = useState(initialLink ?? '');
  const [preview, setPreview] = useState<LinkPreview | null>(null);
  const [looking, setLooking] = useState(false);
  const [saving, setSaving] = useState(false);
  // In the store: mark it bought, enter what was paid (tax included) and keep the receipt.
  const [bought, setBought] = useState(false);
  const [paid, setPaid] = useState<Cents | null>(null);
  const [paidOk, setPaidOk] = useState(true);
  const [receipt, setReceipt] = useState<File | null>(null);
  const receiptInput = useRef<HTMLInputElement>(null);
  // A picture taken or chosen now, shown here and uploaded once the gift is saved.
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!photo) {
      setPhotoUrl(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);
  // A shared name hint counts as typed only when there's no link to look up.
  const nameTouched = useRef(Boolean(initialName && !initialLink));
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
      // Fill the estimate from the shop's price, unless one was typed already.
      const priceCents = toCents(p?.price ?? null);
      if (priceCents !== null) setEstimate((e) => e ?? priceCents);
    }, 400);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [link]);

  async function save(e: FormEvent) {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName || !estimateOk || (bought && !paidOk)) return;
    setSaving(true);
    try {
      let pid = personId;
      if (pid === NEW_PERSON) {
        const who = newPerson.trim();
        if (!who) throw new Error("Add the person's name.");
        let gid = groupId;
        if (!gid)
          gid = (
            await data.addGroup({
              name: 'Our family',
              icon: 'gift',
              budget: null,
            })
          ).id;
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
        ...(bought ? { status: 'ordered' as const, paid } : {}),
      });
      const extras = also.filter((id) => id !== pid);
      if (extras.length > 0) await data.setGiftRecipients(gift.id, extras);
      onAdded(gift);

      if (bought && receipt) {
        void (async () => {
          const path = await uploadPhoto(householdId, 'receipts', crypto.randomUUID(), receipt);
          await data.addReceipt({ photo_path: path, store: preview?.site ?? null }, [gift.id]);
        })().catch(() => toast("The idea is saved, but the receipt didn't upload. Add it from the gift."));
      }

      // Bring the picture in after saving, in the background. Your own picture wins over the link's.
      if (photo) {
        void (async () => {
          const path = await uploadPhoto(householdId, 'gifts', gift.id, photo);
          await data.updateGift(gift.id, { photo_path: path });
        })().catch(() => toast("The idea is saved, but the picture didn't upload. Add it from the gift."));
      } else if (preview?.image) {
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
  const people = 1 + also.filter((id) => id !== personId).length;
  const shares = estimate !== null && people > 1 ? splitCents(estimate, people) : null;
  // Groups of people (Teachers x13): one gift, one price, split by the people in each group.
  const heads = [personId, ...also.filter((id) => id !== personId)].reduce(
    (n, id) => n + (data.people.find((p) => p.id === id)?.headcount ?? 1),
    0,
  );
  const splitHint =
    heads > people && estimate !== null
      ? `Split across ${heads} people: ${eachText(estimate, heads)}`
      : shares
        ? `Split ${people} ways: ${shares.every((s) => s === shares[0]) ? '' : 'about '}${formatCents(shares[0])} each`
        : null;

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

        {data.people.length > 0 && (
          <PersonPicker
            value={personId}
            onChange={(id) => {
              setPersonId(id);
              setAlso((a) => a.filter((x) => x !== id));
            }}
            allowNew
          />
        )}
        {data.people.length > 1 && <AlsoFor mainId={personId} selected={also} onChange={setAlso} />}

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

        <MoneyField
          label="Price (optional)"
          value={estimate}
          onChange={setEstimate}
          onValidChange={setEstimateOk}
          hint={
            estimate !== null && estimate === toCents(preview?.price ?? null)
              ? `Price from ${preview?.site ?? 'the shop'}. Change it if you like.`
              : undefined
          }
        />

        <PhotoPicker
          preview={photoUrl ? <img src={photoUrl} alt="Your picture of the gift" /> : <Icon name="camera" size={28} />}
          hasPhoto={Boolean(photo)}
          onPick={setPhoto}
          onRemove={() => setPhoto(null)}
          prompt="Take or add a picture"
        />

        <label className="toggle">
          <input type="checkbox" checked={bought} onChange={(e) => setBought(e.target.checked)} />
          <span>I bought it</span>
        </label>
        {bought && (
          <div className="stack">
            <MoneyField
              label="Paid (tax included)"
              value={paid}
              onChange={setPaid}
              onValidChange={setPaidOk}
              hint="Saved as Ordered. This is what counts toward your budget."
            />
            <div className="photo-actions">
              <input
                ref={receiptInput}
                type="file"
                accept="image/*"
                className="visually-hidden"
                tabIndex={-1}
                aria-label="Receipt photo"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setReceipt(f);
                  e.target.value = '';
                }}
              />
              <button type="button" className="btn small" onClick={() => receiptInput.current?.click()}>
                <Icon name="camera" size={18} /> {receipt ? 'Change receipt' : 'Add receipt'}
              </button>
              {receipt && (
                <>
                  <span className="small muted">Receipt added</span>
                  <button type="button" className="btn small link" onClick={() => setReceipt(null)}>
                    Remove
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        <details className="more" open={link ? true : undefined}>
          <summary>Link (optional)</summary>
          <div className="stack">
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

        {splitHint && <p className="split-hint small">{splitHint}</p>}

        <button className="btn primary big" disabled={saving || !name.trim() || !estimateOk || (bought && !paidOk)}>
          {saving ? 'Saving…' : bought ? 'Save purchase' : 'Save idea'}
        </button>
      </form>
    </Sheet>
  );
}
