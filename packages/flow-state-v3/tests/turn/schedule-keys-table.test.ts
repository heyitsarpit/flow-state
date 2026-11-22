import { Option, Predicate, Schedule, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { Story, type StoryRun } from "../../src/host/testing/index.ts";
import { TraceRecord } from "../../src/host/trace.ts";
import {
  actorRef,
  app,
  definition,
  Flow,
  machine,
  runtimeSetup,
  type TimerView,
} from "../../src/index.ts";
import { checked } from "../rules/rules.ts";
import { timersOf } from "../timers.ts";

// Every same-turn combination of two keys of one keyed schedule, each row's expected outcome
// derived from Turn R14, R16, R19, R25 and R27, never from a run: a one-minute schedule `t` keyed
// by k and j, each key absent, running, held by A, refused (its arming's delay out of range) or
// running after A threw, then appearing, staying or leaving with its reason A true, false or
// throwing and, appearing, its delay in or out of range; the turn is a write, or the firing of
// the one running key.

const Flag = Schema.Literals(["t", "f", "x"]);

type Flag = typeof Flag.Type;

const Inputs = {
  keys: Schema.Array(Schema.String),
  far: Schema.Array(Schema.String),
  a: Schema.Record(Schema.String, Flag),
};

const Pair = definition({
  id: "Table/Pair",
  states: ["ON"],
  events: { Set: Inputs, Queue: Inputs },
  internalEvents: { Tick: {} },
  memory: {
    keys: Flow.initial(Schema.Array(Schema.String), []),
    far: Flow.initial(Schema.Array(Schema.String), []),
    a: Flow.initial(Schema.Record(Schema.String, Flag), {}),
    nkeys: Flow.initial(Schema.Array(Schema.String), []),
    nfar: Flow.initial(Schema.Array(Schema.String), []),
    na: Flow.initial(Schema.Record(Schema.String, Flag), {}),
  },
  schedules: { t: { key: { id: Schema.String }, pausedBy: ["A"] } },
});

const flag = (value: Flag) => {
  if (value === "x") throw new Error("the reason cannot be read");

  return value === "t";
};

const DELAY = 60_000;

const PairMachine = machine(Pair, ({ S, E }) => ({
  default: S.ON,
  on: {
    Set: { updateMemory: ({ event }) => ({ keys: event.keys, far: event.far, a: event.a }) },
    Queue: { updateMemory: ({ event }) => ({ nkeys: event.keys, nfar: event.far, na: event.a }) },
    Tick: {
      updateMemory: ({ memory }) => ({ keys: memory.nkeys, far: memory.nfar, a: memory.na }),
    },
  },
  states: {
    ON: {
      schedules: {
        t: {
          keys: ({ memory }) => memory.keys.map((id) => ({ id })),
          schedule: ({ key, memory }) => (memory.far.includes(key.id) ? 2 ** 31 : DELAY),
          send: E.Tick,
          paused: { A: ({ key, memory }) => flag(memory.a[key.id] ?? "f") },
        },
      },
    },
  },
}));

// ── rows.

type Start = "absent" | "running" | "held" | "refused" | "running, A threw";

type Change = "appear" | "absent" | "stay" | "leave";

type KeyRow = {
  readonly start: Start;
  readonly change: Change;
  readonly a: Flag;
  readonly far: boolean;
};

type Turn = "write" | "firing";

type Row = { readonly k: KeyRow; readonly j: KeyRow; readonly turn: Turn };

const KEYS = ["k", "j"] as const;

type Key = (typeof KEYS)[number];

const FLAGS: ReadonlyArray<Flag> = ["t", "f", "x"];

const PRESENT: ReadonlyArray<Start> = ["running", "held", "refused", "running, A threw"];

// Each way one key can start and change: an absent key appears (its reason and delay varied) or
// stays absent; a present one stays (its reason varied) or leaves.
const APPEARING: ReadonlyArray<KeyRow> = FLAGS.flatMap((a) =>
  [false, true].map((far) => ({ start: "absent", change: "appear", a, far }) as const),
);

const STAYING_ABSENT: KeyRow = { start: "absent", change: "absent", a: "f", far: false };

const KEPT: ReadonlyArray<KeyRow> = PRESENT.flatMap((start) => [
  ...FLAGS.map((a) => ({ start, change: "stay", a, far: false }) as const),
  { start, change: "leave", a: "f", far: false } as const,
]);

const KEY_ROWS: ReadonlyArray<KeyRow> = [...APPEARING, STAYING_ABSENT, ...KEPT];

const runs = (start: Start) => start === "running" || start === "running, A threw";

// A firing row has exactly one running key, which fires.
const ROWS: ReadonlyArray<Row> = KEY_ROWS.flatMap((k) =>
  KEY_ROWS.flatMap((j) =>
    runs(k.start) === runs(j.start)
      ? [{ k, j, turn: "write" as const }]
      : [
          { k, j, turn: "write" as const },
          { k, j, turn: "firing" as const },
        ],
  ),
);

const changeTitle = (row: KeyRow) =>
  row.change === "appear" || row.change === "stay" ? `${row.change}s, A ${row.a}` : row.change;

const keyTitle = (key: Key, row: KeyRow) =>
  row.far
    ? `${key} ${row.start} ${changeTitle(row)} delay out of range`
    : `${key} ${row.start} ${changeTitle(row)}`;

const titleOf = (row: Row) =>
  [keyTitle("k", row.k), keyTitle("j", row.j), row.turn === "firing" ? "firing due" : "write"].join(
    " / ",
  );

// ── the expected outcome, from the Spec.

const SLOT = "states.ON.schedules.t.schedule";

const SLOT_A = "states.ON.schedules.t.paused.A";

type Seen =
  | readonly [Key, "Paused", ReadonlyArray<string>, number]
  | readonly [Key, "Resumed", number];

type Outcome = {
  readonly timers: Readonly<Partial<Record<Key, TimerView>>>;
  readonly issues: ReadonlyArray<string>;
  readonly evidence: ReadonlyArray<Seen>;
};

const instantOf = (row: Row) => (row.turn === "firing" ? DELAY : 10_000);

// The run each start leaves at 0 (Turn R14, R16, R27): armed at 0, held from 0 by A; a refused
// arming leaves none.
const RUN = {
  absent: Option.none<TimerView>(),
  running: Option.some<TimerView>({ dueAt: DELAY }),
  held: Option.some<TimerView>({ left: DELAY, pausedBy: ["A"] }),
  refused: Option.none<TimerView>(),
  "running, A threw": Option.some<TimerView>({ dueAt: DELAY }),
} as const satisfies Record<Start, Option.Option<TimerView>>;

// The reasons each start last read true; a reason that threw at the key's first arming kept none.
const LAST = {
  absent: [],
  running: [],
  held: ["A"],
  refused: [],
  "running, A threw": [],
} as const satisfies Record<Start, ReadonlyArray<string>>;

// One key's expected timer, issues and evidence.
//
// - Turn R16: a key appearing arms its timer from step one; a key leaving cancels it; a staying
//   key keeps its run.
// - Turn R14: an arming decided after the turn committed (a key appearing) whose delay is out of
//   range commits with an issue and leaves that timer unarmed; a Duration that fired is done.
// - Turn R27: A runs for each timer, armed or idle; true holds an armed one (a new run its full
//   delay, a running one what is left, with Paused), false resumes a held one (with Resumed).
// - Turn R19: A throwing raises its issue and the timer keeps its last reasons.
// - Turn R25: each key's issue is its own source. The first failure of the turn is its issue,
//   replacing the earlier one; with none, a check's issue clears only when that check ran clean
//   for that key; an accepted firing clears no check's issue. Schedules R5 replaces the rest: a
//   key leaving takes its issues, and the shown issue is the first failed outcome in check order.
// The reasons a present key reads: A when true; when A throws, the timer's last ones (a key that
// appears has none).
const NO_REASONS: ReadonlyArray<string> = [];

const reasonsOf = (row: KeyRow) => {
  if (row.a === "t") return ["A"] as const;

  if (row.a === "f" || row.change === "appear") return NO_REASONS;

  return LAST[row.start];
};

// Schedules R1: a refused start is tried again on every occasion, so a staying refused key
// starts like an appearing one.
const starts = (row: KeyRow) =>
  row.change === "appear" || (row.change === "stay" && row.start === "refused");

// A present key's issue, the first failed outcome in check order (Schedules R5): its arming when
// its start is refused, then A when it threw.
const issuesOf = (row: KeyRow) => {
  if (starts(row) && row.far) return [SLOT];

  if (row.a === "x") return [SLOT_A];

  return [];
};

const NONE = { timer: Option.none<TimerView>(), issues: [], evidence: [] };

// A new run from step one: held with its full delay, or due a delay from now.
const newRun = (key: Key, now: number, reasons: ReadonlyArray<string>) =>
  reasons.length > 0
    ? {
        timer: Option.some<TimerView>({ left: DELAY, pausedBy: reasons }),
        evidence: [[key, "Paused", reasons, DELAY] as const],
      }
    : { timer: Option.some<TimerView>({ dueAt: now + DELAY }), evidence: [] };

// A kept run: a running one held with what is left, a held one resumed from its left.
const keptRun = (
  key: Key,
  run: Option.Option<TimerView>,
  now: number,
  reasons: ReadonlyArray<string>,
) => {
  const held = reasons.length > 0;

  return Option.match(run, {
    onNone: () => ({ timer: Option.none<TimerView>(), evidence: [] }),
    onSome: (kept) => {
      if ("dueAt" in kept) {
        const left = kept.dueAt - now;

        return held
          ? {
              timer: Option.some<TimerView>({ left, pausedBy: reasons }),
              evidence: [[key, "Paused", reasons, left] as const],
            }
          : { timer: Option.some(kept), evidence: [] };
      }

      return held
        ? { timer: Option.some<TimerView>({ left: kept.left, pausedBy: reasons }), evidence: [] }
        : {
            timer: Option.some<TimerView>({ dueAt: now + kept.left }),
            evidence: [[key, "Resumed", now + kept.left] as const],
          };
    },
  });
};

// One key's part of the Outcome.
type KeyOutcome = {
  readonly timer: Option.Option<TimerView>;
  readonly issues: ReadonlyArray<string>;
  readonly evidence: ReadonlyArray<Seen>;
};

// RETURN_TYPE: KeyOutcome, whichever branch builds it.
const keyExpected = (key: Key, row: KeyRow, now: number, fired: boolean): KeyOutcome => {
  if (row.change === "absent") return NONE;

  // Schedules R5: a key that leaves takes its timer's issues with it.
  if (row.change === "leave") return NONE;

  const reasons = reasonsOf(row);
  const issues = issuesOf(row);

  if (starts(row)) return row.far ? { ...NONE, issues } : { ...newRun(key, now, reasons), issues };

  return { ...keptRun(key, fired ? Option.none() : RUN[row.start], now, reasons), issues };
};

// RETURN_TYPE: the Outcome a run is compared with.
const expected = (row: Row): Outcome => {
  const now = instantOf(row);
  const fired = (r: KeyRow) => row.turn === "firing" && runs(r.start);
  const k = keyExpected("k", row.k, now, fired(row.k));
  const j = keyExpected("j", row.j, now, fired(row.j));

  return {
    timers: {
      ...Option.match(k.timer, { onNone: () => ({}), onSome: (t) => ({ k: t }) }),
      ...Option.match(j.timer, { onNone: () => ({}), onSome: (t) => ({ j: t }) }),
    },
    issues: [...k.issues.map((s) => `k ${s}`), ...j.issues.map((s) => `j ${s}`)].toSorted(),
    // A keyed schedule's timers are decided in key-text order (Schedules representation).
    evidence: [...j.evidence, ...k.evidence],
  };
};

// ── the runs.

const present = (row: KeyRow) => row.change === "appear" || row.change === "stay";

// What a key's start writes at 0: present unless absent, its delay out of range when refused, A
// true when held and throwing when "running, A threw".
const START_FLAG = {
  absent: "f",
  running: "f",
  held: "t",
  refused: "f",
  "running, A threw": "x",
} as const satisfies Record<Start, Flag>;

const startOf = (row: Row) =>
  ({
    keys: KEYS.filter((key) => row[key].start !== "absent"),
    far: KEYS.filter((key) => row[key].start === "refused"),
    a: Object.fromEntries(KEYS.map((key) => [key, START_FLAG[row[key].start]])),
  }) satisfies typeof Pair.E.Set.Type;

const inputsOf = (row: Row) =>
  ({
    keys: KEYS.filter((key) => present(row[key])),
    far: KEYS.filter((key) => row[key].far),
    a: Object.fromEntries(KEYS.map((key) => [key, row[key].a])),
  }) satisfies typeof Pair.E.Set.Type;

// RETURN_TYPE: a literal-shaped name, as a machine with no input is named.
const nameOf = (n: number): `p${number}` => `p${n}`;

const refOf = (n: number) => actorRef(PairMachine, nameOf(n));

// One Story for a group of rows, each its own actor: every start at 0, then the writes at 10 s or
// the firings at 60 s.
const storyOf = (firing: boolean, rows: ReadonlyArray<Row>) => {
  const setup = runtimeSetup({ app: app({ id: "pair", machines: { p: PairMachine } }) });

  let story = Story.app(setup, {
    id: `table/pair/${firing ? "firing" : "write"}`,
    fixtures: [],
  }).checkpoint("start");

  for (const [n, row] of rows.entries()) {
    story = story.ensure(refOf(n)).send(refOf(n), Pair.E.Set(startOf(row)));

    if (firing) story = story.send(refOf(n), Pair.E.Queue(inputsOf(row)));
  }

  story = story.advance(firing ? "59999 millis" : "10 seconds").checkpoint("before");

  if (firing) story = story.advance("1 millis");
  else
    for (const [n, row] of rows.entries()) story = story.send(refOf(n), Pair.E.Set(inputsOf(row)));

  return story.checkpoint("after");
};

const indexOf = (run: StoryRun, checkpoint: string) =>
  run.trace.events.findIndex(
    (e) =>
      TraceRecord.$is("Step")(e.record) &&
      e.record.step._tag === "checkpoint" &&
      e.record.step.name === checkpoint,
  );

// FLOW_STATE_ALLOW_UNKNOWN: a key record as a snapshot or evidence shows it.
const idOf = (key: unknown) =>
  Predicate.hasProperty(key, "id") && Predicate.isString(key.id) ? key.id : "";

// FLOW_STATE_ALLOW_UNKNOWN: one timer as a snapshot shows it.
// RETURN_TYPE: the TimerView union, whichever branch builds it.
const viewOf = (one: unknown): Option.Option<TimerView> => {
  if (Predicate.hasProperty(one, "dueAt") && Predicate.isNumber(one.dueAt))
    return Option.some({ dueAt: one.dueAt });

  if (
    Predicate.hasProperty(one, "left") &&
    Predicate.isNumber(one.left) &&
    Predicate.hasProperty(one, "pausedBy") &&
    Array.isArray(one.pausedBy)
  )
    return Option.some({ left: one.left, pausedBy: Array.from<string>(one.pausedBy) });

  return Option.none();
};

// FLOW_STATE_ALLOW_UNKNOWN: a keyed schedule's list of timers, each with its key.
const timersByKey = (shown: unknown) =>
  Object.fromEntries(
    (Array.isArray(shown) ? Array.from<unknown>(shown) : []).flatMap((one) =>
      Predicate.hasProperty(one, "key")
        ? Option.toArray(viewOf(one)).map((view) => [idOf(one.key), view] as const)
        : [],
    ),
  );

// The key an issue's source names, read from its path's last part.
const issueKey = (path: ReadonlyArray<unknown>) => {
  const last = path.at(-1);
  const source = Predicate.isString(last) ? last : "";

  return KEYS.find((key) => source.includes(`"${key}"`)) ?? "-";
};

const outcomeOf = (run: StoryRun, n: number) => {
  const snapshot = run.end.read(refOf(n));
  const timers: unknown = timersOf(snapshot);
  const name = nameOf(n);

  const evidence = run.trace.events
    .slice(indexOf(run, "before"), indexOf(run, "after"))
    .flatMap<Seen>((e) => {
      if (!TraceRecord.$is("Runtime")(e.record)) return [];

      const record = e.record.evidence;

      if (record._tag === "Paused" && record.actor.name === name)
        return [
          [
            idOf(Option.getOrUndefined(record.key)) === "j" ? "j" : "k",
            "Paused",
            record.reasons,
            record.left,
          ] as const,
        ];

      if (record._tag === "Resumed" && record.actor.name === name)
        return [
          [
            idOf(Option.getOrUndefined(record.key)) === "j" ? "j" : "k",
            "Resumed",
            record.dueAt,
          ] as const,
        ];

      return [];
    });

  return {
    timers: timersByKey(Predicate.hasProperty(timers, "t") ? timers.t : undefined),
    issues: (snapshot?.issues ?? [])
      .flatMap((i) =>
        Predicate.hasProperty(i.details, "slot") && Predicate.isString(i.details.slot)
          ? [`${issueKey(i.path)} ${i.details.slot}`]
          : [],
      )
      .toSorted(),
    evidence,
  } satisfies Outcome;
};

describe("two keys of one keyed schedule in one turn (Turn R14, R16, R19, R25, R27)", () => {
  for (const firing of [false, true]) {
    const rows = ROWS.filter((row) => (row.turn === "firing") === firing);
    let played: Promise<StoryRun> | undefined;
    const runOnce = () => (played ??= storyOf(firing, rows).run().then(checked));

    describe(firing ? "the running key's firing" : "a write", () => {
      for (const [n, row] of rows.entries())
        it(titleOf(row), async () => {
          expect(outcomeOf(await runOnce(), n)).toEqual(expected(row));
        });
    });
  }
});

describe("an arming refused for one key across occasions (Schedules R5, R4)", () => {
  it("Schedules R5, R4: an arming refused for one key keeps its issue while that key stays unarmed, through another check's throw on it and that check's recovery", async () => {
    const ref = refOf(0);
    const keys = ["k", "j"];

    const run = await Story.app(
      runtimeSetup({ app: app({ id: "pair", machines: { p: PairMachine } }) }),
      { id: "table/pair/refused-kept", fixtures: [] },
    )
      .ensure(ref)
      .send(ref, Pair.E.Set({ keys, far: ["j"], a: {} }))
      .checkpoint("refused")
      .send(ref, Pair.E.Set({ keys, far: ["j"], a: { j: "x" } }))
      .send(ref, Pair.E.Set({ keys, far: ["j"], a: { j: "f" } }))
      .checkpoint("recovered")
      .run()
      .then(checked);

    const shown = (checkpoint: "refused" | "recovered") => {
      const snapshot = run.checkpoints[checkpoint].read(ref);
      const timers: unknown = timersOf(snapshot);

      return {
        timers: Object.keys(timersByKey(Predicate.hasProperty(timers, "t") ? timers.t : undefined)),
        issues: (snapshot?.issues ?? []).map((i) => [issueKey(i.path), i.details["slot"]]),
      };
    };

    expect([shown("refused"), shown("recovered")]).toEqual([
      { timers: ["k"], issues: [["j", SLOT]] },
      { timers: ["k"], issues: [["j", SLOT]] },
    ]);
  });
});

// Two keys stepped every minute by an Effect Schedule; j's send mapper throws on its first firing.
const Mapped = definition({
  id: "Table/Mapped",
  states: ["ON"],
  events: { Set: { keys: Schema.Array(Schema.String) } },
  internalEvents: { Tick: {} },
  memory: { keys: Flow.initial(Schema.Array(Schema.String), []) },
  schedules: { t: { key: { id: Schema.String } } },
});

const MappedMachine = machine(Mapped, ({ S, E }) => ({
  default: S.ON,
  on: {
    Set: { updateMemory: ({ event }) => ({ keys: event.keys }) },
    Tick: { updateMemory: ({ memory }) => ({ keys: memory.keys }) },
  },
  states: {
    ON: {
      schedules: {
        t: {
          keys: ({ memory }) => memory.keys.map((id) => ({ id })),
          schedule: Schedule.spaced("1 minute"),
          send: E.Tick.from(({ key, attempt }) => {
            if (key.id === "j" && attempt === 1) throw new Error("the firing cannot be mapped");

            return {};
          }),
        },
      },
    },
  },
}));

const mapped = actorRef(MappedMachine, "mapped");

const SEND_SLOT = "states.ON.schedules.t.send";

describe("a firing's own issues (Turn R25)", () => {
  it("Turn R25: a send mapper that throws raises its own key's issue; another key's accepted firing keeps it, and that key's next accepted firing clears it", async () => {
    const run = await Story.app(
      runtimeSetup({ app: app({ id: "mapped", machines: { mapped: MappedMachine } }) }),
      { id: "table/mapped", fixtures: [] },
    )
      .ensure(mapped)
      .send(mapped, Mapped.E.Set({ keys: ["k", "j"] }))
      .advance("1 minute")
      .checkpoint("first")
      .advance("1 minute")
      .checkpoint("second")
      .run()
      .then(checked);

    const issues = (checkpoint: "first" | "second") =>
      (run.checkpoints[checkpoint].read(mapped)?.issues ?? []).map((i) => [
        issueKey(i.path),
        i.details["slot"],
      ]);

    expect([issues("first"), issues("second")]).toEqual([[["j", SEND_SLOT]], []]);
  });
});
