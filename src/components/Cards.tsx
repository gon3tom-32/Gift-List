import { format, parseISO } from 'date-fns';
import { formatCents } from '../lib/money';
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

export function GiftCard({
  gift,
  person,
  members,
  me,
  wiggle,
  onOpen,
  onStatus,
}: {
  gift: Gift;
  person?: Person;
  members: Member[];
  me: string;
  wiggle?: boolean;
  onOpen: () => void;
  onStatus: (to: GiftStatus) => void;
}) {
  const price = gift.paid ?? gift.estimate;
  const next = nextStatus(gift.status);
  const buyer = buyerText(gift, members, me);
  const hasLink = Boolean(gift.link && looksLikeUrl(gift.link));
  return (
    <article className={`gift-card${wiggle ? ' wiggle' : ''}${gift.status === 'given' ? ' is-given' : ''}`}>
      <GiftPhoto path={gift.photo_path} alt="" onAdd={gift.photo_path ? undefined : onOpen} />
      <div className="gift-body">
        <div className="gift-top">
          <StatusBadge status={gift.status} />
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
            </span>
          </p>
        )}
        <h3 className="gift-name">
          {/* The whole card opens the gift; this button carries the name for screen readers. */}
          <button type="button" className="stretched" onClick={onOpen}>
            {gift.name}
          </button>
        </h3>
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
    <button type="button" className="person-card" data-person-id={person.id} onClick={onOpen}>
      <Avatar name={person.name} photoPath={person.photo_path} size={52} />
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
