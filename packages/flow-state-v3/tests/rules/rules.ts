import { Equal, Option, Predicate, Schema } from "effect";
import { expect } from "vite-plus/test";
import { acknowledgedBeforeSent, oneBatchOut } from "./batches.ts";
import { acknowledgedHeardAgain, everyCommitEndsOnce } from "./commits.ts";
import { onlyActorsWithheld, putBy, recordKinds } from "./records.ts";
import { atStart, knownAt, placesOf } from "./places.ts";
import { oneStart, ownedRowsSaved } from "./starts.ts";
import { mailboxOrder } from "./mailbox.ts";
import { refusedTurnIssueOnly } from "./refusals.ts";
import { unchangedPartsKept } from "./memory.ts";
import type { Evidence } from "../../src/host/inspect.ts";
import type { Cut, StoryRun } from "../../src/host/testing/index.ts";
import {
  CHANNELS,
  type Delivery,
  deliveries,
  consumerOf,
  isContextIssue,
  isTurnStart,
  nameOf,
  textOf,
  turnRecords,
} from "./deliveries.ts";

/**
 * A run rule: one Spec rule, by its id, as a function from a finished run to its breaches.
 *
 * **Details**
 *
 * A rule reads only what a run shows: `run.evidence`, `run.steps`, and the checkpoints' and end's
 * `inspection`, `records` and `calls`. An empty list means the run keeps the rule.
 */
export type Rule = {
  readonly rule: string;
  readonly breaches: (run: StoryRun) => ReadonlyArray<string>;
};

const endingText = (d: Delivery) =>
  d.ending.known ? `${d.ending.channel} ${d.ending.reason}` : "an ending";

/**
 * WriteLanes I15: per Attempt and per incarnation, each ending is either delivered once or
 * recorded as evidence only, never both and never twice. The written exceptions are kept: a
 * re-send's refused capture owes a second ending (its own Ended); unknown Restored is owed afresh
 * at each start, so once again after each reload; a refused turn's ending is delivered once more
 * after queued mail, and a kept one gets one try at each start; re-parking is no delivery. A
 * releasing lane delivers nothing: no ending of an Attempt is delivered after its Released fact, in
 * that open or, once the release was saved, in a later one (a crash forgets an unsaved release,
 * WriteAhead I21).
 * Evidence-only endings are judged as "never both": a recorded ending is never delivered.
 */
export const endingDeliveredOnce: Rule = {
  rule: "WriteLanes I15",
  breaches: (run) => {
    const found = deliveries(run.evidence);

    const releasedAt = new Map(
      run.evidence.flatMap((e, at) =>
        e._tag === "Lane" && e.kind === "Released" && Option.isSome(e.attempt)
          ? [[e.attempt.value, at] as const]
          : [],
      ),
    );

    const twice = found.delivered
      .filter((d) => d.from === "nothing")
      .map(
        (d) =>
          `WriteLanes I15: ${d.actor} was delivered ${d.operation} ${d.ending.attempt}'s ending again (evidence ${d.at}) with nothing owed: no new ending, no redelivery of a refused turn and no kept try left`,
      );

    const both = found.recordedUnowed.map(
      ({ at, attempt }) =>
        `WriteLanes I15: ${attempt}'s ending was recorded as evidence (evidence ${at}) with no ending owed: it was delivered or recorded before`,
    );

    const places = placesOf(run);

    const afterRelease = found.delivered.flatMap((d) => {
      const released = releasedAt.get(d.ending.attempt);

      return released !== undefined &&
        released < d.at &&
        knownAt(run, places, released, d.at, d.actor)
        ? [
            `WriteLanes I15: ${d.actor} was delivered ${d.operation} ${d.ending.attempt}'s ending (evidence ${d.at}) after its lane released it (evidence ${released})`,
          ]
        : [];
    });

    const evidenceOnly = found.delivered
      .filter((d) => d.ending.known && d.ending.reason === "Superseded")
      .map(
        (d) =>
          `WriteLanes I15: ${d.actor} was delivered ${d.operation} ${d.ending.attempt}'s Superseded ending (evidence ${d.at}), which is recorded as evidence only`,
      );

    return [...twice, ...both, ...afterRelease, ...evidenceOnly];
  },
};

