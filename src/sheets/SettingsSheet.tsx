import { useState, type FormEvent } from 'react';
import { useApp } from '../lib/context';
import { errorText, supabase } from '../lib/supabase';
import { memberName } from '../lib/types';
import type { Cents } from '../lib/money';
import { Sheet } from '../components/Sheet';
import { MoneyField, TextField } from '../components/Fields';
import { Avatar } from '../components/Avatar';

export function SettingsSheet({ onClose }: { onClose: () => void }) {
  const { data, me, toast } = useApp();
  const household = data.household!;
  const meMember = data.members.find((m) => m.user_id === me);

  const [listName, setListName] = useState(household.name);
  const [budget, setBudget] = useState<Cents | null>(household.budget || null);
  const [budgetOk, setBudgetOk] = useState(true);
  const [myName, setMyName] = useState(meMember?.display_name ?? '');
  const [inviteEmail, setInviteEmail] = useState('');
  const [busy, setBusy] = useState(false);

  async function saveList(e: FormEvent) {
    e.preventDefault();
    if (!budgetOk) return;
    setBusy(true);
    try {
      await data.updateHousehold({ name: listName.trim() || 'Our Gift List', budget: budget ?? 0 });
      if ((meMember?.display_name ?? '') !== myName.trim()) await data.setDisplayName(myName);
      toast('Saved.');
    } catch (err) {
      toast(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function invite(e: FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setBusy(true);
    try {
      await data.invite(inviteEmail);
      toast(`Invited ${inviteEmail.trim()}. They join when they sign in with that email.`);
      setInviteEmail('');
    } catch (err) {
      toast(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title="Our list" onClose={onClose}>
      <form className="stack" onSubmit={saveList}>
        <TextField label="List name" value={listName} onChange={setListName} maxLength={60} />
        <MoneyField
          label="Total Christmas budget"
          value={budget}
          onChange={setBudget}
          onValidChange={setBudgetOk}
          placeholder="Not set"
        />
        <TextField
          label="Your name"
          value={myName}
          onChange={setMyName}
          maxLength={40}
          placeholder={meMember?.email?.split('@')[0] ?? ''}
          hint="What your partner sees next to your changes."
        />
        <button className="btn primary" disabled={busy || !budgetOk}>
          Save
        </button>
      </form>

      <section className="stack section">
        <h3 className="h4">Who's on the list</h3>
        <ul className="members">
          {data.members.map((m) => (
            <li key={m.user_id}>
              <Avatar name={memberName(m)} size={36} />
              <span>
                {memberName(m)}
                {m.user_id === me && ' (you)'}
                <br />
                <small className="muted">
                  {m.email} · {m.role}
                </small>
              </span>
            </li>
          ))}
          {data.invites.map((i) => (
            <li key={i.id}>
              <span className="avatar pending" aria-hidden="true">
                ?
              </span>
              <span>
                {i.email}
                <br />
                <small className="muted">Invited, not joined yet</small>
              </span>
              <button
                type="button"
                className="btn small link"
                onClick={() => void data.cancelInvite(i.id).catch((err) => toast(errorText(err)))}
              >
                Cancel
              </button>
            </li>
          ))}
        </ul>

        <form className="stack" onSubmit={invite}>
          <TextField
            label="Invite your partner"
            type="email"
            inputMode="email"
            value={inviteEmail}
            onChange={setInviteEmail}
            placeholder="partner@example.com"
            autoComplete="off"
            hint="They sign in with this email and the list appears for them."
          />
          <button className="btn" disabled={busy || !inviteEmail.trim()}>
            Send invite
          </button>
        </form>
      </section>

      <section className="section">
        <button className="btn link" onClick={() => void supabase.auth.signOut()}>
          Sign out
        </button>
      </section>
    </Sheet>
  );
}
