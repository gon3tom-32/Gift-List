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
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function savePassword(e: FormEvent) {
    e.preventDefault();
    if (newPassword.length < 8) {
      setPasswordMsg({ ok: false, text: 'Use at least 8 characters.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ ok: false, text: "The two passwords don't match." });
      return;
    }
    setBusy(true);
    setPasswordMsg(null);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setBusy(false);
    if (error) {
      setPasswordMsg({ ok: false, text: errorText(error) });
    } else {
      setNewPassword('');
      setConfirmPassword('');
      setPasswordMsg({ ok: true, text: 'Password saved. Next time, sign in with your email and this password.' });
    }
  }

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

      <section className="stack section">
        <h3 className="h4">Sign-in password</h3>
        <p className="muted small">
          Set a password so you can sign in without waiting for an email. It's just for you; your partner sets their own.
        </p>
        <form className="stack" onSubmit={savePassword}>
          {/* Lets password managers save the password against the right email. */}
          <input type="email" autoComplete="username" value={meMember?.email ?? ''} readOnly hidden />
          <TextField
            label="New password"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(v) => {
              setNewPassword(v);
              setPasswordMsg(null);
            }}
            hint="At least 8 characters."
          />
          <TextField
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(v) => {
              setConfirmPassword(v);
              setPasswordMsg(null);
            }}
          />
          {passwordMsg && (
            <p className={passwordMsg.ok ? 'notice' : 'error'} role={passwordMsg.ok ? 'status' : 'alert'}>
              {passwordMsg.text}
            </p>
          )}
          <button className="btn" disabled={busy || !newPassword || !confirmPassword}>
            Save password
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
