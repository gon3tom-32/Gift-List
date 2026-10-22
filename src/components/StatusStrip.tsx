import { STATUSES, STATUS_LABELS, statusIndex, type GiftStatus } from '../lib/status';

/** The progress strip on a gift card. Interactive when onChange is given. */
export function StatusStrip({
  status,
  onChange,
  compact,
}: {
  status: GiftStatus;
  onChange?: (s: GiftStatus) => void;
  compact?: boolean;
}) {
  const current = statusIndex(status);
  if (!onChange) {
    return (
      <div
        className={`strip${compact ? ' compact' : ''}`}
        role="img"
        aria-label={`Step ${current + 1} of ${STATUSES.length}: ${STATUS_LABELS[status]}`}
      >
        {STATUSES.map((s, i) => (
          <span key={s} className={`strip-seg${i <= current ? ' done' : ''}`} />
        ))}
      </div>
    );
  }
  return (
    <div className="strip-buttons" role="radiogroup" aria-label="Status">
      {STATUSES.map((s, i) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={s === status}
          className={`strip-btn${i <= current ? ' done' : ''}${s === status ? ' current' : ''}`}
          onClick={() => onChange(s)}
        >
          <span className="strip-seg" aria-hidden="true" />
          <span className="strip-label">{STATUS_LABELS[s]}</span>
        </button>
      ))}
    </div>
  );
}

export function StatusBadge({ status }: { status: GiftStatus }) {
  return <span className={`badge status-${status}`}>{STATUS_LABELS[status]}</span>;
}
