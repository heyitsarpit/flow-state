import { Option } from "effect";
import { type ActorId, actorKey, type ChainId, Mail, type World } from "./world.ts";

/**
 * What the mailboxes need of a step: its draft of the World, the mail map it writes (copied once
 * per step), a replacement of the whole map, the identities the step touched, and the loop guard's
 * chain the item being served follows.
 */
export type MailAccess = {
  readonly world: () => World;
  readonly draft: () => Map<string, ReadonlyArray<Mail>>;
  readonly replace: (mail: Map<string, ReadonlyArray<Mail>>) => void;
  readonly dirty: Set<string>;
  readonly chainNow: () => Option.Option<ChainId>;
};

/**
 * The mailboxes, the only writer of mail: one queue per actor, at most one context update in it,
 * and the front mail of the change being served, which is never held in a queue.
 *
 * **Details**
 *
 * An actor whose mailbox was empty joins the rotation last. `takeFresh` returns the mail enqueued
 * since the drain last asked: a served item's follow-ups.
 */
export const makeMailbox = (access: MailAccess) => {
  const { dirty, chainNow } = access;
  const ownBoxes = new Set<string>();
  let fresh: Array<Mail> = [];
  let frontMail: Array<Mail> = [];

  const box = (key: string) => {
    const mail = access.draft();
    const own = mail.get(key);

    if (own !== undefined && ownBoxes.has(key))
      // SAFETY: a mailbox this step copied is its own array; the World only reads it.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the step owns the copy it made
      return own as Array<Mail>;

    const copy = [...(own ?? [])];
    mail.set(key, copy);
    ownBoxes.add(key);
    dirty.add(key);

    return copy;
  };

  const enqueue = (mail: Mail) => {
    const key = actorKey(mail.actor);
    fresh.push(mail);
    box(key).push(mail);
    dirty.add(key);
  };

  // A context update owed to an actor: one waits per actor. A second wave reaching the one that
  // waits keeps its place, and the update follows whichever of the two chains has counted more, so
  // joining never lowers the count its turns' sends add to.
  const owe = (actor: ActorId) => {
    const key = actorKey(actor);
    const at = (access.world().mail.get(key) ?? []).findIndex(Mail.$is("Context"));
    const next = chainNow();

    if (at === -1) {
      enqueue(Mail.Context({ actor, chain: next }));

      return;
    }

    const sent = (id: Option.Option<ChainId>) =>
      Option.match(id, { onNone: () => 0, onSome: (c) => access.world().chains.get(c)?.sent ?? 0 });

    const waiting = access.world().mail.get(key)?.[at];

    if (waiting !== undefined && Mail.$is("Context")(waiting) && sent(next) > sent(waiting.chain))
      box(key)[at] = Mail.Context({ actor, chain: next });
  };

  // The reaction events of an `Inputs` change: served with the change, in the same call, before
  // any other mail of the actor; never held in its mailbox.
  const front = (mails: ReadonlyArray<Mail>) => void frontMail.push(...mails);

  const takeFront = () => {
    const taken = frontMail;
    frontMail = [];

    return taken;
  };

  const emptied = (key: string) => {
    access.draft().delete(key);
    ownBoxes.delete(key);
    dirty.add(key);
  };

  // An actor's oldest mail, read without taking it.
  const peek = (key: string) => Option.fromUndefinedOr(access.world().mail.get(key)?.[0]);

  // An actor that keeps its mail goes to the back of the rotation.
  const rotate = (key: string) => {
    const mailbox = access.world().mail.get(key);

    if (mailbox === undefined) return;
    access.draft().delete(key);
    access.draft().set(key, mailbox);
  };

  // An actor's oldest mail, taken from its mailbox; a rotated actor goes to the back while it
  // still has mail, a follow-up's actor keeps its place.
  const takeOldest = (key: string, place: "rotate" | "keep") => {
    if (!access.world().mail.has(key)) return undefined;

    const mailbox = box(key);
    const first = mailbox.shift();

    if (mailbox.length === 0) emptied(key);
    else if (place === "rotate") rotate(key);

    return first;
  };

  const unreference = (actor: ActorId, id: string) => {
    const key = actorKey(actor);
    const held = access.world().mail.get(key);

    if (held === undefined || !held.some((m) => Mail.$is("Ending")(m) && m.id === id)) return;

    const left = box(key).filter((m) => !(Mail.$is("Ending")(m) && m.id === id));

    if (left.length === 0) emptied(key);
    else {
      access.draft().set(key, left);
      dirty.add(key);
    }
  };

  const clearMail = () => {
    for (const key of access.world().mail.keys()) dirty.add(key);
    access.replace(new Map());
    ownBoxes.clear();
  };

  // An actor's mailbox removed with its references; returns the mail it held.
  const dropMail = (actor: ActorId) => {
    const held = access.world().mail.get(actorKey(actor)) ?? [];

    if (held.length > 0) emptied(actorKey(actor));

    return held;
  };

  const takeFresh = () => {
    const taken = fresh;
    fresh = [];

    return taken;
  };

  return {
    enqueue,
    owe,
    front,
    takeFront,
    peek,
    rotate,
    takeOldest,
    unreference,
    clearMail,
    dropMail,
    takeFresh,
    hasMail: (actor: ActorId) => access.world().mail.has(actorKey(actor)),
  };
};
