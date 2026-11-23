import { Option, Predicate, Schedule, Schema, Struct } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { layerIndexedDb } from "../../src/host/persistence.ts";
import { Fake, Step, Story, type StoryRun } from "../../src/host/testing/index.ts";
import { actorRef, app, definition, Flow, machine, runtimeSetup } from "../../src/index.ts";
import { loose } from "../../src/test/loose.ts";
import { breachesOf } from "../rules/rules.ts";
import { timersOf } from "../timers.ts";
import {
  ATOMS,
  type Atom,
  type Build,
  FIRST,
  NAMED_ATOMS,
  type View,
  viewsOf,
  type World,
} from "./schedule-ledger.ts";

// Every sequence of three steps on one machine with a two-key schedule `t` and an unkeyed series
// `u`, each step's timers, issues and firings checked against the ledger of owed firings and owed
// issues (schedule-ledger.ts), which is taken from Schedules R1 to R14 and its tables, never from
// a run; and the named deeper rows of Schedules T4.

const Flag = Schema.Literals(["t", "f", "x"]);

const Written = {
  keys: Schema.Array(Schema.Literals(["bad", "good"])),
  keysThrow: Schema.Boolean,
  a: Schema.Struct({ bad: Flag, good: Flag }),
  far: Schema.Boolean,
  sel: Schema.Number,
  selThrow: Schema.Boolean,
  refuse: Schema.Boolean,
  b: Schema.Boolean,
  bump: Schema.Boolean,
};

// The dial whose state the selection reads as context.
const Dial = definition({
  id: "Sequences/Dial",
  persist: true,
  states: ["LOW", "HIGH"],
  events: { Flip: {} },
});

const DialMachine = machine(Dial, ({ S }) => ({
  default: S.LOW,
  states: { LOW: { on: { Flip: S.HIGH } }, HIGH: { on: { Flip: S.LOW } } },
}));

const dial = actorRef(DialMachine, "dial");

const DIAL_RECORD = "actor/Sequences/Dial/dial";

// The fixture's definition, with the pause reasons each build declares.
const pairOf = <const P extends ReadonlyArray<string>, const Q extends ReadonlyArray<string>>(
  forT: P,
  forU: Q,
) =>
  definition({
    id: "Sequences/Pair",
    persist: true,
    states: ["ON"],
    events: { Set: Written, Stop: Written, Reenter: {}, Go: {} },
    internalEvents: { Tick: { id: Schema.String } },
    memory: {
      keys: Flow.initial(Written.keys, FIRST.keys),
      keysThrow: Flow.initial(Schema.Boolean, FIRST.keysThrow),
      a: Flow.initial(Written.a, FIRST.a),
      far: Flow.initial(Schema.Boolean, FIRST.far),
      sel: Flow.initial(Schema.Number, FIRST.sel),
      selThrow: Flow.initial(Schema.Boolean, FIRST.selThrow),
      refuse: Flow.initial(Schema.Boolean, FIRST.refuse),
      b: Flow.initial(Schema.Boolean, FIRST.b),
      bump: Flow.initial(Schema.Boolean, FIRST.bump),
      ticks: Flow.initial(Schema.Array(Schema.String), []),
    },
    context: { dial: Flow.context(Dial.state) },
    schedules: {
      t: {
        key: { id: Schema.Literals(["bad", "good"]) },
        pausedBy: forT,
        restartOn: Schema.Number,
      },
      u: { pausedBy: forU },
    },
  });

const DELAY = 60_000;

const unreadable = (what: string) => {
  throw new Error(`${what} cannot be read`);
};

const flag = (value: "t" | "f" | "x") => (value === "x" ? unreadable("the reason") : value === "t");

const Pair = pairOf(["A"], ["B"]);

type Memory = typeof Pair.Memory.Type;

// A firing's send: refused while sends are, and writing the selection while sends do.
const ticked = (memory: Memory, id: string) => {
  if (memory.refuse) return unreadable("the firing");

  return { ticks: [...memory.ticks, id], sel: memory.bump ? memory.sel + 1 : memory.sel };
};

const offsetOf = (high: boolean) => (high ? 1000 : 0);

