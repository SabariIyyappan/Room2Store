import type { Contact } from "@room2store/contracts";

export interface ContactCheck {
  allowed: boolean;
  reason?: string;
}

/**
 * The fifth compliance rule from plan.md: messaging an opted-out contact.
 * This is a synchronous check C's messaging layer (Linq) calls before every
 * send — not a Band verdict, since it isn't item-shaped and needs to be
 * cheap enough to run per outbound message.
 */
export function canMessageContact(contact: Contact): ContactCheck {
  if (!contact.optedIn) {
    return { allowed: false, reason: `${contact.handle} has not opted in and cannot be messaged.` };
  }
  return { allowed: true };
}
