import { useEffect, useState, type FormEvent } from 'react';
import { useApp } from '../lib/context';
import { errorText, supabase } from '../lib/supabase';
import { memberName } from '../lib/types';
import { formatCents, type Cents } from '../lib/money';
import { Icon, type IconName } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { MoneyField, TextField } from '../components/Fields';
import { Avatar } from '../components/Avatar';
import { PhotoPicker } from '../components/PhotoPicker';
import { deletePhoto, uploadPhoto } from '../lib/photos';
import { buildWidgetScript, requestWidgetLink } from '../lib/widget';
import { disablePush, enablePush, pushState, sendTestPush, type PushState } from '../lib/push';

export type SettingsView = 'menu' | 'list' | 'people' | 'notifications' | 'shortcut' | 'widget' | 'password';

const PAGE_TITLES: Record<SettingsView, string> = {
  menu: 'Settings',
  list: 'Our list',
  people: "Who's on the list",
  notifications: 'Notifications',
  shortcut: 'Add ideas from any app',
  widget: 'Phone widget',
  password: 'Sign-in and password',
};

export function SettingsSheet({ onClose, view = 'menu' }: { onClose: () => void; view?: SettingsView }) {
  const [page, setPage] = useState<SettingsView>(view);
  const [pushOn, setPushOn] = useState<PushState | null>(null);
  useEffect(() => {
    void pushState().then(setPushOn);
  }, []);
  const { data, me, toast } = useApp();
  const household = data.household!;
  const meMember = data.members.find((m) => m.user_id === me);

  const [listName, setListName] = useState(household.name);
  const [budget, setBudget] = useState<Cents | null>(household.budget || null);
  const [budgetOk, setBudgetOk] = useState(true);
  const [myName, setMyName] = useState(meMember?.display_name ?? '');
  const [inviteEmail, setInviteEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [partnerEmail, setPartnerEmail] = useState('');
  const [partnerPassword, setPartnerPassword] = useState('');
  const [partnerConfirm, setPartnerConfirm] = useState('');
  const [partnerMsg, setPartnerMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const isOwner = meMember?.role === 'owner';
  const hasRoom = data.members.length < 2;

  async function addPartner(e: FormEvent) {
    e.preventDefault();
    if (partnerPassword.length < 8) {
      setPartnerMsg({ ok: false, text: 'Use a password of at least 8 characters.' });
      return;
    }
    if (partnerPassword !== partnerConfirm) {
      setPartnerMsg({ ok: false, text: "The two passwords don't match." });
      return;
    }
    setBusy(true);
    setPartnerMsg(null);
    const email = partnerEmail.trim().toLowerCase();
    try {
      await data.addPartner(email, partnerPassword);
      setPartnerEmail('');
      setPartnerPassword('');
      setPartnerConfirm('');
      setPartnerMsg({ ok: true, text: `Done! ${email} can now sign in with Password using the password you chose.` });
    } catch (err) {
      setPartnerMsg({ ok: false, text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  async function setPhoto(file: File | null) {
    setPhotoBusy(true);
    try {
      const old = household.photo_path;
      const path = file ? await uploadPhoto(household.id, 'household', household.id, file) : null;
      await data.updateHousehold({ photo_path: path });
      void deletePhoto(old);
      toast(file ? 'Photo saved.' : 'Photo removed.');
    } catch (err) {
      toast(errorText(err));
    } finally {
      setPhotoBusy(false);
    }
  }
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
      toast('Saved.');
    } catch (err) {
      toast(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveMyName(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await data.setDisplayName(myName);
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

  const summary: Record<Exclude<SettingsView, 'menu'>, string> = {
    list: `${household.name} · ${household.budget ? formatCents(household.budget, { whole: true }) : 'no budget set'}`,
    people: data.members.map((m) => memberName(m)).join(' and '),
    notifications:
      pushOn === 'on' ? 'On for this phone' : pushOn === 'needs-install' ? 'Needs the Home Screen app' : 'Off for this phone',
    shortcut: 'Share a gift from any shop',
    widget: 'Countdown on your Home Screen',
    password: 'Sign in with email and password',
  };
  const rows: { id: Exclude<SettingsView, 'menu'>; icon: IconName }[] = [
    { id: 'list', icon: 'gift' },
    { id: 'people', icon: 'users' },
    { id: 'notifications', icon: 'sparkle' },
    { id: 'shortcut', icon: 'link' },
    { id: 'widget', icon: 'star' },
    { id: 'password', icon: 'edit' },
  ];

  return (
    <Sheet title={PAGE_TITLES[page]} onClose={onClose}>
      {page !== 'menu' && (
        <button type="button" className="btn small settings-back" onClick={() => setPage('menu')}>
          <Icon name="back" size={16} /> Settings
        </button>
      )}

      {page === 'menu' && (
        <>
          <ul className="settings-menu">
            {rows.map((r) => (
              <li key={r.id}>
                <button type="button" className="settings-row" onClick={() => setPage(r.id)}>
                  <span className="settings-row-icon" aria-hidden="true">
                    <Icon name={r.icon} size={20} />
                  </span>
                  <span className="settings-row-text">
                    <strong>{PAGE_TITLES[r.id]}</strong>
                    <small className="muted">{summary[r.id]}</small>
                  </span>
                  <Icon name="chevron" size={18} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
          <section className="section">
            <button className="btn link" onClick={() => void supabase.auth.signOut()}>
              Sign out
            </button>
          </section>
        </>
      )}

      {page === 'list' && (
        <>
      <section className="stack" aria-label="Our photo">
        <PhotoPicker
          preview={<Avatar name={household.name} photoPath={household.photo_path} size={72} />}
          hasPhoto={Boolean(household.photo_path)}
          busy={photoBusy}
          onPick={(f) => void setPhoto(f)}
          onRemove={() => void setPhoto(null)}
          prompt="Add a photo of us"
        />
      </section>

      <form className="stack" onSubmit={saveList}>
        <TextField label="List name" value={listName} onChange={setListName} maxLength={60} />
        <MoneyField
          label="Total Christmas budget"
          value={budget}
          onChange={setBudget}
          onValidChange={setBudgetOk}
          placeholder="Not set"
        />
        <button className="btn primary" disabled={busy || !budgetOk}>
          Save
        </button>
      </form>
        </>
      )}

      {page === 'people' && (
        <>
      <form className="stack" onSubmit={saveMyName}>
        <TextField
          label="Your name"
          value={myName}
          onChange={setMyName}
          maxLength={40}
          placeholder={meMember?.email?.split('@')[0] ?? ''}
          hint="What your partner sees next to your changes."
        />
        <button className="btn primary" disabled={busy}>
          Save
        </button>
      </form>

      <section className="stack section">
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

        {partnerMsg?.ok && (
          <p className="notice" role="status">
            {partnerMsg.text}
          </p>
        )}

        {hasRoom && isOwner && (
          <form className="stack" onSubmit={addPartner}>
            <h4 className="h4">Add your partner directly</h4>
            <p className="muted small">
              Make their login here: their email and a password you choose. Share the password with them privately; they
              can change it in Settings after signing in.
            </p>
            <TextField
              label="Partner's email"
              type="email"
              inputMode="email"
              value={partnerEmail}
              onChange={(v) => {
                setPartnerEmail(v);
                setPartnerMsg(null);
              }}
              placeholder="partner@example.com"
              autoComplete="off"
              required
            />
            <TextField
              label="Their password"
              type="password"
              autoComplete="new-password"
              value={partnerPassword}
              onChange={(v) => {
                setPartnerPassword(v);
                setPartnerMsg(null);
              }}
              hint="At least 8 characters."
              required
            />
            <TextField
              label="Confirm their password"
              type="password"
              autoComplete="new-password"
              value={partnerConfirm}
              onChange={(v) => {
                setPartnerConfirm(v);
                setPartnerMsg(null);
              }}
              required
            />
            {partnerMsg && !partnerMsg.ok && (
              <p className="error" role="alert">
                {partnerMsg.text}
              </p>
            )}
            <button className="btn primary" disabled={busy || !partnerEmail.trim() || !partnerPassword || !partnerConfirm}>
              {busy ? 'Adding…' : 'Add partner'}
            </button>
          </form>
        )}

        {hasRoom && (
          <details className="more">
            <summary>{isOwner ? 'Or invite them by email instead' : 'Invite by email'}</summary>
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
          </details>
        )}
      </section>
        </>
      )}

      {page === 'password' && (
      <section className="stack section">
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
      )}

      {page === 'notifications' && <NotificationsSection householdId={household.id} userId={me} />}

      {page === 'shortcut' && <ShareShortcutHelp />}

      {page === 'widget' && <WidgetSection />}
    </Sheet>
  );
}

/** Turns push notifications on or off for this phone. */
function NotificationsSection({ householdId, userId }: { householdId: string; userId: string }) {
  const { toast } = useApp();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void pushState().then(setState);
  }, []);

  async function toggle() {
    setBusy(true);
    try {
      if (state === 'on') await disablePush();
      else await enablePush(householdId, userId);
      setState(await pushState());
    } catch (err) {
      toast(errorText(err));
      setState(await pushState());
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    try {
      await sendTestPush();
      toast('Sent. It should show up in a moment.');
    } catch (err) {
      toast(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="stack section">
      {state === 'needs-install' && (
        <p className="muted small">
          On iPhone, notifications only work from the Gift-List app on your Home Screen. Open it from there, then come
          back to this switch.
        </p>
      )}
      {state === 'unsupported' && <p className="muted small">This phone's browser can't show notifications.</p>}
      {state === 'denied' && (
        <p className="muted small">Notifications are blocked for Gift-List. Turn them on in your phone's settings.</p>
      )}
      {(state === 'off' || state === 'on') && (
        <>
          <label className="toggle">
            <input type="checkbox" checked={state === 'on'} disabled={busy} onChange={() => void toggle()} />
            <span>Notify this phone</span>
          </label>
          {state === 'on' && (
            <button type="button" className="btn" disabled={busy} onClick={() => void test()}>
              Send a test notification
            </button>
          )}
        </>
      )}
    </section>
  );
}

/** How to set up the iPhone Shortcut that shares shop pages into Gift-List. */
function ShareShortcutHelp() {
  const address = `${window.location.origin}${import.meta.env.BASE_URL}#/add?url=`;
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="stack section">
      <p className="muted small">
        Set this up once on each phone. Then on any shop page, tap <strong>Share → Gift-List</strong> and the idea opens
        here with the link filled in.
      </p>
      <ol className="steps small">
        <li>
          Open the <strong>Shortcuts</strong> app, tap <strong>+</strong>, and name it <strong>Gift-List</strong>.
        </li>
        <li>
          Tap the <strong>ⓘ</strong> details and turn on <strong>Show in Share Sheet</strong>. Set it to receive{' '}
          <strong>URLs, Safari web pages and Text</strong>.
        </li>
        <li>
          Add the action <strong>URL Encode</strong> (it uses the <em>Shortcut Input</em>).
        </li>
        <li>
          Add <strong>Text</strong>: paste the address below, then tap the variable bar and add{' '}
          <em>URL Encoded Text</em> right after it.
        </li>
        <li>
          Add <strong>Open URLs</strong> (it uses the <em>Text</em>). Done!
        </li>
      </ol>
      <label className="field">
        <span>Gift-List address for step 4</span>
        <input readOnly value={address} onFocus={(e) => e.currentTarget.select()} />
      </label>
      <button type="button" className="btn small" onClick={() => void copy()}>
        {copied ? 'Copied!' : 'Copy the Gift-List address'}
      </button>
    </section>
  );
}

/** Sets up the Scriptable widget: a private link plus the script to paste into Scriptable. */
function WidgetSection() {
  const { toast } = useApp();
  const [script, setScript] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function make() {
    setBusy(true);
    try {
      const link = await requestWidgetLink();
      setScript(buildWidgetScript(link, `${window.location.origin}${import.meta.env.BASE_URL}`));
    } catch (err) {
      toast(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!script) return;
    try {
      await navigator.clipboard.writeText(script);
      toast('Copied. Paste it into Scriptable.');
    } catch {
      toast('Could not copy. Press and hold the box, then choose Select All and Copy.');
    }
  }

  return (
    <section className="stack">
      <p className="muted small">
        Put your Christmas countdown, gifts still open and money left on your Home Screen or Lock Screen, using the free
        Scriptable app.
      </p>
      <ol className="steps small">
        <li>Install <strong>Scriptable</strong> from the App Store (free).</li>
        <li>Tap <strong>Make my widget link</strong> below, then <strong>Copy script</strong>.</li>
        <li>In Scriptable tap <strong>+</strong>, paste the script, and name it Gift-List.</li>
        <li>On your Home Screen touch and hold, tap <strong>+</strong>, pick <strong>Scriptable</strong>, add a widget, then tap it and choose the Gift-List script.</li>
      </ol>
      <button type="button" className="btn primary" disabled={busy} onClick={() => void make()}>
        {busy ? 'Making…' : script ? 'Make a new link' : 'Make my widget link'}
      </button>
      {script && (
        <>
          <label className="visually-hidden" htmlFor="widget-script">
            Widget script
          </label>
          <textarea id="widget-script" className="code-box" readOnly value={script} rows={8} onFocus={(e) => e.currentTarget.select()} />
          <button type="button" className="btn" onClick={() => void copy()}>
            Copy script
          </button>
        </>
      )}
      <p className="muted small">
        The link in the script is private to you. Anyone who has it can see your totals (days, open gifts, money left) but
        never your gifts or people. iPhone refreshes widgets every so often, so the numbers can lag a little.
      </p>
    </section>
  );
}