const selectionOf = (memory: Memory, high: boolean) =>
  memory.selThrow ? unreadable("the selection") : memory.sel + offsetOf(high);

// The event a write or a `Stop` sends: the world without the dial, which is not memory.
const fieldsOf = (world: World) => Struct.omit(world, ["dial"]);

// `u`'s series: two steps of a minute each.
const TWO_STEPS = Schedule.max([Schedule.spaced("1 minute"), Schedule.recurs(2)]);

// The first build: reasons A on `t` and B on `u`.
const Paused = machine(Pair, ({ S, E }) => ({
  default: S.ON,
  on: {
    Set: { updateMemory: ({ event }) => event },
    Stop: { updateMemory: ({ event }) => event },
    Tick: { updateMemory: ({ memory, event }) => ticked(memory, event.id) },
  },
  states: {
    ON: {
      on: { Reenter: { target: S.ON } },
      schedules: {
        t: {
          keys: ({ memory }) =>
            memory.keysThrow ? unreadable("keys") : memory.keys.map((id) => ({ id })),
          schedule: ({ key, memory }) => (key.id === "bad" && memory.far ? 2 ** 31 : DELAY),
          send: E.Tick.from(({ key }) => ({ id: String(key.id) })),
          restartOn: ({ memory, context }) => selectionOf(memory, context.dial === "HIGH"),
          disarmOn: [E.Stop],
          paused: {
            A: ({ key, memory }) => flag(key.id === "bad" ? memory.a.bad : memory.a.good),
          },
        },
        u: {
          schedule: TWO_STEPS,
          send: E.Tick.from(() => ({ id: "u" })),
          armOn: [E.Go],
          disarmOn: [E.Stop],
          paused: { B: ({ memory }) => memory.b },
        },
      },
    },
  },
}));

// A later build, typed as the build it edits, as the same app's next release is: `t`'s reason
// named `forT` or none, and `u`'s B kept or dropped.
const editedOf = (forT: ReadonlyArray<string>, forU: ReadonlyArray<string>) =>
  loose(
    machine(pairOf(forT, forU), ({ S, E }) => ({
      default: S.ON,
      on: {
        Set: { updateMemory: ({ event }) => event },
        Stop: { updateMemory: ({ event }) => event },
        Tick: { updateMemory: ({ memory, event }) => ticked(memory, event.id) },
      },
      states: {
        ON: {
          on: { Reenter: { target: S.ON } },
          schedules: {
            t: loose({
              keys: ({ memory }: { memory: Memory }) =>
                memory.keysThrow ? unreadable("keys") : memory.keys.map((id) => ({ id })),
              schedule: ({ key, memory }: { key: { id: string }; memory: Memory }) =>
                key.id === "bad" && memory.far ? 2 ** 31 : DELAY,
              send: E.Tick.from(loose(({ key }: { key: { id: string } }) => ({ id: key.id }))),
              restartOn: ({ memory, context }: { memory: Memory; context: { dial: string } }) =>
                selectionOf(memory, context.dial === "HIGH"),
              disarmOn: [E.Stop],
              paused: Object.fromEntries(
                forT.map((r) => [
                  r,
                  ({ key, memory }: { key: { id: string }; memory: Memory }) =>
                    flag(key.id === "bad" ? memory.a.bad : memory.a.good),
                ]),
              ),
            }),
            u: loose({
              schedule: TWO_STEPS,
              send: E.Tick.from(() => ({ id: "u" })),
              armOn: [E.Go],
              disarmOn: [E.Stop],
              paused: Object.fromEntries(
                forU.map((r) => [r, ({ memory }: { memory: Memory }) => memory.b]),
              ),
            }),
          },
        },
      },
    })),
  );

const BUILDS: Readonly<Record<Build, typeof Paused>> = {
  paused: Paused,
  plain: editedOf([], []),
  renamed: editedOf(["Z"], ["B"]),
};

const setupOf = (build: Build) =>
  runtimeSetup({
    app: app({
      id: "sequences",
      machines: { dial: DialMachine, pair: { machine: BUILDS[build], context: { dial } } },
    }),
    services: layerIndexedDb(),
    scope: "sequences",
    persistence: { captureMs: 0 },
  });

// ── the sequences.

