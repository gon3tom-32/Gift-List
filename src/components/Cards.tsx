import { format, parseISO } from 'date-fns';
import { formatCents } from '../lib/money';
import { NEXT_ACTION, nextStatus, type GiftStatus } from '../lib/status';
import { memberName, type Gift, type Member, type Person } from '../lib/types';
import { looksLikeUrl } from '../lib/linkPreview';
import { hatFor, type Hat } from '../lib/hats';
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

function HatArt({ hat }: { hat: Hat }) {
  switch (hat) {
    case 'santa':
      return (
        <svg className="hat" width="70" height="44" viewBox="0 0 80 50" aria-hidden="true" focusable="false">
          <path d="M10 40Q14 8 48 6Q60 6 66 24L70 40Z" fill="#c62d3b" />
          <rect x="4" y="34" width="72" height="13" rx="6.5" fill="#fff" stroke="#c9d3e3" />
          <circle cx="62" cy="9" r="7" fill="#fff" stroke="#c9d3e3" />
        </svg>
      );
    case 'snowman':
      return (
        <svg className="hat" width="70" height="44" viewBox="0 0 80 50" aria-hidden="true" focusable="false">
          <rect x="20" y="6" width="40" height="34" rx="3" fill="#1d2433" />
          <rect x="20" y="26" width="40" height="8" fill="#c62d3b" />
          <ellipse cx="40" cy="41" rx="34" ry="6" fill="#1d2433" />
        </svg>
      );
    case 'antlers':
      return (
        <svg className="hat" width="84" height="46" viewBox="0 0 96 52" fill="none" stroke="#7a4b21" strokeWidth="5" strokeLinecap="round" aria-hidden="true" focusable="false">
          <path d="M26 48C22 34 18 24 10 10M19 29C12 29 7 25 4 20M22 39C16 39 11 36 8 33" />
          <path d="M70 48C74 34 78 24 86 10M77 29C84 29 89 25 92 20M74 39C80 39 85 36 88 33" />
        </svg>
      );
    case 'elf':
      return (
        <svg className="hat" width="70" height="44" viewBox="0 0 80 50" aria-hidden="true" focusable="false">
          <path d="M10 40L58 6Q66 18 70 40Z" fill="#2f8f5b" />
          <rect x="6" y="35" width="68" height="11" rx="5.5" fill="#c62d3b" />
          <circle cx="58" cy="6" r="5" fill="#f5b301" />
        </svg>
      );
  }
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
      <span className="avatar-hat">
        <Avatar name={person.name} photoPath={person.photo_path} size={56} />
        <HatArt hat={hatFor(person.id)} />
      </span>
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
