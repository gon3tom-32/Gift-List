import { formatCents, leftToSpend, type Cents, type Totals } from '../lib/money';

/** A thin bar: spent (solid) + planned (striped) against a budget. */
export function BudgetBar({ budget, totals, label }: { budget: Cents | null; totals: Totals; label: string }) {
  const left = leftToSpend(budget, totals);
  if (budget === null || budget === 0) {
    const used = totals.spent + totals.planned;
    return used > 0 ? (
      <p className="budget-line muted small">
        {formatCents(totals.spent, { whole: true })} spent · {formatCents(totals.planned, { whole: true })} planned
      </p>
    ) : null;
  }
  const spentPct = Math.min(100, (totals.spent / budget) * 100);
  const plannedPct = Math.min(100 - spentPct, (totals.planned / budget) * 100);
  const over = left !== null && left < 0;
  return (
    <div className="budget">
      <div
        className="budget-bar"
        role="meter"
        aria-label={`${label} budget used`}
        aria-valuemin={0}
        aria-valuemax={budget}
        aria-valuenow={Math.min(budget, totals.spent + totals.planned)}
        aria-valuetext={`${formatCents(totals.spent + totals.planned)} of ${formatCents(budget)}`}
      >
        <span className="spent" style={{ width: `${spentPct}%` }} />
        <span className="planned" style={{ width: `${plannedPct}%` }} />
      </div>
      <p className={`budget-line small${over ? ' over' : ' muted'}`}>
        {over
          ? `${formatCents(-left!, { whole: true })} over ${formatCents(budget, { whole: true })}`
          : `${formatCents(left!, { whole: true })} left of ${formatCents(budget, { whole: true })}`}
      </p>
    </div>
  );
}