const LETTERS = "abcdefghijklmnopqrstuvwxyzA";

type Sequence = { readonly letters: string; readonly atoms: ReadonlyArray<Atom> };

const sequenceOf = (letters: string) => ({
  letters,
  atoms: letters.split("").flatMap((letter) => {
    const atom = ATOMS[LETTERS.indexOf(letter)] ?? NAMED_ATOMS.get(letter);

    return atom === undefined ? [] : [atom];
  }),
});

// The named rows of Schedules T4 and its review, by letter: a baseline kept across a reload
// (`plsk`); a first clean read after a throw taken silently (`lapk`); a committed firing that
// leaves another key's send issue in place (`nroa`); the send's issue shown ahead of a refused
// start (`anrbk`); and a firing whose send writes the selection, restarting the other key, due
// with it, through its own turn (`ak#r%`).
const NAMED = ["plsk", "lapk", "nroa", "anrbk", "ak#r%"];

const SEQUENCES: ReadonlyArray<Sequence> = [
  ...LETTERS.split("").flatMap((x) =>
    LETTERS.split("").flatMap((y) => LETTERS.split("").map((z) => sequenceOf(`${x}${y}${z}`))),
  ),
  ...NAMED.map(sequenceOf),
];

const titleOf = (s: Sequence) => s.atoms.map((a) => a.title).join(" / ");

// The worlds a sequence writes, one per step: a write's after the previous one.
const worldsOf = (atoms: ReadonlyArray<Atom>) => {
  const worlds: Array<World> = [];
  let world = FIRST;

  for (const atom of atoms) {
    world = atom.kind === "write" || atom.kind === "stop" ? atom.write(world) : world;
    worlds.push(world);
  }

  return worlds;
};

// How a step moves the shared clock and the shared dial: a turn and the dial's flip wait ten
// seconds first, so no timer is due before the next minute; a reload moves none. A reload under an
// edited build, or after the dial turned while the page was closed, starts the next run.
type Move = "turn" | "context" | "minute" | "reload" | "plain" | "renamed" | "away";

// The move of each kind of step, a reload by the build it leaves in force.
const MOVES: Readonly<Record<Exclude<Atom["kind"], "edited">, Move>> = {
  write: "turn",
  stop: "turn",
  reenter: "turn",
  go: "turn",
  context: "context",
  minute: "minute",
  reload: "reload",
  away: "away",
};

const EDITS: Readonly<Record<Build, Move>> = {
  paused: "reload",
  plain: "plain",
  renamed: "renamed",
};

const moveOf = (atom: Atom) => (atom.kind === "edited" ? EDITS[atom.build] : MOVES[atom.kind]);

const MS = {
  turn: 10_000,
  context: 10_000,
  minute: DELAY,
  reload: 0,
  plain: 0,
  renamed: 0,
  away: 0,
} as const;

const splits = (move: Move) => move === "plain" || move === "renamed" || move === "away";

// Sequences share a Story, one actor each, when their steps move the clock and the dial alike.
const patternOf = (s: Sequence) => s.atoms.map(moveOf).join(",");

const GROUPS = Map.groupBy(SEQUENCES, patternOf);

const refOf = (build: Build, n: number) => actorRef(BUILDS[build], `s${String(n)}`);

// The event each kind of step that is a turn sends, from the world it writes.
const EVENTS = new Map<Atom["kind"], (world: World) => typeof Pair.Event.Type>([
  ["write", (world) => Pair.E.Set(fieldsOf(world))],
  ["stop", (world) => Pair.E.Stop(fieldsOf(world))],
  ["reenter", () => Pair.E.Reenter()],
  ["go", () => Pair.E.Go()],
]);

const eventOf = (atom: Atom, world: World) =>
  Option.map(Option.fromUndefinedOr(EVENTS.get(atom.kind)), (event) => event(world));

// The sends of one step: each actor's own event on a turn, the dial's flip on a context change.
const actedOf = (
  base: ReturnType<typeof Story.app>,
  build: Build,
  group: ReadonlyArray<Sequence>,
  move: Move,
  at: number,
) => {
  if (move === "context") return base.send(dial, Dial.E.Flip()).steps;

  if (move !== "turn") return [];

  return group.reduce((story, s, n) => {
    const atom = s.atoms[at];

    const event = Option.flatMap(Option.fromUndefinedOr(atom), (a) =>
      eventOf(a, worldsOf(s.atoms)[at] ?? FIRST),
    );

    return Option.match(event, {
      onNone: () => story,
      onSome: (e) => story.send(refOf(build, n), e),
    });
  }, base).steps;
};

