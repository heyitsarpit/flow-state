import { isDeepStrictEqual } from "node:util";
import { Option, Predicate } from "effect";
import type { Evidence } from "../../src/host/inspect.ts";
import type { Cut, StoryRun } from "../../src/host/testing/index.ts";
import { TraceRecord } from "../../src/host/trace.ts";

// The invariants of the turn's parts (Changes I5, I9, I12, I15 to I17) as functions of a finished
// run: the evidence of each step and the cuts around it. Each expected result is the Spec's rule;
// none is read from a run. I13 needs no function here: every cut rebuilds the world's indexes and
// fails on drift.

/**
 * One step of a run: its index, its kind, the evidence it recorded, and the checkpoints right
 * before and right after it, when the Story took them.
 */
export type Stepped = {
  readonly index: number;
  readonly kind: string;
  readonly evidence: ReadonlyArray<Evidence>;
  readonly before: Option.Option<Cut>;
  readonly after: Option.Option<Cut>;
};

const keyOf = (actor: { readonly machine: string; readonly name: string }) =>
  `${actor.machine}/${actor.name.replaceAll("%", "%25").replaceAll("/", "%2F").replaceAll("|", "%7C")}`;

// The stored key of the actor a record names, if it names one.
const actorKeyOf = (e: Evidence) => ("actor" in e ? Option.some(keyOf(e.actor)) : Option.none());

const by = (e: Evidence, tag: Evidence["_tag"], key: string) =>
  e._tag === tag && Option.contains(actorKeyOf(e), key);

/**
 * Each step of a run with the evidence it recorded, in order, and the checkpoints right before
 * and right after it.
 */
export const steppedOf = (run: StoryRun<string>) => {
  const cutAt = (at: number) => {
    const step = run.steps[at];

    return step?._tag === "checkpoint"
      ? Option.fromUndefinedOr(run.checkpoints[step.name])
      : Option.none<Cut>();
  };

  const evidence = new Map<number, Array<Evidence>>();
  let at = -1;

  for (const { record } of run.trace.events) {
    if (TraceRecord.$is("Step")(record)) at = record.index;

    if (TraceRecord.$is("Runtime")(record))
      evidence.set(at, [...(evidence.get(at) ?? []), record.evidence]);
  }

  return run.steps.map((step, index) => ({
    index,
    kind: step._tag,
    evidence: evidence.get(index) ?? [],
    before: cutAt(index - 1),
    after: cutAt(index + 1),
  }));
};

// The due timers a snapshot shows: an unkeyed timer with a `dueAt`, and each keyed one with one.
// FLOW_STATE_ALLOW_UNKNOWN: a snapshot of any definition, read for its schedules' shape alone.
const dueTimers = (snapshot: unknown) => {
  const schedules = Predicate.hasProperty(snapshot, "schedules") ? snapshot.schedules : undefined;

  if (!Predicate.isObject(schedules)) return 0;

  return Object.values(schedules).reduce<number>(
    (n, timer) =>
      n +
      (Array.isArray(timer)
        ? timer.filter((t) => Predicate.hasProperty(t, "dueAt")).length
        : Number(Predicate.hasProperty(timer, "dueAt"))),
    0,
  );
};

// An alarm's kind, as a cut shows it (Changes T14), and how many of a kind an actor owes.
type Kind = Cut["inspection"]["timers"][number]["kind"];

type Owed = { readonly kind: Kind; readonly want: number };

/**
 * Changes I12: the alarms are exactly one per live owner fact: a `Schedule` alarm per due run of
 * an awake scope (its actor used, the Runtime open), a `Grace` per free actor (live, unused, no
 * lane in flight; a Story's step ends with no mail), a `Bound` while a disposal is in progress.
 * `Silent` is not judged here: a cut does not show an awaited ticket.
 */
export const alarmsMatch = (cut: Cut, where: string) => {
  const { actors, uses, lanes, timers, lifecycle } = cut.inspection;
  const open = lifecycle === "Open";
  const used = new Set(uses.filter((u) => u.uses.length > 0).map((u) => String(u.actor)));
  const busy = new Set(lanes.filter((l) => l.state === "InFlight").map((l) => String(l.actor)));
  const live = new Set(actors.map(({ actor }) => String(actor)));

  // A schedule alarm counts only with its due time: one of an incarnation that ended shows none.
  const counted = (t: (typeof timers)[number]) => t.kind !== "Schedule" || Option.isSome(t.dueAt);

  const count = (kind: Kind, actor: string) =>
    timers.filter(
      (t) => t.kind === kind && Option.contains(Option.map(t.actor, String), actor) && counted(t),
    ).length;

  const perActor = actors.flatMap(({ actor, snapshot }) => {
    const key = String(actor);
    const awake = open && used.has(key);
    const schedule = { kind: "Schedule", want: awake ? dueTimers(snapshot) : 0 } satisfies Owed;

    const grace = {
      kind: "Grace",
      want: open && !used.has(key) && !busy.has(key) ? 1 : 0,
    } satisfies Owed;

    return [schedule, grace].flatMap(({ kind, want }) => {
      const have = count(kind, key);

      return have === want
        ? []
        : [
            `Changes I12 at ${where}: ${key} has ${String(have)} ${kind} alarms, owes ${String(want)}`,
          ];
    });
  });

  const orphans = timers.flatMap((t) =>
    Option.match(Option.map(t.actor, String), {
      onNone: () => [],
      onSome: (key) =>
        live.has(key) && counted(t)
          ? []
          : [`Changes I12 at ${where}: a ${t.kind} alarm of ${key}, owed by no live fact`],
    }),
  );

  const bounds = timers.filter((t) => t.kind === "Bound").length;
  const owedBounds = lifecycle === "Disposing" ? 1 : 0;

  const bound =
    bounds === owedBounds
      ? []
      : [`Changes I12 at ${where}: ${String(bounds)} Bound alarms while ${lifecycle}`];

  return [...perActor, ...orphans, ...bound];
};