/**
 * WriteLanes I16: after a success or failure of an Attempt is delivered, no other ending of it is
 * delivered. A crash that came before that delivery was saved for the actor forgets it: in a later
 * open the Attempt starts over, restored unknown { Restored } (WriteAhead I17, I21) or given its saved
 * ending once more (WriteLanes I15 counts per incarnation), and a retry may end it again.
 */
export const nothingAfterDefinite: Rule = {
  rule: "WriteLanes I16",
  breaches: (run) => {
    const definite = new Map<string, Delivery>();
    const places = placesOf(run);

    const isDefinite = (d: Delivery) =>
      d.ending.channel === "success" || d.ending.channel === "failure";

    return deliveries(run.evidence).delivered.flatMap((d) => {
      const first = definite.get(d.ending.attempt);

      // A crash before the definite delivery was saved forgets it: the Attempt starts over.
      if (first !== undefined && !knownAt(run, places, first.at, d.at, d.actor))
        definite.delete(d.ending.attempt);
      const kept = definite.get(d.ending.attempt);

      if (kept === undefined) {
        if (isDefinite(d)) definite.set(d.ending.attempt, d);

        return [];
      }

      return d.ending.known && d.ending !== kept.ending
        ? [
            `WriteLanes I16: ${d.actor} was delivered ${d.operation} ${d.ending.attempt}'s ${endingText(d)} (evidence ${d.at}) after its ${endingText(kept)}`,
          ]
        : [];
    });
  },
};

const endedWrong = (
  e: Extract<Evidence, { _tag: "Ended" }>,
  at: number,
  sent: ReadonlySet<string>,
  starting: boolean,
) => {
  const attempt = textOf(e.attempt);
  const what = `${e.operation} ${attempt}'s ${e.channel} ${e.reason} (evidence ${at})`;

  const unsentEnding =
    e.channel === "notSent" || (e.channel === "unknown" && e.reason === "Restored" && starting);

  const found: Array<string> = [];

  if (!CHANNELS.has(e.channel)) found.push(`WriteLanes I3: ${what} is no ending's channel`);

  if (Option.isSome(e.attempt) && !sent.has(attempt) && !unsentEnding)
    found.push(`WriteLanes I3: ${what} ends an Attempt that was never sent`);

  return found;
};

type Unknown = { readonly at: number; readonly reason: string };

const failuresAfterUnknown = (
  run: StoryRun,
  unknowns: ReadonlyMap<string, ReadonlyArray<Unknown>>,
) => {
  const places = placesOf(run);

  return deliveries(run.evidence).delivered.flatMap((d) => {
    const all = unknowns.get(d.ending.attempt) ?? [];

    // A crash that came before the failure was saved forgets it: the restore and every later
    // ending of the Attempt start over (WriteAhead I17, I21).
    const forgotten = (u: Unknown) =>
      all.some(
        (r) =>
          r.reason === "Restored" &&
          r.at > d.at &&
          r.at <= u.at &&
          !knownAt(run, places, d.at, r.at, d.actor),
      );

    const unknown = all.find((u) => !forgotten(u));

    return d.ending.channel === "failure" && unknown !== undefined
      ? [
          `WriteLanes I3: ${d.actor} was delivered ${d.operation} ${d.ending.attempt}'s failure ${d.ending.reason} (evidence ${d.at}), an Attempt that ended unknown (evidence ${unknown.at})`,
        ]
      : [];
  });
};

/**
 * WriteLanes I3: every ending is one of success, failure, notSent and unknown; an Attempt that
 * ever ended unknown, before or after, never delivers a failure; an Attempt never sent ends only
 * notSent, or unknown Restored at its actor's start (a boot, a return or an adoption, as WriteLanes
 * I15 and WriteAhead I17 allow). A crash before a failure was saved forgets it (WriteAhead I21):
 * the Attempt restores unknown Restored in a later open, and its later endings are judged afresh.
 */
