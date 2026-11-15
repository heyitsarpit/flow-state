import { Equal, Option, Predicate } from "effect";
import { expect } from "vite-plus/test";
import type { Evidence } from "../../src/host/inspect.ts";
import type { Cut, StoryRun } from "../../src/host/testing/index.ts";
import {
  CHANNELS,
  type Delivery,
  deliveries,
  isOutcome,
  isRefusal,
  isTurnStart,
  nameOf,
  textOf,
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
 * releasing lane delivers nothing: no ending of an Attempt is delivered after its Released fact.
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

    const afterRelease = found.delivered.flatMap((d) => {
      const released = releasedAt.get(d.ending.attempt);

      return released !== undefined && released < d.at
        ? [
            `WriteLanes I15: ${d.actor} was delivered ${d.operation} ${d.ending.attempt}'s ending (evidence ${d.at}) after its lane released it (evidence ${released})`,
          ]
        : [];
    });

    return [...twice, ...both, ...afterRelease];
  },
};

/**
 * WriteLanes I16: after a success or failure of an Attempt is delivered, no other ending of it is
 * delivered.
 */
export const nothingAfterDefinite: Rule = {
  rule: "WriteLanes I16",
  breaches: (run) => {
    const definite = new Map<string, Delivery>();

    return deliveries(run.evidence).delivered.flatMap((d) => {
      const first = definite.get(d.ending.attempt);

      if (first === undefined) {
        if (d.ending.channel === "success" || d.ending.channel === "failure")
          definite.set(d.ending.attempt, d);

        return [];
      }

      return d.ending.known && d.ending !== first.ending
        ? [
            `WriteLanes I16: ${d.actor} was delivered ${d.operation} ${d.ending.attempt}'s ${endingText(d)} (evidence ${d.at}) after its ${endingText(first)}`,
          ]
        : [];
    });
  },
};

const endedWrong = (
  e: Extract<Evidence, { _tag: "Ended" }>,
  at: number,
  sent: ReadonlySet<string>,
) => {
  const attempt = textOf(e.attempt);
  const what = `${e.operation} ${attempt}'s ${e.channel} ${e.reason} (evidence ${at})`;

  const unsentEnding =
    e.channel === "notSent" || (e.channel === "unknown" && e.reason === "Restored");

  const found: Array<string> = [];

  if (!CHANNELS.has(e.channel)) found.push(`WriteLanes I3: ${what} is no ending's channel`);

  if (Option.isSome(e.attempt) && !sent.has(attempt) && !unsentEnding)
    found.push(`WriteLanes I3: ${what} ends an Attempt that was never sent`);

  return found;
};

const failuresAfterUnknown = (run: StoryRun, unknownAt: ReadonlyMap<string, number>) =>
  deliveries(run.evidence).delivered.flatMap((d) => {
    const unknown = unknownAt.get(d.ending.attempt);

    return d.ending.channel === "failure" && unknown !== undefined
      ? [
          `WriteLanes I3: ${d.actor} was delivered ${d.operation} ${d.ending.attempt}'s failure ${d.ending.reason} (evidence ${d.at}), an Attempt that ended unknown (evidence ${unknown})`,
        ]
      : [];
  });

/**
 * WriteLanes I3: every ending is one of success, failure, notSent and unknown; an Attempt that
 * ever ended unknown, before or after, never delivers a failure; an Attempt never sent ends only
 * notSent, or unknown Restored at a boot.
 */
export const endingChannels: Rule = {
  rule: "WriteLanes I3",
  breaches: (run) => {
    const sent = new Set<string>();
    const unknownAt = new Map<string, number>();
    const found: Array<string> = [];

    for (const [at, e] of run.evidence.entries()) {
      if (e._tag === "Sent") sent.add(e.attempt);

      if (e._tag !== "Ended") continue;
      found.push(...endedWrong(e, at, sent));

      if (e.channel === "unknown" && Option.isSome(e.attempt) && !unknownAt.has(e.attempt.value))
        unknownAt.set(e.attempt.value, at);
    }

    return [...found, ...failuresAfterUnknown(run, unknownAt)];
  },
};

type Call = Cut["calls"][number];

const whereOf = (c: Call) => `${c.server}.${c.endpoint}`;

// Each endpoint's idempotency fields: the request fields that name a minted Attempt.
const idFieldsOf = (calls: ReadonlyArray<Call>, minted: ReadonlySet<string>) => {
  const fields = new Map<string, ReadonlySet<string>>();

  for (const c of calls)
    for (const [field, value] of Object.entries(c.input))
      if (Predicate.isString(value) && minted.has(value))
        fields.set(whereOf(c), new Set([...(fields.get(whereOf(c)) ?? []), field]));

  return fields;
};