// The steps of positions `from` up to `to` of a group, each closed by its checkpoint `s<position>`.
const stepsOf = (
  build: Build,
  group: ReadonlyArray<Sequence>,
  moves: ReadonlyArray<Move>,
  from: number,
  to: number,
) => {
  const base = Story.app(setupOf(build), { id: "sequences", fixtures: [] });

  return moves.slice(from, to).flatMap((move, offset) => {
    const at = from + offset;

    const acted = actedOf(base, build, group, move, at);

    const moved = move === "reload" ? [Step.reload({ reattach: true, heldWrites: "abort" })] : [];

    const waited = MS[move] === 0 ? [] : [Step.advance({ duration: MS[move] })];

    return [...waited, ...moved, ...acted, Step.checkpoint({ name: `s${String(at)}` })];
  });
};

const ensured = (build: Build, size: number) =>
  Array.from({ length: size }, (_, n) => n).reduce(
    (story, n) => story.ensure(refOf(build, n)),
    Story.app(setupOf(build), { id: "sequences", fixtures: [] }).ensure(dial),
  ).steps;

const END = [Step.advance({ duration: "10 minutes" }), Step.checkpoint({ name: "end" })];

const LOW = '"state":"LOW"';
const HIGH = '"state":"HIGH"';

// The dial's record with its state turned.
const turned = (text: string) =>
  text.includes(LOW) ? text.replace(LOW, HIGH) : text.replace(HIGH, LOW);

// The records a run saved, the dial's state turned when the page was closed while it changed.
const carried = (stored: ReadonlyMap<string, string>, away: boolean) =>
  [...stored].map(([key, text]) =>
    Fake.storage.put(key, away && key === DIAL_RECORD ? turned(text) : text),
  );

// How a run after the first opens: the records the run before saved, the clock where it stood, a
// reload, and its checkpoint.
const reopened = (
  build: Build,
  size: number,
  stored: ReadonlyMap<string, string>,
  moves: ReadonlyArray<Move>,
  from: number,
) => [
  Step.world({ words: carried(stored, moves[from] === "away") }),
  Step.advance({ duration: moves.slice(0, from).reduce((sum, m) => sum + MS[m], 0) }),
  Step.reload({ reattach: true, heldWrites: "abort" }),
  ...ensured(build, size),
  Step.checkpoint({ name: `s${String(from)}` }),
];

type Segment = { readonly run: StoryRun<string>; readonly build: Build };

// One group's runs: under the first build up to its first reload that edits the build or turns
// the dial, then from each such reload on, under the build it leaves in force, over the records the
// run before saved.
const runsOf = async (group: ReadonlyArray<Sequence>, moves: ReadonlyArray<Move>) => {
  const cuts = moves.flatMap((move, at) => (splits(move) ? [at] : []));
  const segments: Array<Segment> = [];
  let build: Build = "paused";
  let stored: ReadonlyMap<string, string> = new Map();

  for (const [n, from] of [-1, ...cuts].entries()) {
    const to = cuts[n] ?? moves.length;
    const move = moves[from];

    build = move === "plain" || move === "renamed" ? move : build;

    const opening =
      from === -1
        ? ensured(build, group.length)
        : reopened(build, group.length, stored, moves, from);

    const run = await Story.app(setupOf(build), { id: `sequences-${String(n)}`, fixtures: [] }).run(
      {
        steps: [
          ...opening,
          ...stepsOf(build, group, moves, from + 1, to),
          ...(to === moves.length ? END : [Step.checkpoint({ name: "saved" })]),
        ],
      },
    );

    segments.push({ run, build });
    stored = run.checkpoints["saved"]?.records.stored ?? new Map<string, string>();
  }

  return { segments, breaches: segments.flatMap((s) => breachesOf(s.run)) };
};

type Played = Awaited<ReturnType<typeof runsOf>>;

