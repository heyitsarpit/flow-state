import { Option, Predicate, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { Story, type StoryRun } from "../../src/host/testing/index.ts";
import { TraceRecord } from "../../src/host/trace.ts";
import { actorRef, app, definition, Flow, machine, runtimeSetup } from "../../src/index.ts";
import { checked } from "../rules/rules.ts";
import { timersOf } from "../timers.ts";
import { WRONG_TODAY } from "./schedule-table-wrong.ts";

// Every same-turn combination of one schedule's inputs, each row's expected outcome derived from
// Turn R14 to R17, R19, R25 and R27, never from a run: a one-minute schedule `t` with pause
// reasons A and B whose flags are true, false or throwing, a `restartOn` selection that stays,
// changes or throws, and, keyed, one key that appears, stays or leaves.

const Flag = Schema.Literals(["t", "f", "x"]);

type Flag = typeof Flag.Type;

const Inputs = { a: Flag, b: Flag, sel: Schema.Number, keys: Schema.Array(Schema.String) };

type Inputs = {
  readonly a: Flag;
  readonly b: Flag;
  readonly sel: number;
  readonly keys: ReadonlyArray<string>;
};

const Table = definition({
  id: "Table/Schedule",
  states: ["ON"],
  events: {
    Set: Inputs,
    Go: Inputs,
    Stop: Inputs,
    Reenter: Inputs,
    ReenterStop: Inputs,
    Queue: Inputs,
  },
  internalEvents: { Tick: {} },
  memory: {
    a: Flow.initial(Flag, "f"),
    b: Flow.initial(Flag, "f"),
    sel: Flow.initial(Schema.Number, 0),
    keys: Flow.initial(Schema.Array(Schema.String), []),
    na: Flow.initial(Flag, "f"),
    nb: Flow.initial(Flag, "f"),
    nsel: Flow.initial(Schema.Number, 0),
    nkeys: Flow.initial(Schema.Array(Schema.String), []),
  },
});

type Memory = Inputs & {
  readonly na: Flag;
  readonly nb: Flag;
  readonly nsel: number;
  readonly nkeys: ReadonlyArray<string>;
};

const flag = (value: Flag) => {
  if (value === "x") throw new Error("the reason cannot be read");

  return value === "t";
};

const selection = (sel: number) => {
  if (sel < 0) throw new Error("the selection cannot be read");

  return sel;
};

const written = ({ event }: { readonly event: Inputs }) => ({
  a: event.a,
  b: event.b,
  sel: event.sel,
  keys: event.keys,
});

const queued = ({ event }: { readonly event: Inputs }) => ({
  na: event.a,
  nb: event.b,
  nsel: event.sel,
  nkeys: event.keys,
});

const ticked = ({ memory }: { readonly memory: Memory }) => ({
  a: memory.na,
  b: memory.nb,
  sel: memory.nsel,
  keys: memory.nkeys,
});

const ROOT = {
  Set: { updateMemory: written },
  Go: { updateMemory: written },
  Stop: { updateMemory: written },
  Queue: { updateMemory: queued },
  Tick: { updateMemory: ticked },
};

const EntryTable = machine(Table, ({ S, E }) => ({
  default: S.ON,
  on: ROOT,
  states: {
    ON: {
      on: {
        Reenter: { target: S.ON, updateMemory: written },
        ReenterStop: { target: S.ON, updateMemory: written },
      },
      schedules: {
        t: {
          schedule: "1 minute",
          send: E.Tick,
          armOn: [Flow.entry],
          restartOn: ({ memory }) => selection(memory.sel),
          disarmOn: [E.Stop, E.ReenterStop],
          paused: { A: ({ memory }) => flag(memory.a), B: ({ memory }) => flag(memory.b) },
        },
      },
    },
  },
}));

const ArmOnTable = machine(Table, ({ S, E }) => ({
  default: S.ON,
  on: ROOT,
  states: {
    ON: {
      on: {
        Reenter: { target: S.ON, updateMemory: written },
        ReenterStop: { target: S.ON, updateMemory: written },
      },
      schedules: {
        t: {
          schedule: "1 minute",
          send: E.Tick,
          armOn: [E.Go],
          disarmOn: [E.Stop, E.ReenterStop],
          paused: { A: ({ memory }) => flag(memory.a), B: ({ memory }) => flag(memory.b) },
        },
      },
    },
  },
}));

const PlainTable = machine(Table, ({ S, E }) => ({
  default: S.ON,
  on: ROOT,
  states: {
    ON: {
      on: {
        Reenter: { target: S.ON, updateMemory: written },
        ReenterStop: { target: S.ON, updateMemory: written },
      },
      schedules: {
        t: {
          schedule: "1 minute",
          send: E.Tick,
          disarmOn: [E.Stop, E.ReenterStop],
          paused: { A: ({ memory }) => flag(memory.a), B: ({ memory }) => flag(memory.b) },
        },
      },
    },
  },
}));

const KeyedTable = machine(Table, ({ S, E }) => ({
  default: S.ON,
  on: ROOT,
  states: {
    ON: {
      on: {
        Reenter: { target: S.ON, updateMemory: written },
        ReenterStop: { target: S.ON, updateMemory: written },
      },
      schedules: {
        t: Flow.keyed({
          keys: ({ memory }) => memory.keys.map((id) => ({ id })),
          schedule: "1 minute",
          send: E.Tick,
          restartOn: ({ memory }) => selection(memory.sel),
          disarmOn: [E.Stop, E.ReenterStop],
          paused: { A: ({ memory }) => flag(memory.a), B: ({ memory }) => flag(memory.b) },
        }),
      },
    },
  },
}));

// ── rows.

type Kind = "entry" | "armOn" | "plain" | "keyed";

const MACHINES = { entry: EntryTable, armOn: ArmOnTable, plain: PlainTable, keyed: KeyedTable };

type Before = "absent" | "idle" | "running" | "held" | "running, A threw";

type KeyChange = "appear" | "stay" | "leave";

// The row's turn: a write that arms nothing, Go, Stop, a re-entry, a re-entry by Stop's peer
// ReenterStop, or the timer's firing.
type Turn = "write" | "go" | "stop" | "reenter" | "reenter, stop" | "firing";

type Restart = "same" | "changed" | "throws";

type Row = {
  readonly kind: Kind;
  readonly before: Before;
  readonly key: KeyChange;
  readonly turn: Turn;
  readonly restart: Restart;
  readonly a: Flag;
  readonly b: Flag;
};

const hasRestart = (kind: Kind) => kind === "entry" || kind === "keyed";

const FLAGS: ReadonlyArray<Flag> = ["t", "f", "x"];

const KEPT: ReadonlyArray<Before> = ["idle", "running", "held", "running, A threw"];

const TURNS = ["write", "stop", "reenter", "reenter, stop", "firing"] as const;

const ARMED_BY_GO: ReadonlyArray<Turn> = ["go", ...TURNS];

const turnsOf = (kind: Kind) => (kind === "armOn" ? ARMED_BY_GO : TURNS);

const RESTARTS: ReadonlyArray<Restart> = ["same", "changed", "throws"];

const UNCHANGED: ReadonlyArray<Restart> = ["same"];

const keptWith = (key: KeyChange) => KEPT.map((before) => ({ before, key }));

// A keyed key that appears starts absent; the others start with the key.
const startsOf = (kind: Kind) =>
  kind === "keyed"
    ? [
        { before: "absent" as const, key: "appear" as const },
        ...keptWith("stay"),
        ...keptWith("leave"),
      ]
    : keptWith("stay");

// Only a running timer comes due.
const comesDue = (before: Before) => before === "running" || before === "running, A threw";

const rowsOf = (kind: Kind) =>
  startsOf(kind).flatMap(({ before, key }) =>
    turnsOf(kind)
      .filter((turn) => turn !== "firing" || comesDue(before))
      .flatMap((turn) =>
        (hasRestart(kind) ? RESTARTS : UNCHANGED).flatMap((restart) =>
          FLAGS.flatMap((a) =>
            FLAGS.map((b) => ({ kind, before, key, turn, restart, a, b }) satisfies Row),
          ),
        ),
      ),
  );

const titleOf = (row: Row) => {
  const parts = [
    row.kind,
    row.kind === "keyed" ? `${row.before}, key ${row.key}s` : row.before,
    row.turn === "firing" ? "firing due" : row.turn,
  ];

  if (hasRestart(row.kind)) parts.push(`restartOn ${row.restart}`);

  return [...parts, `A ${row.a}`, `B ${row.b}`].join(" / ");
};

// ── the expected outcome, from the Spec.

const DELAY = 60_000;

const SLOT = "states.ON.schedules.t";

const SLOTS = {
  A: `${SLOT}.paused.A`,
  B: `${SLOT}.paused.B`,
  restartOn: `${SLOT}.restartOn`,
} as const;

type TimerView =
  | { readonly dueAt: number }
  | { readonly left: number; readonly pausedBy: ReadonlyArray<string> };

type Seen = readonly ["Paused", ReadonlyArray<string>, number] | readonly ["Resumed", number];

type Outcome = {
  readonly timer: Option.Option<TimerView>;
  readonly issues: ReadonlyArray<string>;
  readonly evidence: ReadonlyArray<Seen>;
};

const instantOf = (row: Row) => (row.turn === "firing" ? DELAY : 10_000);

// The timer each start leaves before the row's turn (Turn R14, R27): armed at 0, held from 0 by A.
const BEFORE = {
  absent: Option.none<TimerView>(),
  idle: Option.none<TimerView>(),
  running: Option.some<TimerView>({ dueAt: DELAY }),
  held: Option.some<TimerView>({ left: DELAY, pausedBy: ["A"] }),
  "running, A threw": Option.some<TimerView>({ dueAt: DELAY }),
} as const satisfies Record<Before, Option.Option<TimerView>>;

const disarms = (row: Row) => row.turn === "stop" || row.turn === "reenter, stop";

const reenters = (row: Row) => row.turn === "reenter" || row.turn === "reenter, stop";

// Turn R14, R16: the turn starts a new run from step one: entry arms every kind but armOn, a key
// arms when it appears, Go arms, and a changed selection restarts (or re-arms) a timer past its
// activating turn; a disarming turn starts none.
const startsRun = (row: Row) => {
  const activating = reenters(row) || row.key === "appear";
  const restarted = hasRestart(row.kind) && row.restart === "changed" && !activating;

  const arms =
    (reenters(row) && row.kind !== "armOn") ||
    (row.key === "appear" && row.kind === "keyed") ||
    (row.kind === "armOn" && row.turn === "go");

  return !disarms(row) && (arms || restarted);
};

// The run the turn leaves untouched: none when it disarmed, exited or fired it.
const keptRun = (row: Row) =>
  disarms(row) || reenters(row) || row.turn === "firing" ? Option.none() : BEFORE[row.before];

const heldBy = (before: Option.Option<TimerView>) =>
  Option.match(before, {
    onNone: () => [],
    onSome: (timer) => ("pausedBy" in timer ? timer.pausedBy : []),
  });

// Turn R27, R19: the reasons in declaration order; the first that throws raises its issue and the
// timer keeps its last reasons.
const reasonsOf = (row: Row) => {
  if (row.a === "x") return { reasons: heldBy(BEFORE[row.before]), raised: [SLOTS.A] };

  if (row.b === "x") return { reasons: heldBy(BEFORE[row.before]), raised: [SLOTS.B] };

  const active: Array<string> = [];

  if (row.a === "t") active.push("A");

  if (row.b === "t") active.push("B");

  return { reasons: active, raised: [] };
};

// Turn R27: a new run held holds its full delay; a running one holds what is left; a held one
// whose reasons all clear resumes from its left. A change of reasons while held records nothing.
const timerAfter = (row: Row, reasons: ReadonlyArray<string>) => {
  const now = instantOf(row);
  const held = reasons.length > 0;

  if (startsRun(row))
    return held
      ? {
          timer: Option.some<TimerView>({ left: DELAY, pausedBy: reasons }),
          evidence: [["Paused", reasons, DELAY] as const],
        }
      : { timer: Option.some<TimerView>({ dueAt: now + DELAY }), evidence: [] };

  return Option.match(keptRun(row), {
    onNone: () => ({ timer: Option.none<TimerView>(), evidence: [] }),
    onSome: (kept) => {
      if ("dueAt" in kept) {
        const left = kept.dueAt - now;

        return held
          ? {
              timer: Option.some<TimerView>({ left, pausedBy: reasons }),
              evidence: [["Paused", reasons, left] as const],
            }
          : { timer: Option.some(kept), evidence: [] };
      }

      return held
        ? { timer: Option.some<TimerView>({ left: kept.left, pausedBy: reasons }), evidence: [] }
        : {
            timer: Option.some<TimerView>({ dueAt: now + kept.left }),
            evidence: [["Resumed", now + kept.left] as const],
          };
    },
  });
};

/**
 * The row's expected outcome:
 *
 * - Turn R14: a disarming turn leaves the schedule disarmed: no entry arming, no key arming and no
 *   restart; a changed selection becomes its baseline silently. Exit stops it; entry arms it from
 *   step one when its kind arms on entry, once, beside restartOn. Go arms it from step one,
 *   restarting it. A Duration that fired is done.
 * - Turn R16: a key appearing arms; leaving cancels; a selection changed after a committed turn
 *   restarts from step one (re-arming a disarmed or done timer); the activating turn and a key's
 *   first appearance only take a baseline. The order is keys, restartOn, paused.
 * - Turn R27: after each committed turn the reasons run, in declaration order, for each timer of
 *   the active schedule, armed or idle; true holds an armed one, false resumes it.
 * - Turn R19: a check that throws raises one issue (the first in check order) and keeps its
 *   previous value: a selection keeps its baseline, a reason keeps the timer's last reasons.
 * - Turn R25: the issue A raised clears only when A ran and succeeded and no check raised another.
 */
// RETURN_TYPE: the Outcome a run is compared with, whichever branch builds it.
const expected = (row: Row): Outcome => {
  const prior = row.before === "running, A threw" ? [SLOTS.A] : [];

  if (row.key === "leave") return { timer: Option.none(), issues: prior, evidence: [] };

  const selected = hasRestart(row.kind) && row.restart === "throws" ? [SLOTS.restartOn] : [];
  const paused = reasonsOf(row);
  const raised = [...selected, ...paused.raised];

  return { ...timerAfter(row, paused.reasons), issues: raised.slice(0, 1) };
};

// ── the runs.

const NONE: Inputs = { a: "f", b: "f", sel: 0, keys: [] };

const WITH_KEY: ReadonlyArray<string> = ["k"];

const SEL = { same: 0, changed: 1, throws: -1 } as const;

// The inputs the row's turn writes.
const inputsOf = (row: Row) =>
  ({
    a: row.a,
    b: row.b,
    sel: SEL[row.restart],
    keys: row.kind === "keyed" && row.key !== "leave" ? WITH_KEY : [],
  }) satisfies Inputs;

// The event a turn or a start sends.
const eventOf = (turn: Turn | "queue", inputs: Inputs) => {
  if (turn === "go") return Table.E.Go(inputs);

  if (turn === "stop") return Table.E.Stop(inputs);

  if (turn === "reenter") return Table.E.Reenter(inputs);

  if (turn === "reenter, stop") return Table.E.ReenterStop(inputs);

  if (turn === "queue") return Table.E.Queue(inputs);

  return Table.E.Set(inputs);
};

// What each start sends at 0, after the ensure: an armOn timer is armed by Go, a keyed one by its
// key; idle is then disarmed, held paused by A, and "running, A threw" meets A throwing.
const preludeOf = (row: Row) => {
  const keys = row.kind === "keyed" && row.before !== "absent" ? WITH_KEY : [];
  const base = { ...NONE, keys };
  const sent: Array<readonly [Turn | "queue", Inputs]> = [];

  if (row.kind === "armOn" && row.before !== "idle") sent.push(["go", base]);

  if (row.kind === "keyed" && row.before !== "absent") sent.push(["write", base]);

  if (row.before === "idle") sent.push(["stop", base]);

  if (row.before === "held") sent.push(["write", { ...base, a: "t" }]);

  if (row.before === "running, A threw") sent.push(["write", { ...base, a: "x" }]);

  if (row.turn === "firing") sent.push(["queue", inputsOf(row)]);

  return sent;
};

// RETURN_TYPE: a literal-shaped name, as a machine with no input is named.
const nameOf = (n: number): `r${number}` => `r${n}`;

const REFS = {
  entry: (name: `r${number}`) => actorRef(EntryTable, name),
  armOn: (name: `r${number}`) => actorRef(ArmOnTable, name),
  plain: (name: `r${number}`) => actorRef(PlainTable, name),
  keyed: (name: `r${number}`) => actorRef(KeyedTable, name),
};

const refOf = (row: Row, n: number) => REFS[row.kind](nameOf(n));

// One Story for a group of rows, each row its own actor: every start at 0, then the rows' turns
// at 10 s, or their firings at 60 s.
const storyOf = (kind: Kind, firing: boolean, rows: ReadonlyArray<Row>) => {
  const setup = runtimeSetup({ app: app({ id: "table", machines: { t: MACHINES[kind] } }) });

  let story = Story.app(setup, {
    id: `table/${kind}/${firing ? "firing" : "turn"}`,
    fixtures: [],
  }).checkpoint("start");

  for (const [n, row] of rows.entries()) {
    story = story.ensure(refOf(row, n));

    for (const [turn, inputs] of preludeOf(row))
      story = story.send(refOf(row, n), eventOf(turn, inputs));
  }

  story = story.advance(firing ? "59999 millis" : "10 seconds").checkpoint("before");

  if (firing) story = story.advance("1 millis");
  else
    for (const [n, row] of rows.entries())
      story = story.send(refOf(row, n), eventOf(row.turn, inputsOf(row)));

  return story.checkpoint("after");
};

const indexOf = (run: StoryRun, checkpoint: string) =>
  run.trace.events.findIndex(
    (e) =>
      TraceRecord.$is("Step")(e.record) &&
      e.record.step._tag === "checkpoint" &&
      e.record.step.name === checkpoint,
  );

// FLOW_STATE_ALLOW_UNKNOWN: one timer as a snapshot shows it, a keyed schedule's first key's.
const viewOf = (shown: unknown) => {
  const one: unknown = Array.isArray(shown) ? Array.from<unknown>(shown)[0] : shown;

  if (Predicate.hasProperty(one, "dueAt") && Predicate.isNumber(one.dueAt))
    return Option.some<TimerView>({ dueAt: one.dueAt });

  if (
    Predicate.hasProperty(one, "left") &&
    Predicate.isNumber(one.left) &&
    Predicate.hasProperty(one, "pausedBy") &&
    Array.isArray(one.pausedBy)
  )
    return Option.some<TimerView>({ left: one.left, pausedBy: Array.from<string>(one.pausedBy) });

  return Option.none<TimerView>();
};

const outcomeOf = (run: StoryRun, row: Row, n: number) => {
  const snapshot = run.end.read(refOf(row, n));
  const timers: unknown = timersOf(snapshot);
  const name = nameOf(n);

  const evidence = run.trace.events
    .slice(indexOf(run, "before"), indexOf(run, "after"))
    .flatMap<Seen>((e) => {
      if (!TraceRecord.$is("Runtime")(e.record)) return [];

      const record = e.record.evidence;

      if (record._tag === "Paused" && record.actor.name === name)
        return [["Paused", record.reasons, record.left] as const];

      if (record._tag === "Resumed" && record.actor.name === name)
        return [["Resumed", record.dueAt] as const];

      return [];
    });

  return {
    timer: viewOf(Predicate.hasProperty(timers, "t") ? timers.t : undefined),
    issues: (snapshot?.issues ?? []).flatMap((i) =>
      Predicate.hasProperty(i.details, "slot") && Predicate.isString(i.details.slot)
        ? [i.details.slot]
        : [],
    ),
    evidence,
  } satisfies Outcome;
};

const KINDS: ReadonlyArray<Kind> = ["entry", "armOn", "plain", "keyed"];

describe("one schedule's same-turn inputs (Turn R14 to R17, R19, R25, R27)", () => {
  for (const kind of KINDS)
    for (const firing of [false, true]) {
      const rows = rowsOf(kind).filter((row) => (row.turn === "firing") === firing);
      let played: Promise<StoryRun> | undefined;
      const runOnce = () => (played ??= storyOf(kind, firing, rows).run().then(checked));

      describe(`${kind}, ${firing ? "a firing due" : "a turn"}`, () => {
        for (const [n, row] of rows.entries())
          (WRONG_TODAY.has(titleOf(row)) ? it.fails : it)(titleOf(row), async () => {
            expect(outcomeOf(await runOnce(), row, n)).toEqual(expected(row));
          });
      });
    }
});