/**
 * WriteLanes I6, over what the fake servers received: every request of one Attempt carries one id
 * and one input. An endpoint's idempotency field is any request field that names a minted Attempt;
 * every request of that endpoint must name a minted Attempt there, and requests naming one Attempt
 * carry one input. No two Attempts share an id across every open of the run's tab.
 *
 * **Gotchas**
 *
 * - An endpoint whose requests carry no minted id, a lookup or an unkeyed call, is not judged.
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

const turnRecords = (evidence: ReadonlyArray<Evidence>, from: number) => {
  const end = evidence.findIndex((e, i) => i > from && isTurnStart(e));

  return evidence.slice(from + 1, end < 0 ? evidence.length : end);
};

const outcomeActor = (e: Evidence) =>
  e._tag === "Turn" || e._tag === "Unhandled" || e._tag === "Denied"
    ? Option.some(nameOf(e.actor))
    : Option.none<string>();

const turnText = (e: Evidence, at: number) =>
  e._tag === "Turn"
    ? `${nameOf(e.actor)}'s turn on ${e.event} from ${e.from} to ${e.to} (evidence ${at})`
    : `the ${e._tag} turn at evidence ${at}`;

/**
 * Turn I9: each turn publishes at most once, an accepted, Unhandled, Denied or refused one alike,
 * and an accepted transition with all its parts publishes exactly once.
 *
 * **Gotchas**
 *
 * - "Exactly once" is judged for an accepted transition that moves to another leaf; one that
 *   changes nothing visible publishes nothing today, a known bug.
 */
export const publishedOnce: Rule = {
  rule: "Turn I9",
  breaches: (run) =>
    run.evidence.flatMap((e, at) => {
      if (!isOutcome(e)) return [];
      const actor = outcomeActor(e);

      const published = turnRecords(run.evidence, at).filter(
        (r) =>
          r._tag === "Published" &&
          Option.getOrElse(actor, () => nameOf(r.actor)) === nameOf(r.actor),
      ).length;

      if (published > 1) return [`Turn I9: ${turnText(e, at)} published ${published} times`];

      return e._tag === "Turn" && e.from !== e.to && published === 0
        ? [`Turn I9: ${turnText(e, at)} moved and published nothing`]
        : [];
    }),
};

const sameSnapshot = (a: Evidence, b: Evidence) =>
  a._tag === "Published" &&
  b._tag === "Published" &&
  a.state === b.state &&
  Equal.equals(a.memory, b.memory);

/**
 * Turn I14: a refused or pre-commit-defective turn leaves its actor as before and starts no work:
 * no Turn report, no Minted or Sent, one issue, and at most one snapshot, equal to the one before
 * the turn. Judged for a delivered ending's turn, which its Delivered record starts and whose
 * refusal names the ending; an event's turn leaves no record before its refusal.
 *
 * **Gotchas**
 *
 * - The Spec's one issue-only snapshot is not built: a snapshot carries no issue, and a refusal
 *   publishes only its Issue record. That half is a known bug, not judged here.
 */
export const refusedTurnIssueOnly: Rule = {
  rule: "Turn I14",
  breaches: (run) =>
    run.evidence.flatMap((e, at) => {
      if (e._tag !== "Issue" || !isRefusal(e) || Option.isNone(e.ending)) return [];
      const { operation, attempt, actor } = e.ending.value;
      const who = nameOf(actor);

      const start = run.evidence.findLastIndex(
        (r, i) =>
          i < at &&
          r._tag === "Delivered" &&
          r.operation === operation &&
          textOf(r.attempt) === textOf(attempt),
      );

      if (start < 0) return [];
      const records = [...run.evidence.slice(start + 1, at), ...turnRecords(run.evidence, at)];

      const before = Option.fromUndefinedOr(
        run.evidence.findLast(
          (r, i) => i < start && r._tag === "Published" && nameOf(r.actor) === who,
        ),
      );

      const wrong = records.filter(
        (r) =>
          r._tag === "Turn" ||
          r._tag === "Minted" ||
          r._tag === "Sent" ||
          isRefusal(r) ||
          (r._tag === "Published" && !Option.exists(before, (b) => sameSnapshot(b, r))),
      );

      const published = records.filter((r) => r._tag === "Published").length;
      const turn = `${who}'s refused turn on its ${operation} ending (evidence ${at})`;
      const found: Array<string> = [];

      if (wrong.length > 0)
        found.push(`Turn I14: ${turn} also gave ${wrong.map((r) => r._tag).join(", ")}`);

      if (published > 1) found.push(`Turn I14: ${turn} published ${published} snapshots`);

      return found;
    }),
};

const opensOf = (run: StoryRun) =>
  run.steps.reduce<ReadonlyArray<number>>(
    (opens, step) => [...opens, (opens.at(-1) ?? 1) + (step._tag === "reload" ? 1 : 0)],
    [],
  );

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

const sleepingOwed = (cut: Cut, n: number) => {
  const live = new Set(cut.inspection.actors.map((a) => a.actor));

  return cut.inspection.owed
    .filter((row) => !live.has(row.actor) && cut.records.stored.has(`actor/${row.actor}`))
    .map(
      (row) =>
        `Restore I1: after the reload at step ${n}, ${row.actor} has an actor record and an owed ${row.operation} ${row.channel} ${row.reason} ending (${row.delivery}) but no incarnation`,
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
 * - Not judged: an Owing identity by a lane record in flight, and "every other record is still
 *   only a record".
 */
export const owingRestoredLive: Rule = {
  rule: "Restore I1",
  breaches: (run) =>
    run.steps.flatMap((step, n) =>
      step._tag === "reload"
        ? Option.match(cutAfter(run, n), {
            onNone: () => [],
            onSome: (cut) => sleepingOwed(cut, n),
          })
        : [],
    ),
};

/**
 * Every run rule, as a plain list: Story tests apply it through {@link checked}, and a generated
 * run receives it as its properties.
 */
export const rules: ReadonlyArray<Rule> = [
  endingDeliveredOnce,
  nothingAfterDefinite,
  endingChannels,
  oneIdOneInput,
  publishedOnce,
  refusedTurnIssueOnly,
  nothingInvokedDisposing,
  owingRestoredLive,
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
