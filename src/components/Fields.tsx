import { useEffect, useId, useState, type InputHTMLAttributes, type ReactNode, type Ref } from 'react';
import { centsToInput, parseMoneyInput, type Cents } from '../lib/money';

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: (id: string, describedBy?: string) => ReactNode;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children(id, hintId)}
      {hint && (
        <small id={hintId} className="hint">
          {hint}
        </small>
      )}
    </div>
  );
}

export function TextField({
  label,
  hint,
  value,
  onChange,
  inputRef,
  ...rest
}: {
  label: string;
  hint?: ReactNode;
  value: string;
  onChange: (v: string) => void;
  inputRef?: Ref<HTMLInputElement>;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return (
    <Field label={label} hint={hint}>
      {(id, describedBy) => (
        <input
          id={id}
          ref={inputRef}
          aria-describedby={describedBy}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          {...rest}
        />
      )}
    </Field>
  );
}

/**
 * A dollar amount box. Keeps what the person typed, reports cents (or null for
 * blank) to the parent, and shows a message when the text isn't a price.
 */
export function MoneyField({
  label,
  value,
  onChange,
  onValidChange,
  hint,
  placeholder = '0.00',
}: {
  label: string;
  value: Cents | null;
  onChange: (cents: Cents | null) => void;
  onValidChange?: (valid: boolean) => void;
  hint?: ReactNode;
  placeholder?: string;
}) {
  const [text, setText] = useState(centsToInput(value));
  const [error, setError] = useState<string | null>(null);

  // Follow outside changes (e.g. the partner edited it) when not mid-typing.
  useEffect(() => {
    const parsed = parseMoneyInput(text);
    if (!parsed.ok || parsed.cents !== value) setText(centsToInput(value));
  }, [value]);

  return (
    <Field label={label} hint={error ?? hint}>
      {(id, describedBy) => (
        <div className={`money-input${error ? ' invalid' : ''}`}>
          <span aria-hidden="true">$</span>
          <input
            id={id}
            inputMode="decimal"
            autoComplete="off"
            placeholder={placeholder}
            aria-describedby={describedBy}
            aria-invalid={error ? true : undefined}
            value={text}
            onChange={(e) => {
              const next = e.target.value;
              setText(next);
              const parsed = parseMoneyInput(next);
              if (parsed.ok) {
                setError(null);
                onValidChange?.(true);
                onChange(parsed.cents);
              } else {
                setError(parsed.error);
                onValidChange?.(false);
              }
            }}
          />
        </div>
      )}
    </Field>
  );
}
