import { Option } from "effect";
import { Evidence, type EvidenceOf } from "../../src/host/inspect.ts";

type Who = { readonly machine: string; readonly name: string };

/**
 * One owed ending of an Attempt as the evidence shows it; `known` is false for a row the evidence
 * never showed being owed.
 */
export type Ending = {
  readonly attempt: string;
  readonly channel: string;
  readonly reason: string;
  readonly at: number;
  readonly known: boolean;
};

type Source = "queued" | "redelivery" | "kept" | "nothing";

/**
 * One delivery of an Attempt's ending, matched to the owed ending it delivered and to where that
 * ending stood: queued, owed once more after a refusal, a kept row's try, or nothing.
 */
export type Delivery = {
  readonly at: number;
  readonly actor: string;
  readonly operation: string;
  readonly ending: Ending;
  readonly from: Source;
};

type Rows = {
  queued: Array<Ending>;
  waiting: Array<Ending>;
  retrying: Array<Ending>;
  kept: Array<Ending>;
  tries: Array<Ending>;
};

type Ledger = {
  readonly evidence: ReadonlyArray<Evidence>;
  readonly rows: Map<string, Rows>;
  readonly owners: Map<string, string>;
  readonly delivered: Array<Delivery>;
  readonly recordedUnowed: Array<{ readonly at: number; readonly attempt: string }>;
};

type IssueCode = EvidenceOf<"Issue">["code"];

export const REFUSALS: ReadonlySet<IssueCode> = new Set<IssueCode>([
  "Defect",
  "InvalidTurn",
  "GuardDefect",
]);

export const CHANNELS: ReadonlySet<string> = new Set(["success", "failure", "notSent", "unknown"]);

export const nameOf = (who: Who) => `${who.machine}/${who.name}`;

export const textOf = (attempt: Option.Option<string>) => Option.getOrElse(attempt, () => "");

/**
 * A context or onContext defect, raised by a context update and published by its consumer.
 */
export const isContextIssue = (e: Evidence) =>
  e._tag === "Issue" &&
  Option.exists(e.slot, (slot) => slot.startsWith("context.") || slot.startsWith("onContext."));

// A refused turn names the callback slot it refused at; a call's Defect names none.
export const isRefusal = (e: Evidence) =>
  e._tag === "Issue" && REFUSALS.has(e.code) && (e.code !== "Defect" || Option.isSome(e.slot));

export const isOutcome = (e: Evidence) =>
  e._tag === "Turn" || e._tag === "Unhandled" || e._tag === "Denied" || isRefusal(e);

export const isTurnStart = (e: Evidence) =>
  isOutcome(e) ||
  e._tag === "Delivered" ||
  e._tag === "Incarnated" ||
  e._tag === "Finished" ||
  e._tag === "RuntimeDisposed";

const take = (list: Array<Ending>, last: boolean) =>
  Option.fromUndefinedOr(last ? list.pop() : list.shift());

const remove = (list: Array<Ending>, ending: Ending) => {
  const at = list.indexOf(ending);

  if (at >= 0) list.splice(at, 1);
};

const firstOf = (...lists: ReadonlyArray<Array<Ending>>) =>
  Option.firstSomeOf(lists.map((list) => take(list, false)));

// RETURN_TYPE: the Ending contract every row holds.
const unlabelled = (attempt: string, at: number): Ending => ({
  attempt,
  channel: "",
  reason: "",
  at,
  known: false,
});

// The turn a delivery started was refused: the first turn outcome after it is a refusal.
const refusedAfter = (evidence: ReadonlyArray<Evidence>, at: number) => {
  for (let i = at + 1; i < evidence.length; i += 1) {
    const e = evidence[i];

    if (e !== undefined && isOutcome(e)) return isRefusal(e);
  }

  return false;
};

const rowsOf = (ledger: Ledger, attempt: string) => {
  const known = ledger.rows.get(attempt);

  if (known !== undefined) return known;
  const fresh: Rows = { queued: [], waiting: [], retrying: [], kept: [], tries: [] };
  ledger.rows.set(attempt, fresh);

  return fresh;
};

// The record before `at` owed this Attempt's ending, so a move that follows acts on that row.
const justOwed = (ledger: Ledger, at: number, attempt: string) => {
  const before = ledger.evidence[at - 1];

  return before?._tag === "Ended" && Option.contains(before.attempt, attempt);
};

const owed = (ledger: Ledger, e: EvidenceOf<"Ended">, at: number) =>
  Option.match(e.attempt, {
    onNone: () => undefined,
    onSome: (attempt) => {
      ledger.owners.set(attempt, nameOf(e.actor));
      rowsOf(ledger, attempt).queued.push({
        attempt,
        channel: e.channel,
        reason: e.reason,
        at,
        known: true,
      });
    },
  });

const parked = (ledger: Ledger, attempt: string, at: number) => {
  const r = rowsOf(ledger, attempt);

  Option.match(
    Option.orElse(take(r.queued, justOwed(ledger, at, attempt)), () => take(r.retrying, false)),
    { onNone: () => undefined, onSome: (row) => void r.waiting.push(row) },
  );
};

const unparked = (ledger: Ledger, attempt: string, at: number) => {
  const r = rowsOf(ledger, attempt);
  r.queued.push(Option.getOrElse(take(r.waiting, false), () => unlabelled(attempt, at)));
};

