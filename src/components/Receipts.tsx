import { useRef, useState } from 'react';
import { useApp } from '../lib/context';
import { errorText } from '../lib/supabase';
import { uploadPhoto, useSignedUrl } from '../lib/photos';
import { formatCents, type Cents } from '../lib/money';
import { giftsOnReceipt, receiptCoverage, receiptsForGift } from '../lib/receipts';
import type { Receipt } from '../lib/types';
import { Icon } from './Icon';
import { MoneyField } from './Fields';

function Thumb({ receipt }: { receipt: Receipt }) {
  const url = useSignedUrl(receipt.photo_path);
  if (!url) return <div className="receipt-thumb placeholder" aria-hidden="true" />;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="receipt-thumb"
      aria-label="Open receipt full size"
    >
      <img src={url} alt="Receipt" loading="lazy" decoding="async" />
    </a>
  );
}

function ReceiptRow({ receipt, giftId }: { receipt: Receipt; giftId: string }) {
  const { data, toast } = useApp();
  const [total, setTotal] = useState<Cents | null>(receipt.total);
  const [ok, setOk] = useState(true);
  const [busy, setBusy] = useState(false);
  const on = giftsOnReceipt(receipt.id, data.giftReceipts, data.gifts);
  const cov = receiptCoverage(receipt.total, on);
  const dirty = total !== receipt.total;

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      toast(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="receipt-row">
      <Thumb receipt={receipt} />
      <div className="receipt-body stack">
        <MoneyField label="Receipt total (optional)" value={total} onChange={setTotal} onValidChange={setOk} />
        {dirty && (
          <button
            type="button"
            className="btn small"
            disabled={busy || !ok}
            onClick={() => void run(() => data.updateReceipt(receipt.id, { total }))}
          >
            Save total
          </button>
        )}
        {receipt.total !== null && (
          <p className="small muted" role="status">
            {on.length === 1 ? 'This gift' : `${on.length} gifts`} on it paid {formatCents(cov.paid)} of{' '}
            {formatCents(receipt.total)}.
            {cov.difference !== null && cov.difference > 0 && <> {formatCents(cov.difference)} not on a gift yet.</>}
            {cov.difference !== null && cov.difference < 0 && (
              <> {formatCents(-cov.difference)} more than the receipt.</>
            )}
            {cov.missing > 0 && (
              <>
                {' '}
                {cov.missing} gift{cov.missing === 1 ? ' has' : 's have'} no paid amount.
              </>
            )}
          </p>
        )}
        {on.length > 1 && (
          <p className="small muted">
            Also covers{' '}
            {on
              .filter((g) => g.id !== giftId)
              .map((g) => g.name)
              .join(', ')}
            .
          </p>
        )}
        <button
          type="button"
          className="btn small link"
          disabled={busy}
          onClick={() => void run(() => data.detachReceipt(receipt.id, giftId))}
        >
          {on.length > 1 ? 'Remove from this gift' : 'Delete receipt'}
        </button>
      </div>
    </li>
  );
}

/** Receipts on a gift: add a photo, attach one that already exists, see how they add up. */
export function Receipts({ giftId }: { giftId: string }) {
  const { data, toast } = useApp();
  const householdId = data.household!.id;
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const mine = receiptsForGift(giftId, data.giftReceipts, data.receipts);
  const mineIds = new Set(mine.map((r) => r.id));
  const others = data.receipts.filter((r) => !mineIds.has(r.id));

  async function add(file: File) {
    setBusy(true);
    try {
      const path = await uploadPhoto(householdId, 'receipts', crypto.randomUUID(), file);
      await data.addReceipt({ photo_path: path }, [giftId]);
    } catch (err) {
      toast(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function attach(receiptId: string) {
    setBusy(true);
    try {
      await data.attachReceipt(receiptId, [giftId]);
    } catch (err) {
      toast(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="section stack" aria-label="Receipts">
      <h3 className="h4">Receipts</h3>
      {mine.length > 0 && (
        <ul className="receipt-list">
          {mine.map((r) => (
            <ReceiptRow key={r.id} receipt={r} giftId={giftId} />
          ))}
        </ul>
      )}
      <div className="photo-actions">
        <input
          ref={input}
          type="file"
          accept="image/*"
          className="visually-hidden"
          tabIndex={-1}
          aria-label="Receipt photo"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void add(f);
            e.target.value = '';
          }}
        />
        <button type="button" className="btn small" disabled={busy} onClick={() => input.current?.click()}>
          <Icon name="camera" size={18} /> {busy ? 'Working…' : 'Add receipt'}
        </button>
      </div>
      {others.length > 0 && (
        <div className="field">
          <label htmlFor="attach-receipt">Same receipt as another gift?</label>
          <select
            id="attach-receipt"
            value=""
            disabled={busy}
            onChange={(e) => e.target.value && void attach(e.target.value)}
          >
            <option value="">Attach an existing receipt…</option>
            {others.map((r) => {
              const names = giftsOnReceipt(r.id, data.giftReceipts, data.gifts)
                .map((g) => g.name)
                .join(', ');
              return (
                <option key={r.id} value={r.id}>
                  {names || 'Receipt'}
                  {r.total !== null ? ` · ${formatCents(r.total)}` : ''}
                </option>
              );
            })}
          </select>
        </div>
      )}
      {mine.length === 0 && (
        <p className="small muted">Keep the receipt here. Add the total paid (tax included) in "Paid" above.</p>
      )}
    </section>
  );
}
