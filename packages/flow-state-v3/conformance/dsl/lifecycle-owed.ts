import { Option } from "effect";
import type { Reference, Row, RowMember, Rows } from "../fixtures/reference.ts";
import { type ActorRef, type Member, MemberTarget, sameJson, type Turn } from "../port.ts";
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

const confirmed = (turn: Turn, member: RowMember) =>
  turn.members.find((r) => r.operation === member.operation && r.kind === member.kind);

const reportedKey = (turn: Turn, member: RowMember) => {
  const keys = turn.members.flatMap((r) =>
    r.operation === member.operation && r.kind === member.kind && MemberTarget.$is("Key")(r.target)
      ? [r.target.key]
      : [],
  );

  const [key] = keys;

  return Option.filter(Option.fromUndefinedOr(key), (k) =>
    keys.every((other) => sameJson(other, k)),
  );
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
  turn: Turn,
  hearing: Option.Option<EndingName>,
  member: RowMember,
) => {
  const keyed = Option.exists(
    operationOf(known, turn.actor, member.operation),
    (o) => o.keyFields.length > 0,
  );

  if (!keyed) return MemberTarget.Only();

  const said = reportedKey(turn, member);

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
  turn: Turn,
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
  turn: Turn,
  hearing: Option.Option<EndingName>,
  sends: (attempt: string) => number,
) => {
  const taken = (known.rows[turn.actor.machine] ?? []).filter(
    (row) =>
      row.event === turn.event &&
      fromMatches(row, turn.from, turn.to) &&
      (!row.claimed || row.members.every((m) => confirmed(turn, m) !== undefined)) &&
      guardHolds(model, row, turn.actor, resolved(model, known, turn, hearing, row), sends),
  );

  return Option.fromUndefinedOr(
    taken.reduce<Row | undefined>(
      (most, row) => (most === undefined || row.members.length > most.members.length ? row : most),
      undefined,
    ),
  );
};

const releasesOwed = (known: Known, turn: Turn) =>
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
 * only from the reference and the turn's facts; the report can confirm a member and give a key,
 * never retarget, remove or unclaim one (STATUS, "Member resolution").
 *
 * **When to use**
 *
 * The step calls it once per reported `Turn`, after the turn has heard its ending, and opens the
 * turn with what it returns.
 *
 * **Details**
 *
 * - The row: event, from, to and the computed guard match; a `claimed` row also needs the report
 *   to name each of its members (by operation and kind; order and other members are not read).
 *   Rows that tie with other members are claimed rows: the one with the most members is taken
 *   (the first of equals), so a report's other members never choose. No row: no lane member is
 *   owed (releases still are).
 * - A reported `Key` counts only when every reported copy of that member names the same key.
 * - A member's target: `Only` on an unkeyed operation. A commit's is its reported `Key` (its
 *   input's key), else `Nothing` (the key-less lane). A `keyed` retry, cancel or cancelAll's is its
 *   reported `Key` when that names a lane the model holds for the actor and operation, else
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
 * - Stated limits: a claimed row is owed only when its members are reported (v2 Risk 2); a
 *   commit's key, and a keyed member's key between two lanes the actor holds, are the runtime's
 *   claim (a mint elsewhere is WriteLanes I1, and its send's input is checked against the mint
 *   by `attempt-identity`); a turn hearing a read's ending is seen as hearing none.
 * - A key-less member on a keyed operation outside its own ending is KeyRequired by WriteLanes
 *   R9; the targets above follow round-14 until the user answers that question.
 */
// RETURN_TYPE: the Table B members a turn opens with, whatever the rows' operation names.
export const owedMembers = (
  model: Model,
  known: Known,
  turn: Turn,
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
