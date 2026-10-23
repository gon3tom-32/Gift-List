import type { GiftInput } from './data';
import type { Gift } from './types';

/** Everything needed to put a deleted gift back exactly as it was. */
export function giftToInput(g: Gift): GiftInput {
  return {
    person_id: g.person_id,
    name: g.name,
    store: g.store,
    link: g.link,
    photo_path: g.photo_path,
    estimate: g.estimate,
    paid: g.paid,
    status: g.status,
    assigned_to: g.assigned_to,
    shared: g.shared,
    ship_by: g.ship_by,
    payment_method: g.payment_method,
  };
}

/**
 * A fresh idea copied from a gift: same name, shop, link and estimate.
 * No picture (two gifts sharing one file would break when either is deleted),
 * and nothing paid or assigned yet.
 */
export function duplicateInput(g: Gift): GiftInput {
  return {
    person_id: g.person_id,
    name: g.name,
    store: g.store,
    link: g.link,
    estimate: g.estimate,
    status: 'idea',
  };
}
