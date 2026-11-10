import { Option } from "effect";
import { type LaneId, laneOf, sameLane } from "../dsl/domain.ts";
import { operationNamed, type OperationReference, type Reference } from "../fixtures/reference.ts";
import { type ActorRef, type Channel, type Minted, sameActor } from "../port.ts";
import type { Request } from "../world/network.ts";

/**
 * Whether a later commit of an Attempt's lane replaced it: not at all, surely (same lane), or
 * maybe (a lane not known yet).
 */
export type Replacement = "none" | "maybe" | "sure";

/**
 * One minted Attempt as the delivered-once oracle tracks it: its committer, its operation's
 * reference, its lane once known, whether it was sent, the channel it was decided on, and whether
 * a later commit replaced it.
 */
export type Written = {
  readonly id: string;
  readonly owner: Option.Option<ActorRef>;
  readonly operation: string;
  readonly policy: Option.Option<OperationReference>;
  readonly lane: Option.Option<LaneId>;
  readonly sent: boolean;
  readonly decided: Option.Option<Channel>;
  readonly replaced: Replacement;
};

/**
 * The reference of an operation of `owner`'s machine, or of the one machine that has it when the
 * owner is unknown.
 */
export const policyOf = (reference: Reference, owner: Option.Option<ActorRef>, operation: string) =>
  Option.match(owner, {
    onNone: () => operationNamed(reference, operation),
    onSome: (o) => Option.fromUndefinedOr(reference[o.machine]?.[operation]),
  });

const replacement = (earlier: Written, lane: Option.Option<LaneId>) => {
  const replaces = Option.match(earlier.policy, {
    onNone: () => false,
    onSome: (p) => p.concurrency === "cancel" || (p.concurrency === "latest" && !earlier.sent),
  });

  if (!replaces || Option.isSome(earlier.decided)) return earlier.replaced;

  return Option.match(Option.all([earlier.lane, lane]), {
    onNone: () => (earlier.replaced === "sure" ? "sure" : "maybe"),
    onSome: ([a, b]) => (sameLane(a, b) ? "sure" : earlier.replaced),
  });
};

/**
 * The Attempts after a `Minted`: each earlier one of the same actor and operation marked as
 * replaced where its policy says the new commit replaces or interrupts it, then the new one.
 *
 * **Details**
 *
 * The new Attempt's lane is known at mint when its operation has no key fields or `Minted` reports
 * its key; otherwise {@link sentIn} names it from its first request.
 */
export const mintedInto = (written: ReadonlyArray<Written>, reference: Reference, m: Minted) => {
  const policy = policyOf(reference, m.actor, m.operation);

  const lane = Option.flatMap(Option.all([m.actor, policy]), ([owner, p]) =>
    p.keyFields.length === 0
      ? Option.some(laneOf(owner, reference, m.operation, {}))
      : Option.map(m.key, (k) => laneOf(owner, reference, m.operation, k)),
  );

  const before = written.map((w) =>
    w.operation === m.operation &&
    Option.exists(Option.all([w.owner, m.actor]), ([a, b]) => sameActor(a, b))
      ? { ...w, replaced: replacement(w, lane) }
      : w,
  );

  const fresh: Written = {
    id: m.attempt,
    owner: m.actor,
    operation: m.operation,
    policy,
    lane,
    sent: false,
    decided: Option.none(),
    replaced: "none",
  };

  return [...before, fresh];
};

/**
 * The Attempts after a `Sent` of `id`: it is sent, and its lane is named from its request's input
 * in the server's log when it was not known at mint.
 */
export const sentIn = (
  written: ReadonlyArray<Written>,
  reference: Reference,
  requests: ReadonlyArray<Request>,
  id: string,
) =>
  written.map((w) => {
    if (w.id !== id) return w;

    const request = requests.find((r) => r.operation === w.operation && Option.contains(r.key, id));

    const lane = Option.orElse(w.lane, () =>
      Option.flatMap(Option.all([w.owner, Option.fromUndefinedOr(request)]), ([owner, r]) =>
        Option.some(laneOf(owner, reference, w.operation, r.input)),
      ),
    );

    return { ...w, sent: true, lane };
  });
