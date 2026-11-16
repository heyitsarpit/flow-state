import { Option } from "effect";
import type { Evidence } from "../../src/host/inspect.ts";
import { nameOf } from "./deliveries.ts";
import type { Rule } from "./rules.ts";

// The open an Attempt was minted in: its id up to its counter. An ending owed in an earlier open
// reaches a later one only through what that open saved, which the ledger's own rules judge.
const openOf = (attempt: string) => attempt.slice(0, attempt.lastIndexOf("-"));

// The Attempt whose ending leaves its queue unheard: one recorded as evidence, or one refused,
// which is redelivered after the mail already queued.
const leaving = (e: Evidence) => {
  if (e._tag === "Recorded") return e.attempt;

  if (e._tag === "Issue") return Option.flatMap(e.ending, (ending) => ending.attempt);

  return Option.none<string>();
};

/**
 * Actors I19, over every run: within one actor, endings are delivered in the order they were
 * owed. An Attempt's ending joins its actor's queue when it is owed (its Ended), and each delivery
 * must be of the oldest Attempt of its open still waiting there.
 *
 * **Gotchas**
 *
 * - A refused ending is redelivered after the mail already queued (Actors R15), and an ending
 *   recorded as evidence is never delivered: both leave the queue, so they are not judged.
 * - An ending with no Attempt (a laneless decline) has no key to follow and is not judged.
 */
export const mailboxOrder: Rule = {
  rule: "Actors I19",
  breaches: (run) => {
    const waiting = new Map<string, ReadonlyArray<string>>();

    const remove = (attempt: string) => {
      for (const [who, queue] of waiting)
        waiting.set(
          who,
          queue.filter((a) => a !== attempt),
        );
    };

    // Whose each Attempt's ending is: a parked ending leaves its queue and joins it again, last,
    // when its start unparks it.
    const owner = new Map<string, string>();

    return run.evidence.flatMap((e, at) => {
      Option.match(leaving(e), { onNone: () => undefined, onSome: remove });

      if (e._tag === "Parked") Option.match(e.attempt, { onNone: () => undefined, onSome: remove });

      if (e._tag === "Unparked")
        Option.match(e.attempt, {
          onNone: () => undefined,
          onSome: (attempt) => {
            const who = owner.get(attempt);

            if (who !== undefined) waiting.set(who, [...(waiting.get(who) ?? []), attempt]);
          },
        });

      if (e._tag === "Ended")
        Option.match(e.attempt, {
          onNone: () => undefined,
          onSome: (attempt) => void owner.set(attempt, nameOf(e.actor)),
        });

      if (e._tag === "Ended")
        Option.match(e.attempt, {
          onNone: () => undefined,
          onSome: (attempt) => {
            const queue = waiting.get(nameOf(e.actor)) ?? [];

            if (!queue.includes(attempt)) waiting.set(nameOf(e.actor), [...queue, attempt]);
          },
        });

      if (e._tag !== "Delivered" || Option.isNone(e.attempt)) return [];

      const who = nameOf(e.actor);
      const delivered = e.attempt.value;
      const [oldest] = (waiting.get(who) ?? []).filter((a) => openOf(a) === openOf(delivered));
      const queued = (waiting.get(who) ?? []).includes(delivered);
      remove(delivered);

      return oldest === undefined || oldest === delivered || !queued
        ? []
        : [`Actors I19: ${who} heard ${delivered} before ${oldest}, owed earlier (evidence ${at})`];
    });
  },
};