export const endingChannels: Rule = {
  rule: "WriteLanes I3",
  breaches: (run) => {
    const sent = new Set<string>();
    const unknowns = new Map<string, ReadonlyArray<Unknown>>();
    const starting = atStart(run);
    const found: Array<string> = [];

    for (const [at, e] of run.evidence.entries()) {
      if (e._tag === "Sent") sent.add(e.attempt);

      if (e._tag !== "Ended") continue;
      found.push(...endedWrong(e, at, sent, starting.has(at)));

      if (e.channel !== "unknown" || Option.isNone(e.attempt)) continue;
      const id = e.attempt.value;

      // A crash hid whether a restored Attempt was sent, so from then on it may have been.
      if (e.reason === "Restored") sent.add(id);
      unknowns.set(id, [...(unknowns.get(id) ?? []), { at, reason: e.reason }]);
    }

    return [...found, ...failuresAfterUnknown(run, unknowns)];
  },
};

type Call = Cut["calls"][number];

const whereOf = (c: Call) => `${c.server}.${c.endpoint}`;

// Each endpoint's idempotency fields: the request fields that name a minted Attempt.
// An Attempt id as the runtime's mint gives it: a name, the session seed, a count.
const MINTED_ID = /^att-[\da-f]+-\d+$/u;

const idFieldsOf = (calls: ReadonlyArray<Call>, minted: ReadonlySet<string>) => {
  const fields = new Map<string, ReadonlySet<string>>();

  const namesAttempt = (value: Call["input"][string]) =>
    Predicate.isString(value) && (minted.has(value) || MINTED_ID.test(value));

  for (const c of calls)
    for (const [field] of Object.entries(c.input).filter(([, value]) => namesAttempt(value)))
      fields.set(whereOf(c), new Set([...(fields.get(whereOf(c)) ?? []), field]));

  return fields;
};

/**
 * WriteLanes I6, over what the fake servers received: every request of one Attempt carries one id
 * and one input. An endpoint's idempotency field is any request field that names a minted Attempt
 * or carries a value shaped like an Attempt id; every request of that endpoint must name a minted
 * Attempt there, and requests naming one Attempt carry one input. No two Attempts share an id across
 * every open of the run's tab.
 *
 * **Gotchas**
 *
 * - An endpoint whose requests carry no id of an Attempt's shape, a lookup or an unkeyed call, is not
 *   judged.
 */
export const oneIdOneInput: Rule = {
  rule: "WriteLanes I6",
  breaches: (run) => {
    const mints = run.evidence.flatMap((e) => (e._tag === "Minted" ? [e.attempt] : []));
    const minted = new Set(mints);
    const calls = run.end.calls;
    const idFields = idFieldsOf(calls, minted);
    const inputs = new Map<string, Call["input"]>();

    const shared = [...minted]
      .filter((id) => mints.indexOf(id) !== mints.lastIndexOf(id))
      .map((id) => `WriteLanes I6: two Attempts were minted with the id ${id}`);

    const requests = calls.flatMap((c) =>
      [...(idFields.get(whereOf(c)) ?? [])].flatMap((field) => {
        const id = String(c.input[field]);

        if (!minted.has(id))
          return [
            `WriteLanes I6: ${whereOf(c)} received ${field} ${id} from tab ${c.tab.name}:${c.tab.open}, which names no minted Attempt`,
          ];
        const key = `${whereOf(c)} ${id}`;
        const first = inputs.get(key) ?? c.input;
        inputs.set(key, first);

        return Equal.equals(first, c.input)
          ? []
          : [`WriteLanes I6: ${whereOf(c)} received Attempt ${id} with two inputs`];
      }),
    );

    return [...shared, ...requests];
  },
};

const outcomeActor = (e: Evidence) =>
  e._tag === "Turn" ||
  e._tag === "Unhandled" ||
  e._tag === "Denied" ||
  e._tag === "Delivered" ||
  e._tag === "Incarnated" ||
  e._tag === "Finished"
    ? Option.some(nameOf(e.actor))
    : Option.none<string>();

const turnText = (e: Evidence, at: number) =>
  e._tag === "Turn"
    ? `${nameOf(e.actor)}'s turn on ${e.event} from ${e.from} to ${e.to} (evidence ${at})`
    : `the ${e._tag} turn at evidence ${at}`;

/**
 * Turn I9: each turn publishes at most once, an accepted, Unhandled, Denied or refused one alike,
 * and an accepted transition with all its parts publishes exactly once. Judged from every turn's
 * start (an outcome, a delivery, an incarnation, a finish or the Runtime's disposal), and no
 * snapshot is published before the first.
 */