const recorded = (ledger: Ledger, attempt: string, at: number) => {
  const r = rowsOf(ledger, attempt);

  const closed = Option.orElse(take(r.queued, justOwed(ledger, at, attempt)), () =>
    firstOf(r.waiting, r.kept, r.retrying),
  );

  Option.match(closed, {
    onNone: () => void ledger.recordedUnowed.push({ at, attempt }),
    onSome: (row) => remove(r.tries, row),
  });
};

// A start: the dead tab's or ended incarnation's queued rows are gone, except unknown Restored,
// which is saved and waits; each kept row gets one try.
const started = (ledger: Ledger, actor: string) => {
  for (const [attempt, owner] of ledger.owners)
    if (owner === actor) {
      const r = rowsOf(ledger, attempt);
      r.waiting.push(...r.queued.filter((q) => q.channel === "unknown" && q.reason === "Restored"));
      r.queued = [];
      r.retrying = [];
      r.tries = [...r.kept];
    }
};

const delivered = (ledger: Ledger, e: EvidenceOf<"Delivered">, at: number) => {
  const attempt = textOf(e.attempt);
  const r = rowsOf(ledger, attempt);

  const drawn = Option.firstSomeOf([
    Option.map(take(r.queued, false), (ending) => ({ ending, from: "queued" as const })),
    Option.map(take(r.retrying, false), (ending) => ({ ending, from: "redelivery" as const })),
    Option.map(take(r.tries, false), (ending) => ({ ending, from: "kept" as const })),
  ]);

  const { ending, from } = Option.getOrElse(drawn, () => ({
    ending: unlabelled(attempt, at),
    from: "nothing" as const,
  }));

  const refused = refusedAfter(ledger.evidence, at);

  if (refused && from === "queued") r.retrying.push(ending);
  else if (refused && from === "redelivery") r.kept.push(ending);
  else if (!refused && from === "kept") remove(r.kept, ending);
  ledger.delivered.push({ at, actor: nameOf(e.actor), operation: e.operation, ending, from });
};

// A move of a row that names an Attempt; a lookup's ending names none and is not followed.
const named =
  (move: (ledger: Ledger, attempt: string, at: number) => void) =>
  (ledger: Ledger, attempt: Option.Option<string>, at: number) =>
    Option.match(attempt, { onNone: () => undefined, onSome: (a) => move(ledger, a, at) });

const nothing = () => undefined;

const follow = (ledger: Ledger, e: Evidence, at: number) =>
  Evidence.$match(e, {
    Ended: (ended) => owed(ledger, ended, at),
    Incarnated: ({ actor }) => started(ledger, nameOf(actor)),
    Delivered: (d) => (Option.isSome(d.attempt) ? delivered(ledger, d, at) : undefined),
    Parked: ({ attempt }) => named(parked)(ledger, attempt, at),
    Unparked: ({ attempt }) => named(unparked)(ledger, attempt, at),
    Recorded: ({ attempt }) => named(recorded)(ledger, attempt, at),
    Denied: nothing,
    Finished: nothing,
    Issue: nothing,
    Lane: nothing,
    Minted: nothing,
    Published: nothing,
    Reported: nothing,
    RuntimeDisposed: nothing,
    Sent: nothing,
    Turn: nothing,
    Unhandled: nothing,
    SendTargetAbsent: nothing,
    HoldForgotten: nothing,
    SlowWork: nothing,
  });

/**
 * Every delivery of an Attempt's ending in a run, each matched to the owed ending it delivered,
 * read from the evidence alone by following the ledger's rows: an ending is owed (Ended), parked
 * (Parked) and queued again at its identity's start (Unparked), or recorded (Recorded); a refused
 * delivery is owed once more after queued mail, a second refusal keeps it, and a kept ending gets
 * one try at each start. A delivery no row accounts for comes `from: "nothing"`, and a Recorded
 * record no row accounts for is in `recordedUnowed`.
 *
 * **Gotchas**
 *
 * - A tab's death leaves no evidence: a new incarnation of an identity drops the rows the dead
 *   tab queued, except unknown Restored, which is saved and waits for the start.
 * - A lookup's ending has no Attempt and is not followed.
 */
export const deliveries = (evidence: ReadonlyArray<Evidence>) => {
  const ledger: Ledger = {
    evidence,
    rows: new Map(),
    owners: new Map(),
    delivered: [],
    recordedUnowed: [],
  };

  for (const [at, e] of evidence.entries()) follow(ledger, e, at);

  return { delivered: ledger.delivered, recordedUnowed: ledger.recordedUnowed };
};

/**
 * What follows an outcome until the next turn starts: the records of its turn.
 */
export const turnRecords = (evidence: ReadonlyArray<Evidence>, from: number) => {
  let end = evidence.length;

  for (let i = from + 1; i < evidence.length; i += 1) {
    const e = evidence[i];

    if (e !== undefined && isTurnStart(e)) {
      end = i;
      break;
    }
  }

  return evidence.slice(from + 1, end);
};

/**
 * A context issue carries no actor: its update's consumer publishes first after it.
 */
export const consumerOf = (records: ReadonlyArray<Evidence>) =>
  Option.fromUndefinedOr(
    records.flatMap((r) => (r._tag === "Published" ? [nameOf(r.actor)] : []))[0],
  );
