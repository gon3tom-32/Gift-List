import { useEffect, useState, type ReactNode } from 'react';

/** Needs two taps: the first arms it, the second does it. */
export function ConfirmButton({
  children,
  confirmText,
  onConfirm,
  disabled,
}: {
  children: ReactNode;
  confirmText: string;
  onConfirm: () => void;
  disabled?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(false), 4000);
    return () => window.clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      className={`btn danger${armed ? ' armed' : ''}`}
      disabled={disabled}
      onClick={() => (armed ? onConfirm() : setArmed(true))}
    >
      {armed ? confirmText : children}
    </button>
  );
}
