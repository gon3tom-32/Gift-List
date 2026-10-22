import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { useApp } from '../lib/context';
import { errorText } from '../lib/supabase';
import { deletePhoto, uploadPhoto } from '../lib/photos';
import { fetchLinkPreview, fetchPreviewImage, looksLikeUrl, storeFromUrl } from '../lib/linkPreview';
import { STATUS_LABELS, type GiftStatus } from '../lib/status';
import { memberName, type Gift, type GiftEvent } from '../lib/types';
import type { Cents } from '../lib/money';
import { Sheet } from '../components/Sheet';
import { Field, MoneyField, TextField } from '../components/Fields';
import { StatusStrip } from '../components/StatusStrip';
import { GiftPhoto } from '../components/GiftPhoto';
import { PhotoPicker } from '../components/PhotoPicker';
import { ConfirmButton } from '../components/ConfirmButton';
import { PersonPicker } from './PersonPicker';

const PAYMENT_METHODS = ['Credit card', 'Debit card', 'Cash', 'Gift card', 'PayPal', 'Venmo', 'Apple Pay'];
const SHARED = '__shared__';

interface Form {
  name: string;
  person_id: string;
  store: string;
  link: string;
  estimate: Cents | null;
  paid: Cents | null;
  buyer: string; // '' = anyone, a user id, or SHARED
  ship_by: string;
  payment_method: string;
}

function toForm(g: Gift): Form {
  return {
    name: g.name,
    person_id: g.person_id,
    store: g.store ?? '',
    link: g.link ?? '',
    estimate: g.estimate,
    paid: g.paid,
    buyer: g.shared ? SHARED : (g.assigned_to ?? ''),
    ship_by: g.ship_by ?? '',
    payment_method: g.payment_method ?? '',
  };
}

