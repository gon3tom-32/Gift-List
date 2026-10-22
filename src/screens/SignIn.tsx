import { useState, type FormEvent } from 'react';
import { errorText, supabase } from '../lib/supabase';
import { Icon } from '../components/Icon';
import { countdownText } from '../lib/christmas';

export function SignIn() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
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

  return (
    <main className="center-screen">
      <div className="card narrow signin">
        <div className="signin-badge" aria-hidden="true">
          <Icon name="gift" size={40} />
        </div>
        <h1 className="display">Gift-List</h1>
        <p className="muted">{countdownText()}. Let's get the list sorted together.</p>

        {state === 'sent' ? (
          <div className="notice" role="status">
            <p>
              <strong>Check your email.</strong> We sent a sign-in link to {email.trim()}. Open it on this device.
            </p>
            <button className="btn link" onClick={() => setState('idle')}>
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="stack">
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
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="btn primary big" disabled={state === 'sending'}>
              {state === 'sending' ? 'Sending…' : 'Email me a sign-in link'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
