import { Option } from "effect";
import type { Reference, Row, RowMember, Rows } from "../fixtures/reference.ts";
import { type ActorRef, type Json, type Member, MemberTarget, sameJson } from "../port.ts";
import {
  addressable,
  type EndingName,
  lanesOf,
  lanesOfOperation,
  type LaneMember,
  type Model,
  sameLane,
} from "./lifecycle-model.ts";

/**
 * What the step reads besides the facts: the case's operation references and its rows.
 */
export type Known = { readonly reference: Reference; readonly rows: Rows };

/**
 * The reference of `actor`'s operation, if its machine declares that write.
 */
export const operationOf = (known: Known, actor: ActorRef, operation: string) =>
  Option.fromUndefinedOr(known.reference[actor.machine]?.[operation]);

/**
 * One turn as the suite predicts it (Conformance R20): its actor and event, the leaf it runs from
 * and the leaf it ends at, the alternative that ran when the table names it, and each operation's
 * key from the fixture's folds (`fixtures/folds.ts`).
 *
 * **Gotchas**
 *
 * - Where a fixture folds no key, or the actor's folded fields are unknown (after a kill with turns
 *   no capture holds), `keys` takes the turn's reported key: a stated limit (`limits.ts`).
 */
export type Predicted = {
  readonly actor: ActorRef;
  readonly event: string;
  readonly from: string;
  readonly to: string;
  readonly at: Option.Option<string>;
  readonly keys: Readonly<Record<string, Json>>;
};

const heardLane = (model: Model, hearing: EndingName) =>
  Option.flatMap(hearing.attempt, (id) =>
    Option.flatMap(
      Option.fromUndefinedOr(model.attempts.find((a) => a.id === id)),
      (a) => a.lane.key,
    ),
  );

const keylessTarget = (model: Model, hearing: Option.Option<EndingName>, member: RowMember) =>
  Option.match(hearing, {
    onNone: () => (member.kind === "retry" ? MemberTarget.Nothing() : MemberTarget.Every()),
    onSome: (h) =>
      Option.match(h.operation === member.operation ? heardLane(model, h) : Option.none(), {
        onNone: () => MemberTarget.Nothing(),
        onSome: (key) => MemberTarget.Key({ key }),
      }),
  });

const targetOf = (
  model: Model,
  known: Known,
  turn: Predicted,
  hearing: Option.Option<EndingName>,
  member: RowMember,
) => {
  const keyed = Option.exists(
    operationOf(known, turn.actor, member.operation),
    (o) => o.keyFields.length > 0,
  );

  if (!keyed) return MemberTarget.Only();

  const said = Option.fromUndefinedOr(turn.keys[member.operation]);

  if (member.kind === "commit")
    return Option.match(said, {
      onNone: () => MemberTarget.Nothing(),
      onSome: (key) => MemberTarget.Key({ key }),
    });

  if (!member.keyed) return keylessTarget(model, hearing, member);

  const held = Option.filter(said, (key) =>
    lanesOfOperation(model, turn.actor, member.operation).some((l) =>
      Option.exists(l.key, (k) => sameJson(k, key)),
    ),
  );

  return Option.match(held, {
    onNone: () => MemberTarget.Every(),
    onSome: (key) => MemberTarget.Key({ key }),
  });
};

const resolved = (
  model: Model,
  known: Known,
  turn: Predicted,
  hearing: Option.Option<EndingName>,
  row: Row,
) =>
  row.members.map((m) => ({
    operation: m.operation,
    kind: m.kind,
    target: targetOf(model, known, turn, hearing, m),
  }));

const guardHolds = (
  model: Model,
  row: Row,
  actor: ActorRef,
  owed: ReadonlyArray<Member>,
  sends: (attempt: string) => number,
) =>
  Option.match(row.guard, {
    onNone: () => true,
    onSome: (guard) => {
      const named = owed
        .filter((m) => m.operation === guard.operation)
        .flatMap((m) => lanesOf(model, actor, m));

      const passes = named.some((lane) =>
        Option.exists(
          Option.fromUndefinedOr(
            model.attempts.find((a) => sameLane(a.lane, lane) && addressable(a.phase)),
          ),
          (h) => h.phase._tag === "Held" && sends(h.id) - 1 < guard.times,
        ),
      );

      return passes === guard.passes;
    },
  });