// The run rules' breaches that name one sequence's actor, or no actor of the fixture.
const breachesFor = (played: Played, n: number) =>
  played.breaches.filter(
    (b) => !/Sequences\/Pair\/s\d/.test(b) || new RegExp(`Sequences/Pair/s${String(n)}\\b`).test(b),
  );

// ── what a run shows.

// FLOW_STATE_ALLOW_UNKNOWN: a key record as a snapshot shows it.
const idOf = (key: unknown) =>
  Predicate.hasProperty(key, "id") && Predicate.isString(key.id) ? key.id : "";

// FLOW_STATE_ALLOW_UNKNOWN: one timer as a snapshot shows it, under its key or name.
const shownOf = (name: string, one: unknown) => {
  if (Predicate.hasProperty(one, "dueAt")) return [`${name} due`];

  if (Predicate.hasProperty(one, "left")) return [`${name} held`];

  return [];
};

// FLOW_STATE_ALLOW_UNKNOWN: one keyed timer as a snapshot shows it.
const keyedOf = (one: unknown) =>
  Predicate.hasProperty(one, "key") ? shownOf(idOf(one.key), one) : [];

// The timer an issue's source names, read from its path's last part: a key of `t`, `u`, or `-`.
const issueKey = (path: ReadonlyArray<unknown>) => {
  const last = path.at(-1);
  const source = Predicate.isString(last) ? last : "";

  if (source === "schedule u") return "u";

  return ["bad", "good"].find((key) => source.includes(`"${key}"`)) ?? "-";
};

// The segment that holds a checkpoint.
const cutOf = (segments: ReadonlyArray<Segment>, name: string) =>
  segments.flatMap((s) => {
    const cut = s.run.checkpoints[name];

    return cut === undefined ? [] : [{ cut, build: s.build }];
  })[0];

const shown = (segments: ReadonlyArray<Segment>, n: number, name: string, ticked: number) => {
  const at = cutOf(segments, name);
  const snapshot = at === undefined ? undefined : at.cut.read(refOf(at.build, n));
  const timers: unknown = timersOf(snapshot);
  const list: unknown = Predicate.hasProperty(timers, "t") ? timers.t : [];
  const single: unknown = Predicate.hasProperty(timers, "u") ? timers.u : undefined;
  const ticks = snapshot?.memory.ticks ?? [];

  return {
    view: {
      timers: [
        ...(Array.isArray(list) ? Array.from<unknown>(list) : []).flatMap(keyedOf),
        ...shownOf("u", single),
      ].toSorted(),
      issues: (snapshot?.issues ?? [])
        .flatMap((i) =>
          Predicate.hasProperty(i.details, "slot") && Predicate.isString(i.details.slot)
            ? [`${issueKey(i.path)} ${i.details.slot}`]
            : [],
        )
        .toSorted(),
      fired: ticks.slice(ticked).toSorted(),
    } satisfies View,
    ticked: ticks.length,
  };
};

// Each step's view, then the end's, in order.
const viewsShown = (segments: ReadonlyArray<Segment>, n: number, steps: number) =>
  [...Array.from({ length: steps }, (_, at) => `s${String(at)}`), "end"].reduce<{
    views: ReadonlyArray<View>;
    ticked: number;
  }>(
    (acc, name) => {
      const next = shown(segments, n, name, acc.ticked);

      return { views: [...acc.views, next.view], ticked: next.ticked };
    },
    { views: [], ticked: 0 },
  ).views;

describe("every three-step sequence on two schedules, and the named deeper rows (Schedules R1 to R14, T2, T3, T4)", () => {
  for (const [pattern, group] of GROUPS) {
    const moves = (group[0]?.atoms ?? []).map(moveOf);
    let played: Promise<Played> | undefined;
    const runOnce = () => (played ??= runsOf(group, moves));

    describe(pattern, () => {
      for (const [n, s] of group.entries())
        it(
          titleOf(s),
          async () => {
            const once = await runOnce();

            expect({
              views: viewsShown(once.segments, n, s.atoms.length),
              breaches: breachesFor(once, n),
            }).toEqual({
              views: viewsOf(s.atoms),
              breaches: [],
            });
          },
          120_000,
        );
    });
  }
});
