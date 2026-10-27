import { useState, type FormEvent } from 'react';
import { errorText, supabase } from '../lib/supabase';
import { STARTERS } from '../lib/starters';
import { Icon } from '../components/Icon';

/** First sign-in: start a new list, or wait for a partner's invite. */
export function Setup({
  email,
  onReady,
  onCheckAgain,
}: {
  email: string;
  onReady: (householdId: string) => void;
  onCheckAgain: () => void;
}) {
  const [name, setName] = useState('Our Gift List');
  const [partner, setPartner] = useState('');
  const [picked, setPicked] = useState<string[]>(['Our family']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { data: hid, error } = await supabase.rpc('create_household', { hname: name });
      if (error) throw error;
      // The groups they ticked: a head start, easy to rename or remove later.
      const chosen = STARTERS.filter((s) => picked.includes(s.name));
      if (chosen.length > 0) {
        const made = await supabase
          .from('gift_groups')
          .insert(chosen.map((s, i) => ({ household_id: hid, name: s.name, icon: s.icon, sort_order: i })));
        if (made.error) throw made.error;
      }
      if (partner.trim()) {
        const inv = await supabase.rpc('invite_partner', { hid, invite_email: partner });
        if (inv.error) throw inv.error;
      }
      onReady(hid as string);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <main className="center-screen">
      <div className="card narrow">
        <h1 className="display">Welcome!</h1>
        <p className="muted">Signed in as {email}. Let's make your list. It only takes a minute.</p>

        <form onSubmit={create} className="stack">
          <h2 className="h3">Start your list</h2>
          <label className="field">
            <span>List name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          </label>
          <fieldset className="field starters">
            <legend>Who are you buying for? Pick a few to start with.</legend>
            <div className="chip-row">
              {STARTERS.map((s) => (
                <button
                  key={s.name}
                  type="button"
                  className="chip"
                  aria-pressed={picked.includes(s.name)}
                  onClick={() => setPicked((p) => (p.includes(s.name) ? p.filter((x) => x !== s.name) : [...p, s.name]))}
                >
                  <Icon name={s.icon} size={18} /> {s.name}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="field">
            <span>Partner's email (optional)</span>
            <input
              type="email"
              inputMode="email"
              autoComplete="off"
              value={partner}
              onChange={(e) => setPartner(e.target.value)}
              placeholder="They'll join when they sign in"
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="btn primary big" disabled={busy}>
            {busy ? 'Creating…' : 'Create our list'}
          </button>
        </form>

        <div className="divider">or</div>
        <p className="muted small">
          If your partner already made a list and invited <strong>{email}</strong>, you'll join it automatically.
        </p>
        <div className="row">
          <button className="btn" onClick={onCheckAgain}>
            Check for an invite
          </button>
          <button className="btn link" onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
      </div>
    </main>
  );
}
