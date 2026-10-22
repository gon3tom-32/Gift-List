import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { errorText, isConfigured, supabase } from './lib/supabase';
import { SignIn } from './screens/SignIn';
import { Setup } from './screens/Setup';
import { Home } from './screens/Home';

type Phase =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'no-household'; session: Session }
  | { kind: 'ready'; session: Session; householdId: string }
  | { kind: 'error'; message: string };

export function App() {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });

  const enter = useCallback(async (session: Session | null) => {
    if (!session) {
      setPhase({ kind: 'signed-out' });
      return;
    }
    try {
      // Join any household that invited this email, then find ours.
      const accepted = await supabase.rpc('accept_invites');
      if (accepted.error) throw accepted.error;
      const { data, error } = await supabase
        .from('household_members')
        .select('household_id, joined_at')
        .eq('user_id', session.user.id)
        .order('joined_at', { ascending: true })
        .limit(1);
      if (error) throw error;
      const hid = data?.[0]?.household_id as string | undefined;
      setPhase(hid ? { kind: 'ready', session, householdId: hid } : { kind: 'no-household', session });
    } catch (err) {
      setPhase({ kind: 'error', message: errorText(err) });
    }
  }, []);

  useEffect(() => {
    if (!isConfigured) return;
    let current: string | null = null;
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      const id = session?.user.id ?? null;
      // Token refreshes keep the same user; only react to real changes.
      if (event === 'TOKEN_REFRESHED' && id === current) return;
      if (id === current && event !== 'INITIAL_SESSION') return;
      current = id;
      // Run outside the auth callback (Supabase recommends not awaiting inside it).
      setTimeout(() => void enter(session), 0);
    });
    return () => data.subscription.unsubscribe();
  }, [enter]);

  if (!isConfigured) {
    return (
      <main className="center-screen">
        <div className="card narrow">
          <h1 className="display">Almost there</h1>
          <p>
            Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to <code>.env.local</code> (or to
            the deploy workflow in <code>.github/workflows/deploy.yml</code>), then reload.
          </p>
        </div>
      </main>
    );
  }

  switch (phase.kind) {
    case 'loading':
      return (
        <main className="center-screen" aria-busy="true">
          <p className="loading-text">Unwrapping your list…</p>
        </main>
      );
    case 'signed-out':
      return <SignIn />;
    case 'no-household':
      return (
        <Setup
          email={phase.session.user.email ?? ''}
          onReady={(householdId) => setPhase({ kind: 'ready', session: phase.session, householdId })}
          onCheckAgain={() => enter(phase.session)}
        />
      );
    case 'ready':
      return <Home householdId={phase.householdId} me={phase.session.user.id} />;
    case 'error':
      return (
        <main className="center-screen">
          <div className="card narrow" role="alert">
            <h1 className="display">Oh, snow!</h1>
            <p>{phase.message}</p>
            <div className="row">
              <button className="btn primary" onClick={() => window.location.reload()}>
                Try again
              </button>
              <button className="btn" onClick={() => supabase.auth.signOut()}>
                Sign out
              </button>
            </div>
          </div>
        </main>
      );
  }
}