export const publishedOnce: Rule = {
  rule: "Turn I9",
  breaches: (run) => [
    ...run.evidence
      .slice(0, Math.max(0, run.evidence.findIndex(isTurnStart)))
      .filter((e) => e._tag === "Published")
      .map(() => "Turn I9: a snapshot was published before any turn began"),
    ...run.evidence.flatMap((e, at) => {
      if (!isTurnStart(e)) return [];
      const records = turnRecords(run.evidence, at);

      const actor = isContextIssue(e) ? consumerOf(records) : outcomeActor(e);

      const published = records.filter(
        (r) =>
          r._tag === "Published" &&
          Option.getOrElse(actor, () => nameOf(r.actor)) === nameOf(r.actor),
      ).length;

      if (published > 1) return [`Turn I9: ${turnText(e, at)} published ${published} times`];

      return e._tag === "Turn" && published === 0
        ? [`Turn I9: ${turnText(e, at)} was accepted and published nothing`]
        : [];
    }),
  ],
};

const opensOf = (run: StoryRun) => {
  const opens: Array<number> = [];
  let open = 1;

  for (const step of run.steps) {
    if (step._tag === "reload") open += 1;
    opens.push(open);
  }

  return opens;
};

/**
 * Actors I30, over what the fake servers received: after the Runtime's disposal starts, no commit
 * or read is invoked, so no call of a tab's open arrives at or after its `disposeRuntime` step.
 */
export const nothingInvokedDisposing: Rule = {
  rule: "Actors I30",
  breaches: (run) => {
    const opens = opensOf(run);
    const disposedAt = new Map<number, number>();

    for (const [n, step] of run.steps.entries()) {
      const open = opens[n] ?? 1;

      if (step._tag === "disposeRuntime" && !disposedAt.has(open)) disposedAt.set(open, n);
    }

    return run.end.calls.flatMap((c) => {
      const from = disposedAt.get(c.tab.open);

      return from !== undefined && c.step >= from
        ? [
            `Actors I30: ${c.server}.${c.endpoint} received a call from tab ${c.tab.name}:${c.tab.open} at step ${c.step}, after that open's disposal began at step ${from}`,
          ]
        : [];
    });
  },
};

const checkpointCut = (run: StoryRun, name: string) =>
  Option.fromUndefinedOr(Object.entries(run.checkpoints).find(([key]) => key === name)?.[1]);

const cutAfter = (run: StoryRun, n: number) => {
  const next = run.steps[n + 1];

  if (next === undefined) return Option.some(run.end);

  return next._tag === "checkpoint" ? checkpointCut(run, next.name) : Option.none();
};

// The fields of a lane record that make its identity Owing (Restore model; WriteAhead R5).
const LaneOwing = Schema.fromJsonString(
  Schema.Struct({ machine: Schema.String, name: Schema.String, inFlight: Schema.Boolean }),
);

const sleepingOwed = (cut: Cut, n: number, put: ReadonlySet<string>) => {
  const live = new Set(cut.inspection.actors.map((a) => a.actor));

  // A record the Story put in the store itself is not judged (Stories R11).
  const runtimes = (key: string) => {
    const text = cut.records.stored.get(key);

    return text !== undefined && !put.has(`${key}\n${text}`);
  };

  const asleep = (actor: string) => !live.has(actor) && runtimes(`actor/${actor}`);

  const rows = cut.inspection.owed
    .filter((row) => asleep(row.actor))
    .map(
      (row) =>
        `Restore I1: after the reload at step ${n}, ${row.actor} has an actor record and an owed ${row.operation} ${row.channel} ${row.reason} ending (${row.delivery}) but no incarnation`,
    );

  // A start rewrites each lane it adopts Held, so a lane record still in flight after the boot
  // belongs to an Owing identity left asleep.
  const lanes = [...cut.records.stored].flatMap(([key, text]) =>
    key.startsWith("lane/") && runtimes(key)
      ? Option.toArray(Schema.decodeUnknownOption(LaneOwing)(text)).flatMap((l) =>
          l.inFlight && asleep(`${l.machine}/${l.name}`)
            ? [
                `Restore I1: after the reload at step ${n}, ${l.machine}/${l.name} has an actor record and a lane in flight (${key}) but no incarnation`,
              ]
            : [],
        )
      : [],
  );

  return [...rows, ...lanes];
};

