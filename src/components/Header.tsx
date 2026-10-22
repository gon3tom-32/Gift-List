import { countdownText, daysUntilChristmas } from '../lib/christmas';
import { formatCents, leftToSpend, type Totals } from '../lib/money';
import type { Household } from '../lib/types';
import { Icon } from './Icon';

export function Header({
  household,
  totals,
  openCount,
  onSettings,
}: {
  household: Household;
  totals: Totals;
  openCount: number;
  onSettings: () => void;
}) {
  const left = leftToSpend(household.budget || null, totals);
  const days = daysUntilChristmas();
  return (
    <header className="app-header">
      <div className="header-top">
        <div>
          <h1 className="display title">{household.name}</h1>
          <p className="countdown">
            <span className="countdown-days" aria-hidden="true">
              {days}
            </span>
            <span>
              {countdownText()}
              <br />
              <strong>
                {openCount === 0 ? 'Every gift is sorted!' : `${openCount} gift${openCount === 1 ? '' : 's'} still open`}
              </strong>
            </span>
          </p>
        </div>
        <button type="button" className="icon-btn on-dark" onClick={onSettings} aria-label="List settings and partner">
          <Icon name="settings" />
        </button>
      </div>

      <dl className="totals">
        <div>
          <dt>Budget</dt>
          <dd>{household.budget ? formatCents(household.budget, { whole: true }) : '—'}</dd>
        </div>
        <div>
          <dt>Spent</dt>
          <dd>{formatCents(totals.spent, { whole: true })}</dd>
        </div>
        <div>
          <dt>Planned</dt>
          <dd>{formatCents(totals.planned, { whole: true })}</dd>
        </div>
        <div className={left !== null && left < 0 ? 'negative' : undefined}>
          <dt>Left</dt>
          <dd>
            {left === null ? (
              <button type="button" className="link-btn" onClick={onSettings}>
                Set budget
              </button>
            ) : (
              formatCents(left, { whole: true })
            )}
          </dd>
        </div>
      </dl>
    </header>
  );
}