/**
 * Changes I5: each accepted turn's record is followed by its actor's publication, with why
 * `"Turn"` and no other turn record of that actor between them; and a publication with why
 * `"Turn"` is always a turn's: a turn record of its actor comes after that actor's last earlier
 * publication. That a turn publishes at most once is Turn I9's run rule (`publishedOnce`).
 */
export const onePublication = (run: StoryRun<string>) => [
  ...run.evidence.flatMap((e, at) => {
    if (e._tag !== "Turn") return [];

    const key = keyOf(e.actor);
    const rest = run.evidence.slice(at + 1);
    const nextTurn = rest.findIndex((r) => by(r, "Turn", key));
    const published = rest.findIndex((r) => by(r, "Published", key));
    const own = rest[published];

    return published !== -1 &&
      (nextTurn === -1 || published < nextTurn) &&
      own?._tag === "Published" &&
      own.why === "Turn"
      ? []
      : [
          `Changes I5: ${key}'s turn on ${e.event} (evidence ${String(at)}) has no publication with why Turn before its next turn`,
        ];
  }),
  ...run.evidence.flatMap((e, at) => {
    if (e._tag !== "Published" || e.why !== "Turn") return [];

    const key = keyOf(e.actor);
    const earlier = run.evidence.slice(0, at);
    const lastPublished = earlier.findLastIndex((r) => by(r, "Published", key));
    const lastTurn = earlier.findLastIndex((r) => by(r, "Turn", key));

    return lastTurn > lastPublished
      ? []
      : [
          `Changes I5: ${key}'s publication (evidence ${String(at)}) says Turn with no turn of its own`,
        ];
  }),
];

const IN_MAILBOX: ReadonlySet<string> = new Set(["Queued", "Retrying"]);

/**
 * Changes I9: a row whose try is in a mailbox has a live audience: its actor is live.
 */
export const rowsHeardLive = (cut: Cut, where: string) => {
  const live = new Set(cut.inspection.actors.map(({ actor }) => String(actor)));

  return cut.inspection.owed.flatMap((row) =>
    IN_MAILBOX.has(row.delivery) && !live.has(String(row.actor))
      ? [`Changes I9 at ${where}: ${String(row.actor)} has a ${row.delivery} row and is not live`]
      : [],
  );
};

// The steps whose own work starts or ends incarnations, which `Begin` and `End` may write.
const LIFE_STEPS: ReadonlySet<string> = new Set(["reload", "dispose", "disposeRuntime"]);

/**
 * Changes I15, I16 (and the applier's row C2): an actor's state and memory change only by a
 * `Turn` or a `Begin`. Across a step with no turn record, start or end of an actor, its state and
 * memory are as before: a refused, denied, unhandled or settled change writes neither, and a
 * context update writes no memory.
 */
export const onlyTurnsWrite = (s: Stepped) => {
  if (LIFE_STEPS.has(s.kind)) return [];

  return Option.match(Option.all([s.before, s.after]), {
    onNone: () => [],
    onSome: ([before, after]) =>
      after.inspection.actors.flatMap(({ actor, snapshot }) => {
        const key = String(actor);
        const was = before.inspection.actors.find((a) => String(a.actor) === key)?.snapshot;

        const wrote = s.evidence.some(
          (e) => by(e, "Turn", key) || by(e, "Incarnated", key) || by(e, "Finished", key),
        );

        if (was === undefined || wrote) return [];

        const same = was.state === snapshot.state && isDeepStrictEqual(was.memory, snapshot.memory);

        return same
          ? []
          : [
              `Changes I15, I16 at step ${String(s.index)} (${s.kind}): ${key}'s state or memory changed with no turn`,
            ];
      }),
  });
};

/**
 * Changes I17: in a step that ends several actors, each consumer ends before every provider its
 * context is bound to. `bound` names each consumer's providers by stored key.
 */
export const consumersEndFirst = (
  s: Stepped,
  bound: ReadonlyMap<string, ReadonlyArray<string>>,
) => {
  const finished = s.evidence.flatMap((e) =>
    e._tag === "Finished" ? Option.toArray(actorKeyOf(e)) : [],
  );

  return [...bound].flatMap(([consumer, providers]) =>
    providers.flatMap((provider) => {
      const c = finished.indexOf(consumer);
      const p = finished.indexOf(provider);

      return c !== -1 && p !== -1 && p < c
        ? [
            `Changes I17 at step ${String(s.index)}: provider ${provider} ended before its consumer ${consumer}`,
          ]
        : [];
    }),
  );
};
