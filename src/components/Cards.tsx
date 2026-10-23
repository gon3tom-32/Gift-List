import { format, parseISO } from 'date-fns';
import { formatCents, splitCents } from '../lib/money';
import { NEXT_ACTION, nextStatus, type GiftStatus } from '../lib/status';
import { memberName, type Gift, type Member, type Person } from '../lib/types';
import { looksLikeUrl } from '../lib/linkPreview';
import { Avatar } from './Avatar';
import { GiftPhoto } from './GiftPhoto';
import { Icon } from './Icon';
import { StatusBadge, StatusStrip } from './StatusStrip';

export function buyerText(g: Gift, members: Member[], me: string): string | null {
  if (g.shared) return 'Both of us';
  if (!g.assigned_to) return null;
  if (g.assigned_to === me) return 'Me';
  return memberName(members.find((m) => m.user_id === g.assigned_to));
}

/** "Joy, Lily +2": the first couple of names, then a count. */
function otherNames(people: Person[]): string {
  const shown = people.slice(0, 2).map((p) => p.name);
  const rest = people.length - shown.length;
  return `${shown.join(', ')}${rest > 0 ? ` +${rest}` : ''}`;
}

/** How a shared gift reads: the split on All gifts, your share on a person's page. */
function sharedText(gift: Gift, recipients: Person[], viewerId?: string): string | null {
  const n = recipients.length;
  if (n < 2) return null;
  const price = gift.paid ?? gift.estimate;
  const shares = price === null ? null : splitCents(price, n);
  if (viewerId) {
    const i = Math.max(0, recipients.findIndex((p) => p.id === viewerId));
    const others = otherNames(recipients.filter((p) => p.id !== viewerId));
    return shares ? `Shared with ${others} · your share ${formatCents(shares[i])}` : `Shared with ${others}`;
  }
  if (!shares) return `Shared by ${n} people`;
  const even = shares.every((s) => s === shares[0]);
  return `Split ${n} ways · ${even ? '' : 'about '}${formatCents(shares[0])} each`;
}

export function GiftCard({
  gift,
  person,
  recipients,
  viewerId,
  members,
  me,
  wiggle,
  isNew,
  onOpen,
  onStatus,
}: {
  gift: Gift;
  person?: Person;
  /** everyone the gift is for, main person first */
  recipients?: Person[];
  /** the person whose page this card is on, to show their share */
  viewerId?: string;
  members: Member[];
  me: string;
  wiggle?: boolean;
  isNew?: boolean;
  onOpen: () => void;
  onStatus: (to: GiftStatus) => void;
}) {
  const price = gift.paid ?? gift.estimate;
  const next = nextStatus(gift.status);
  const buyer = buyerText(gift, members, me);
  const hasLink = Boolean(gift.link && looksLikeUrl(gift.link));
  const sharedLine = sharedText(gift, recipients ?? [], viewerId);
  return (
    <article className={`gift-card${wiggle ? ' wiggle' : ''}${gift.status === 'given' ? ' is-given' : ''}`}>
      <GiftPhoto path={gift.photo_path} alt="" onAdd={gift.photo_path ? undefined : onOpen} />
      <div className="gift-body">
        <div className="gift-top">
          <span className="gift-badges">
            <StatusBadge status={gift.status} />
            {isNew && <span className="badge badge-new">New</span>}
          </span>
          {price !== null && (
            <span className="price">
              {formatCents(price)}
              {gift.paid === null && gift.estimate !== null && <span className="est"> est.</span>}
            </span>
          )}
        </div>
        {person && (
          <p className="gift-for">
            <Avatar name={person.name} photoPath={person.photo_path} size={24} />
            <span>
              For <strong>{person.name}</strong>
              {recipients && recipients.length > 1 && <>, {otherNames(recipients.slice(1))}</>}
            </span>
          </p>
        )}
        <h3 className="gift-name">
          {/* The whole card opens the gift; this button carries the name for screen readers. */}
          <button type="button" className="stretched" onClick={onOpen}>
            {gift.name}
          </button>
        </h3>
        {sharedLine && <p className="gift-shared small">{sharedLine}</p>}
        <p className="gift-meta small muted">
          {[
            !hasLink && gift.store,
            buyer && `Buyer: ${buyer}`,
            gift.ship_by && gift.status !== 'given' && `Ship by ${format(parseISO(gift.ship_by), 'MMM d')}`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        <StatusStrip status={gift.status} compact />
        {(next || hasLink) && (
          <div className="gift-actions">
            {next && (
              <button type="button" className="btn tiny next-step" onClick={() => onStatus(next)}>
                <Icon name="check" size={16} /> {NEXT_ACTION[gift.status]}
              </button>
            )}
            {hasLink && (
              <a
                className="btn tiny item-link"
                href={gift.link!}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Open ${gift.name} on ${gift.store ?? 'the shop'} (opens in a new tab)`}
              >
                <Icon name="link" size={16} /> <span>{gift.store ? `View on ${gift.store}` : 'View item'}</span>
              </a>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

export function PersonCard({
  person,
  ideas,
  purchased,
  total,
  onOpen,
}: {
  person: Person;
  ideas: number;
  purchased: number;
  total: number;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className="person-card"
      data-person-id={person.id}
      data-status={ideas > 0 ? (purchased > 0 ? 'mixed' : 'ideas') : purchased > 0 ? 'purchased' : 'empty'}
      onClick={onOpen}
    >
      <Avatar name={person.name} photoPath={person.photo_path} size={56} />
      <span className="person-name">{person.name}</span>
      <span className="person-badges">
        {ideas > 0 && <span className="badge status-idea">{`${ideas} idea${ideas === 1 ? '' : 's'}`}</span>}
        {purchased > 0 && <span className="badge status-given">{`${purchased} purchased`}</span>}
        {ideas === 0 && purchased === 0 && <span className="badge status-none">Nothing yet</span>}
      </span>
      {total > 0 && <span className="small person-total">{formatCents(total, { whole: true })}</span>}
      {person.budget !== null && total > person.budget && <span className="small over">Over budget</span>}
    </button>
  );
}