const fromMatches = (row: Row, from: string, to: string) =>
  (row.from === "any" || row.from === from) && (row.to === "same" ? to === from : row.to === to);

const chosenRow = (
  model: Model,
  known: Known,
  turn: Predicted,
  hearing: Option.Option<EndingName>,
  sends: (attempt: string) => number,
) => {
  const taken = (known.rows[turn.actor.machine] ?? []).filter(
    (row) =>
      row.event === turn.event &&
      fromMatches(row, turn.from, turn.to) &&
      (!row.claimed || Option.exists(row.at, (at) => Option.contains(turn.at, at))) &&
      guardHolds(model, row, turn.actor, resolved(model, known, turn, hearing, row), sends),
  );

  return Option.fromUndefinedOr(
    taken.reduce<Row | undefined>(
      (most, row) => (most === undefined || row.members.length > most.members.length ? row : most),
      undefined,
    ),
  );
};

const releasesOwed = (known: Known, turn: Predicted) =>
  Object.entries(known.reference[turn.actor.machine] ?? {})
    .filter(([, o]) =>
      o.releasesOnLeave.some(
        (t) => t.event === turn.event && t.from === turn.from && t.to === turn.to,
      ),
    )
    .map(([operation, o]) => ({
      operation,
      kind: "release" as const,
      target: o.keyFields.length > 0 ? MemberTarget.Every() : MemberTarget.Only(),
    }));

/**
 * The lane members a turn owes, in order: its row's members, then its releases on leave. They come
 * only from the reference and the predicted turn ({@link Predicted}): no report is read here
 * (Conformance R20).
 *
 * **When to use**
 *
 * The step calls it once per predicted turn, after the turn has heard its ending, and opens the
 * turn with what it returns.
 *
 * **Details**
 *
 * - The row: event, from, to and the computed guard match; a `claimed` row also needs the turn's
 *   alternative to be the one it names (`at`). Rows that tie with other members are claimed rows:
 *   the one with the most members is taken (the first of equals). No row: no lane member is owed
 *   (releases still are).
 * - A member's target: `Only` on an unkeyed operation. A commit's is its operation's `Key` in
 *   the predicted turn, else `Nothing` (the key-less lane). A `keyed` retry, cancel or cancelAll's
 *   is that `Key` when it names a lane the model holds for the actor and operation, else
 *   `Every`. A key-less one's comes from the heard ending alone (WriteLanes R9, I14): its
 *   Attempt's lane in an ending of its operation, `Nothing` in a decline's or another
 *   operation's ending, and outside an ending `Every` for a cancel or cancelAll and `Nothing`
 *   for a retry.
 * - A `retryable` guard reads the heads of its member's owed lanes: it passes when one is Held and
 *   was sent fewer than `times` + 1 times (`sends`).
 * - A release is owed for each operation whose reference releases on the turn's (event, from,
 *   to) (WriteLanes R16): `Only` on an unkeyed operation, `Every` on a keyed one.
 * - A reported member the turn does not owe anchors nothing, so its effects are refused under
 *   their own Invariants.
 *
 * **Gotchas**
 *
 * - A turn hearing a read's ending is seen as hearing none.
 * - A key-less member on a keyed operation outside its own ending is KeyRequired by WriteLanes
 *   R9; the targets above follow round-14 until the user answers that question.
 */
// RETURN_TYPE: the Table B members a turn opens with, whatever the rows' operation names.
export const owedMembers = (
  model: Model,
  known: Known,
  turn: Predicted,
  hearing: Option.Option<EndingName>,
  sends: (attempt: string) => number,
): ReadonlyArray<LaneMember> => {
  const lane = Option.match(chosenRow(model, known, turn, hearing, sends), {
    onNone: () => [],
    onSome: (row) => resolved(model, known, turn, hearing, row),
  });

  return [...lane, ...releasesOwed(known, turn)].flatMap((m) =>
    Option.toArray(
      Option.map(operationOf(known, turn.actor, m.operation), (o) => ({
        ...m,
        concurrency: o.concurrency,
      })),
    ),
  );
};