export function GiftSheet({
  giftId,
  onClose,
  onStatus,
}: {
  giftId: string;
  onClose: () => void;
  onStatus: (g: Gift, to: GiftStatus) => Promise<void>;
}) {
  const { data, me, toast } = useApp();
  const gift = data.gifts.find((g) => g.id === giftId);
  const [form, setForm] = useState<Form | null>(gift ? toForm(gift) : null);
  const [moneyOk, setMoneyOk] = useState({ estimate: true, paid: true });
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [looking, setLooking] = useState(false);
  const [history, setHistory] = useState<GiftEvent[] | null>(null);

  // The partner deleted it while it was open.
  const gone = !gift;
  useEffect(() => {
    if (gone) {
      toast('That gift was removed.');
      onClose();
    }
  }, [gone, onClose, toast]);

  const { giftHistory } = data;
  const status = gift?.status;
  useEffect(() => {
    let live = true;
    giftHistory(giftId)
      .then((h) => live && setHistory(h))
      .catch(() => live && setHistory([]));
    return () => {
      live = false;
    };
  }, [giftId, giftHistory, status]);

  const dirty = useMemo(() => {
    if (!gift || !form) return false;
    return JSON.stringify(toForm(gift)) !== JSON.stringify(form);
  }, [gift, form]);

  if (!gift || !form) return null;
  const householdId = data.household!.id;

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => (f ? { ...f, [key]: value } : f));

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form || !form.name.trim() || !moneyOk.estimate || !moneyOk.paid) return;
    setSaving(true);
    try {
      await data.updateGift(giftId, {
        name: form.name.trim().slice(0, 200),
        person_id: form.person_id,
        store: form.store.trim() || null,
        link: form.link.trim() || null,
        estimate: form.estimate,
        paid: form.paid,
        shared: form.buyer === SHARED,
        assigned_to: form.buyer && form.buyer !== SHARED ? form.buyer : null,
        ship_by: form.ship_by || null,
        payment_method: form.payment_method.trim() || null,
      });
      toast('Saved.');
      onClose();
    } catch (err) {
      toast(errorText(err));
      setSaving(false);
    }
  }

  async function setPhoto(file: Blob) {
    setPhotoBusy(true);
    try {
      const old = gift!.photo_path;
      const path = await uploadPhoto(householdId, 'gifts', giftId, file);
      await data.updateGift(giftId, { photo_path: path });
      void deletePhoto(old);
    } catch (err) {
      toast(errorText(err));
    } finally {
      setPhotoBusy(false);
    }
  }

  async function removePhoto() {
    setPhotoBusy(true);
    try {
      const old = gift!.photo_path;
      await data.updateGift(giftId, { photo_path: null });
      void deletePhoto(old);
    } catch (err) {
      toast(errorText(err));
    } finally {
      setPhotoBusy(false);
    }
  }

  async function lookUpLink() {
    if (!form || !looksLikeUrl(form.link)) return;
    setLooking(true);
    const p = await fetchLinkPreview(form.link);
    setLooking(false);
    if (!p || (!p.title && !p.image)) {
      toast("Couldn't read that page. You can type the details instead.");
      return;
    }
    setForm((f) =>
      f ? { ...f, store: f.store || p.site || storeFromUrl(f.link) || '', name: f.name || p.title || f.name } : f,
    );
    if (p.image && !gift!.photo_path) {
      const blob = await fetchPreviewImage(p.image);
      if (blob) await setPhoto(blob);
    }
  }

  async function remove() {
    try {
      const old = gift!.photo_path;
      await data.deleteGift(giftId);
      void deletePhoto(old);
      toast('Gift deleted.');
      onClose();
    } catch (err) {
      toast(errorText(err));
    }
  }

  return (
    <Sheet
      title={gift.name}
      onClose={onClose}
      footer={
        <>
          <ConfirmButton confirmText="Tap again to delete" onConfirm={() => void remove()}>
            Delete
          </ConfirmButton>
          <button
            type="submit"
            form="gift-form"
            className="btn primary"
            disabled={saving || !dirty || !form.name.trim() || !moneyOk.estimate || !moneyOk.paid}
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </>
      }
    >
      <section className="stack" aria-label="Status">
        <StatusStrip status={gift.status} onChange={(s) => s !== gift.status && void onStatus(gift, s)} />
      </section>

      <PhotoPicker
        preview={<GiftPhoto path={gift.photo_path} alt={gift.name} />}
        hasPhoto={Boolean(gift.photo_path)}
        busy={photoBusy}
        onPick={(f) => void setPhoto(f)}
        onRemove={() => void removePhoto()}
        prompt="Add a picture"
      />

      <form id="gift-form" className="stack" onSubmit={save}>
        <TextField label="Gift" value={form.name} onChange={(v) => set('name', v)} required maxLength={200} />
        <PersonPicker value={form.person_id} onChange={(v) => set('person_id', v)} />

        <div className="row-fields">
          <MoneyField
            label="Estimate"
            value={form.estimate}
            onChange={(v) => set('estimate', v)}
            onValidChange={(ok) => setMoneyOk((m) => ({ ...m, estimate: ok }))}
          />
          <MoneyField
            label="Paid"
            value={form.paid}
            onChange={(v) => set('paid', v)}
            onValidChange={(ok) => setMoneyOk((m) => ({ ...m, paid: ok }))}
            hint={gift.status === 'idea' ? 'Counts once ordered' : undefined}
          />
        </div>

        <Field label="Link">
          {(id) => (
            <div className="input-with-btn">
              <input
                id={id}
                type="url"
                inputMode="url"
                value={form.link}
                onChange={(e) => set('link', e.target.value)}
                placeholder="https://"
                autoComplete="off"
              />
              <button
                type="button"
                className="btn small"
                onClick={() => void lookUpLink()}
                disabled={looking || !looksLikeUrl(form.link)}
              >
                {looking ? 'Looking…' : 'Get details'}
              </button>
            </div>
          )}
        </Field>
        {gift.link && looksLikeUrl(gift.link) && (
          <a className="small" href={gift.link} target="_blank" rel="noopener noreferrer">
            Open the link
          </a>
        )}

        <TextField label="Store" value={form.store} onChange={(v) => set('store', v)} maxLength={80} />

        <div className="row-fields">
          <Field label="Who's buying?">
            {(id) => (
              <select id={id} value={form.buyer} onChange={(e) => set('buyer', e.target.value)}>
                <option value="">Not decided</option>
                {data.members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.user_id === me ? `Me (${memberName(m)})` : memberName(m)}
                  </option>
                ))}
                <option value={SHARED}>Both of us</option>
              </select>
            )}
          </Field>
          <TextField label="Ship by" type="date" value={form.ship_by} onChange={(v) => set('ship_by', v)} />
        </div>

        <TextField
          label="Payment method"
          value={form.payment_method}
          onChange={(v) => set('payment_method', v)}
          list="payment-methods"
          maxLength={60}
          autoComplete="off"
        />
        <datalist id="payment-methods">
          {PAYMENT_METHODS.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </form>

      {history && history.length > 0 && (
        <section className="history" aria-label="History">
          <h3 className="h4">History</h3>
          <ul>
            {history.map((h) => (
              <li key={h.id} className="small muted">
                {h.user_id === me ? 'You' : memberName(data.members.find((m) => m.user_id === h.user_id))}{' '}
                {h.from_status ? `moved it to ${STATUS_LABELS[h.to_status]}` : 'added it'} ·{' '}
                {formatDistanceToNow(parseISO(h.created_at), { addSuffix: true })}
              </li>
            ))}
          </ul>
        </section>
      )}
    </Sheet>
  );
}