// Whether the boot of the reload at step `n` found the store unreadable: it reported StorageFailure
// naming no record, so the tab runs on with no persistence and restores nothing (Restore R9).
const loadRefused = (run: StoryRun, n: number) => {
  const from = run.trace.events.findIndex((e) => e.record._tag === "Step" && e.record.index === n);
  const after = run.trace.events.slice(from + 1);
  const to = after.findIndex((e) => e.record._tag === "Step");

  return (
    from >= 0 &&
    (to < 0 ? after : after.slice(0, to)).some(
      (e) =>
        e.record._tag === "Runtime" &&
        e.record.evidence._tag === "Reported" &&
        e.record.evidence.code === "StorageFailure" &&
        Option.isNone(e.record.evidence.record),
    )
  );
};

/**
 * Restore I1, at a cut taken right after a reload: an Owing identity whose actor record restores
 * is live after ready, so no identity owed an ending has an actor record and no incarnation.
 *
 * **Gotchas**
 *
 * - Exempt by the Spec: an identity whose record is absent (disposeActor removed it), quarantined
 *   or reset keeps its endings waiting for an adopting ensure. Only absence has a public read; no
 *   fixture quarantines or resets a record, so those two are not told apart here.
 * - An Owing identity by a lane record in flight is judged by its lane record, which its start
 *   rewrites Held. Not judged: "every other record is still only a record".
 * - A reload whose load the store refused restores nothing (Restore R9), so it is not judged.
 */
export const owingRestoredLive: Rule = {
  rule: "Restore I1",
  breaches: (run) =>
    run.steps.flatMap((step, n) =>
      step._tag === "reload" && !loadRefused(run, n)
        ? Option.match(cutAfter(run, n), {
            onNone: () => [],
            onSome: (cut) => sleepingOwed(cut, n, putBy(run)),
          })
        : [],
    ),
};

const isJsonValue = Schema.is(Schema.Json);

// A value that is neither JSON nor a plain object or array: a Schema's own value kind.
// FLOW_STATE_ALLOW_UNKNOWN: a published memory field.
const isApplicationValue = (v: unknown) => {
  if (!Predicate.isObject(v)) return false;

  const proto = Object.getPrototypeOf(v);

  return proto !== Object.prototype && proto !== null;
};

/**
 * Turn R24, over Flow's fixtures: every published memory field is plain data, readable as JSON, or
 * a value kind a Schema makes beside it (a Map, a Set, a Date, an Option or another class
 * instance), an application value the rule does not judge, or `undefined`, as an inactive
 * fragment's slice (Turn R23) and an optional field hold it. Whether a field may be `undefined` is
 * its own Schema's check, not this rule's.
 */
export const publishedPlainData: Rule = {
  rule: "Turn R24",
  breaches: (run) =>
    run.evidence.flatMap((e) =>
      e._tag === "Published" &&
      !Object.values(e.memory).every(
        (v) => isJsonValue(v) || v === undefined || isApplicationValue(v),
      )
        ? [`Turn R24: ${e.actor.machine}/${e.actor.name} published memory that is not plain data`]
        : [],
    ),
};

/**
 * Every run rule, as a plain list: Story tests apply it through {@link checked}, and a generated
 * run receives it as its properties.
 */
export const rules: ReadonlyArray<Rule> = [
  oneStart,
  ownedRowsSaved,
  publishedPlainData,
  endingDeliveredOnce,
  nothingAfterDefinite,
  endingChannels,
  oneIdOneInput,
  publishedOnce,
  refusedTurnIssueOnly,
  nothingInvokedDisposing,
  owingRestoredLive,
  unchangedPartsKept,
  everyCommitEndsOnce,
  acknowledgedHeardAgain,
  recordKinds,
  onlyActorsWithheld,
  acknowledgedBeforeSent,
  oneBatchOut,
  mailboxOrder,
];

/**
 * Every rule's breaches in a run.
 */
export const breachesOf = (run: StoryRun) => rules.flatMap((r) => r.breaches(run));

/**
 * Applies every run rule to a finished run and fails the test on any breach; returns the run.
 */
export const checked = <R extends StoryRun>(run: R) => {
  expect(breachesOf(run)).toEqual([]);

  return run;
};
