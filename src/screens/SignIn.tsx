import { useState, type FormEvent } from 'react';
import { errorText, supabase } from '../lib/supabase';
import { Icon } from '../components/Icon';
import { countdownText } from '../lib/christmas';

type Mode = 'password' | 'link' | 'new';

export function SignIn({ notice, embedded }: { notice?: string | null; embedded?: boolean }) {
  // A failed email link means the person is mid email-link sign-in.
  const [mode, setMode] = useState<Mode>(notice ? 'link' : embedded ? 'new' : 'password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  function switchTo(next: Mode) {
    setMode(next);
    setError(null);
  }

  async function signInWithPassword(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setState('sending');
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    // On success the app's sign-in listener takes over.
    if (error) setError(errorText(error));
    setState('idle');
  }

  async function sendLink(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setState('sending');
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      // Come back to the app's own address, e.g. https://gon3tom-32.github.io/Gift-List/
      options: { emailRedirectTo: window.location.origin + import.meta.env.BASE_URL },
    });
    if (error) {
      setError(errorText(error));
      setState('idle');
    } else {
      setState('sent');
    }
  }

  const emailField = (
    <label className="field">
      <span>Email</span>
      <input
        type="email"
        inputMode="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
      />
    </label>
  );

  const errorLine = error && (
    <p className="error" role="alert">
      {error}
    </p>
  );

  const Wrap = embedded ? 'div' : 'main';
  return (
    <Wrap className={embedded ? 'signin-embedded' : 'center-screen'}>
      <div className="card narrow signin">
        <div className="signin-badge" aria-hidden="true">
          <Icon name="gift" size={40} />
        </div>
        <h1 className="display">Gift-List</h1>
        <p className="muted">{countdownText()}. Let's get the list sorted together.</p>

        {state === 'sent' ? (
          <div className="notice" role="status">
            <p>
              <strong>Check your email.</strong> We sent a sign-in link to {email.trim()}. Tap the link in that email to
              come back here signed in.
            </p>
            <button className="btn link" onClick={() => setState('idle')}>
              Use a different email
            </button>
          </div>
        ) : (
          <>
            <div className="chip-row" role="group" aria-label="How to sign in">
              <button
                type="button"
                className="chip"
                aria-pressed={mode === 'password'}
                onClick={() => switchTo('password')}
              >
                Password
              </button>
              <button type="button" className="chip" aria-pressed={mode === 'link'} onClick={() => switchTo('link')}>
                Email link
              </button>
              <button type="button" className="chip" aria-pressed={mode === 'new'} onClick={() => switchTo('new')}>
                New here?
              </button>
            </div>

            {notice && !error && (
              <p className="notice" role="status">
                {notice}
              </p>
            )}

            {mode === 'password' ? (
              <form onSubmit={signInWithPassword} className="stack">
                {emailField}
                <label className="field">
                  <span>Password</span>
                  <input
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
                {errorLine}
                <button className="btn primary big" disabled={state === 'sending'}>
                  {state === 'sending' ? 'Signing in…' : 'Sign in'}
                </button>
                <button type="button" className="btn link" onClick={() => switchTo('link')}>
                  First time, or forgot your password? Get an email link instead
                </button>
              </form>
            ) : mode === 'new' ? (
              <form onSubmit={sendLink} className="stack">
                <p>
                  <strong>Make your own gift list.</strong> It's free. Enter your email and we'll send a link; tap it and
                  you can start your list.
                </p>
                {emailField}
                {errorLine}
                <button className="btn primary big" disabled={state === 'sending'}>
                  {state === 'sending' ? 'Sending…' : 'Email me a link to get started'}
                </button>
              </form>
            ) : (
              <form onSubmit={sendLink} className="stack">
                {emailField}
                {errorLine}
                <button className="btn primary big" disabled={state === 'sending'}>
                  {state === 'sending' ? 'Sending…' : 'Email me a sign-in link'}
                </button>
                <p className="muted small">After you're in, you can set a password in the menu.</p>
              </form>
            )}
            <p className="muted small privacy-line">Your list is private. Only the person you add can see it.</p>
          </>
        )}
      </div>

      {!embedded && (
        <section className="how-it-works" aria-label="How Gift-List works">
          <h2 className="h4">How it works</h2>
          <ol>
            <li>
              <Icon name="users" size={22} />
              <span>Add the people you're buying for</span>
            </li>
            <li>
              <Icon name="gift" size={22} />
              <span>Collect ideas, with pictures and prices</span>
            </li>
            <li>
              <Icon name="link" size={22} />
              <span>Share a gift from any shop in two taps</span>
            </li>
            <li>
              <Icon name="check" size={22} />
              <span>Track what's bought, and what's left to spend</span>
            </li>
          </ol>
        </section>
      )}
    </Wrap>
  );
}
