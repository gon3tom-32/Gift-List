import { countdownText, daysUntilChristmas } from '../lib/christmas';
import { formatCents, leftToSpend, type Totals } from '../lib/money';
import type { Household } from '../lib/types';
import { Icon } from './Icon';
import { Avatar } from './Avatar';
import type { SettingsView } from '../sheets/SettingsSheet';

export function Header({
  household,
  totals,
  openCount,
  peopleCount,
  onSettings,
}: {
  household: Household;
  totals: Totals;
  openCount: number;
  /** Everyone on the list, across all groups. */
  peopleCount: number;
  onSettings: (view: SettingsView) => void;
}) {
  const left = leftToSpend(household.budget || null, totals);
  const days = daysUntilChristmas();
  return (
    <header className="app-header">
      <div className="header-top">
        <button
          type="button"
          className={`header-photo${household.photo_path ? '' : ' empty'}`}
          onClick={() => onSettings('list')}
          aria-label={household.photo_path ? 'Change our photo' : 'Add our photo'}
        >
          {household.photo_path ? (
            <Avatar name={household.name} photoPath={household.photo_path} size={56} />
          ) : (
            <>
              <Icon name="camera" size={20} />
              <span>Photo</span>
            </>
          )}
        </button>
        <div className="header-text">
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
              <br />
              Buying for {peopleCount} {peopleCount === 1 ? 'person' : 'people'}
            </span>
          </p>
        </div>
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
              <button type="button" className="link-btn" onClick={() => onSettings('list')}>
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
