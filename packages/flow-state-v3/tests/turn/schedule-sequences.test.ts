import { Predicate, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { layerIndexedDb } from "../../src/host/persistence.ts";
import { Fake, Step, Story, type StoryRun } from "../../src/host/testing/index.ts";
import { actorRef, app, definition, Flow, machine, runtimeSetup } from "../../src/index.ts";
import { loose } from "../../src/test/loose.ts";
import { breachesOf } from "../rules/rules.ts";
import { timersOf } from "../timers.ts";
import { ATOMS, type Atom, FIRST, type View, viewsOf, type World } from "./schedule-ledger.ts";
import { WRONG_TODAY } from "./schedule-sequences-wrong.ts";

// Every sequence of three steps on one two-key schedule, each step's timers, issues and firings
// checked against the ledger of owed firings and owed issues (schedule-ledger.ts), which is taken
// from Turn R14 to R17, R19, R25 and R27 and WriteAhead R4, never from a run.

const Flag = Schema.Literals(["t", "f", "x"]);

const Written = {
  keys: Schema.Array(Schema.Literals(["bad", "good"])),
  keysThrow: Schema.Boolean,
  a: Schema.Struct({ bad: Flag, good: Flag }),
  far: Schema.Boolean,
  sel: Schema.Number,
  selThrow: Schema.Boolean,
  refuse: Schema.Boolean,
};

// The fixture's definition, with pause reason A declared or, as a later build edits it, none.
const pairOf = <const P extends ReadonlyArray<string>>(pausedBy: P) =>
  definition({
    id: "Sequences/Pair",
    persist: true,
    states: ["ON"],
    events: { Set: Written, Stop: {}, Reenter: {} },
    internalEvents: { Tick: { id: Schema.String } },
    memory: {
      keys: Flow.initial(Written.keys, FIRST.keys),
      keysThrow: Flow.initial(Schema.Boolean, FIRST.keysThrow),
      a: Flow.initial(Written.a, FIRST.a),
      far: Flow.initial(Schema.Boolean, FIRST.far),
      sel: Flow.initial(Schema.Number, FIRST.sel),
      selThrow: Flow.initial(Schema.Boolean, FIRST.selThrow),
      refuse: Flow.initial(Schema.Boolean, FIRST.refuse),
      ticks: Flow.initial(Schema.Array(Schema.String), []),
    },
    schedules: {
      t: { key: { id: Schema.Literals(["bad", "good"]) }, pausedBy, restartOn: Schema.Number },
    },
  });

const DELAY = 60_000;

const unreadable = (what: string) => {
  throw new Error(`${what} cannot be read`);
};

const flag = (value: "t" | "f" | "x") => (value === "x" ? unreadable("the reason") : value === "t");

const Pair = pairOf(["A"]);

// The fixture's schedule, with pause reason A or, as a later build edits it, none.
const Paused = machine(Pair, ({ S, E }) => ({
  default: S.ON,
  on: {
    Set: {
      updateMemory: ({ event }) => ({
        keys: event.keys,
        keysThrow: event.keysThrow,
        a: event.a,
        far: event.far,
        sel: event.sel,
        selThrow: event.selThrow,
        refuse: event.refuse,
      }),
    },
    Tick: {
      updateMemory: ({ event, memory }) =>
        memory.refuse ? unreadable("the firing") : { ticks: [...memory.ticks, event.id] },
    },
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
          restartOn: ({ memory }) => (memory.selThrow ? unreadable("the selection") : memory.sel),
          disarmOn: [E.Stop],
          paused: {
            A: ({ key, memory }) => flag(key.id === "bad" ? memory.a.bad : memory.a.good),
          },
        },
      },
    },
  },
}));

// The later build, typed as the build it edits, as the same app's next release is: its
// declaration drops the pause reason.
const Plain: typeof Paused = loose(
  machine(pairOf([]), ({ S, E }) => ({
    default: S.ON,
    on: {
      Set: {
        updateMemory: ({ event }) => ({
          keys: event.keys,
          keysThrow: event.keysThrow,
          a: event.a,
          far: event.far,
          sel: event.sel,
          selThrow: event.selThrow,
          refuse: event.refuse,
        }),
      },
      Tick: {
        updateMemory: ({ event, memory }) =>
          memory.refuse ? unreadable("the firing") : { ticks: [...memory.ticks, event.id] },
      },
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
            restartOn: ({ memory }) => (memory.selThrow ? unreadable("the selection") : memory.sel),
            disarmOn: [E.Stop],
          },
        },
      },
    },
  })),
);

const setupOf = (withPause: boolean) =>
  runtimeSetup({
    app: app({ id: "sequences", machines: { pair: withPause ? Paused : Plain } }),
    services: layerIndexedDb(),
    scope: "sequences",
    persistence: { captureMs: 0 },
  });

// ── the sequences.

const LETTERS = "abcdefghijklmnopqrst";

type Sequence = { readonly letters: string; readonly atoms: ReadonlyArray<Atom> };

const SEQUENCES: ReadonlyArray<Sequence> = ATOMS.flatMap((x, i) =>
  ATOMS.flatMap((y, j) =>
    ATOMS.map((z, k) => ({
      letters: [i, j, k].map((n) => LETTERS.charAt(n)).join(""),
      atoms: [x, y, z],
    })),
  ),
);

const titleOf = (s: Sequence) => s.atoms.map((a) => a.title).join(" / ");

const wrongToday = (s: Sequence) =>
  (WRONG_TODAY.get(s.letters.slice(0, 2)) ?? "").includes(s.letters.slice(2));

// The worlds a sequence writes, one per step: a write's after the previous one.
const worldsOf = (atoms: ReadonlyArray<Atom>) => {
  const worlds: Array<World> = [];
  let world = FIRST;

  for (const atom of atoms) {
    world = atom.kind === "write" ? atom.write(world) : world;
    worlds.push(world);
  }

  return worlds;
};

// How a step moves the shared clock: a write, Stop and a re-entry wait ten seconds first, so no
// timer is due before the next minute; a reload moves none.
type Move = "turn" | "minute" | "reload" | "edited";

// RETURN_TYPE: the Move union a group's pattern is keyed by.
const moveOf = (atom: Atom): Move => {
  if (atom.kind === "minute" || atom.kind === "reload" || atom.kind === "edited") return atom.kind;

  return "turn";
};

const MS = { turn: 10_000, minute: DELAY, reload: 0, edited: 0 } as const;

// Sequences share a Story, one actor each, when their steps move the clock alike.
const patternOf = (s: Sequence) => s.atoms.map(moveOf).join(",");

const GROUPS = Map.groupBy(SEQUENCES, patternOf);

const refOf = (withPause: boolean, n: number) =>
  actorRef(withPause ? Paused : Plain, `s${String(n)}`);

const eventOf = (atom: Atom, world: World) => {
  switch (atom.kind) {
    case "write":
      return Pair.E.Set(world);
    case "stop":
      return Pair.E.Stop();
    case "reenter":
      return Pair.E.Reenter();
    case "minute":
    case "reload":
    case "edited":
      return undefined;
  }
};

// The steps of positions `from` to `to` of a group, each closed by its checkpoint `s<position>`.
const stepsOf = (
  withPause: boolean,
  group: ReadonlyArray<Sequence>,
  moves: ReadonlyArray<Move>,
  from: number,
) => {
  const base = Story.app(setupOf(withPause), { id: "sequences", fixtures: [] });

  return moves.slice(from).flatMap((move, offset) => {
    const at = from + offset;

    const acted =
      move === "turn"
        ? group.reduce((story, s, n) => {
            const atom = s.atoms[at];

            const event =
              atom === undefined ? undefined : eventOf(atom, worldsOf(s.atoms)[at] ?? FIRST);

            return event === undefined ? story : story.send(refOf(withPause, n), event);
          }, base).steps
        : [];

    const moved =
      move === "reload" || move === "edited"
        ? [Step.reload({ reattach: true, heldWrites: "abort" })]
        : [Step.advance({ duration: MS[move] })];

    return [...moved, ...acted, Step.checkpoint({ name: `s${String(at)}` })];
  });
};

const ensured = (withPause: boolean, size: number) =>
  Array.from({ length: size }, (_, n) => n).reduce(
    (story, n) => story.ensure(refOf(withPause, n)),
    Story.app(setupOf(withPause), { id: "sequences", fixtures: [] }),
  ).steps;

const END = [Step.advance({ duration: "10 minutes" }), Step.checkpoint({ name: "end" })];

// One group's runs: under the build with `paused` up to its first reload without it, then, from
// that reload on, under the edited build over the records the first run saved.
const runsOf = async (group: ReadonlyArray<Sequence>, moves: ReadonlyArray<Move>) => {
  const edit = moves.indexOf("edited");
  const story = Story.app(setupOf(true), { id: "sequences", fixtures: [] });
  const until = edit === -1 ? moves : moves.slice(0, edit);

  const first = await story.run({
    steps: [
      ...ensured(true, group.length),
      ...stepsOf(true, group, until, 0),
      ...(edit === -1 ? END : [Step.checkpoint({ name: "saved" })]),
    ],
  });

  if (edit === -1) return { runs: [first], breaches: breachesOf(first) };

  const saved = first.checkpoints["saved"]?.records.stored ?? new Map<string, string>();
  const elapsed = until.reduce((sum, move) => sum + MS[move], 0);

  const second = await Story.app(setupOf(false), { id: "sequences-edited", fixtures: [] }).run({
    steps: [
      Step.world({ words: [...saved].map(([key, text]) => Fake.storage.put(key, text)) }),
      Step.advance({ duration: elapsed }),
      Step.reload({ reattach: true, heldWrites: "abort" }),
      ...ensured(false, group.length),
      Step.checkpoint({ name: `s${String(edit)}` }),
      ...stepsOf(false, group, moves, edit + 1),
      ...END,
    ],
  });

  return { runs: [first, second], breaches: [...breachesOf(first), ...breachesOf(second)] };
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

// FLOW_STATE_ALLOW_UNKNOWN: one timer as a snapshot shows it.
const shownOf = (one: unknown) => {
  if (!Predicate.hasProperty(one, "key")) return [];

  if (Predicate.hasProperty(one, "dueAt")) return [`${idOf(one.key)} due`];

  if (Predicate.hasProperty(one, "left")) return [`${idOf(one.key)} held`];

  return [];
};

// The key an issue's source names, read from its path's last part; `-` for none.
const issueKey = (path: ReadonlyArray<unknown>) => {
  const last = path.at(-1);
  const source = Predicate.isString(last) ? last : "";

  return ["bad", "good"].find((key) => source.includes(`"${key}"`)) ?? "-";
};

// The run that holds a checkpoint: the first run's under the build with `paused`, the second's
// under the edited one.
const cutOf = (runs: ReadonlyArray<StoryRun<string>>, name: string) =>
  runs.flatMap((run, r) => {
    const cut = run.checkpoints[name];

    return cut === undefined ? [] : [{ cut, withPause: r === 0 }];
  })[0];

const shown = (runs: ReadonlyArray<StoryRun<string>>, n: number, name: string, ticked: number) => {
  const at = cutOf(runs, name);
  const snapshot = at?.cut.read(refOf(at.withPause, n));
  const timers: unknown = timersOf(snapshot);
  const list: unknown = Predicate.hasProperty(timers, "t") ? timers.t : [];
  const ticks = snapshot?.memory.ticks ?? [];

  return {
    view: {
      timers: (Array.isArray(list) ? Array.from<unknown>(list) : []).flatMap(shownOf).toSorted(),
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
const viewsShown = (runs: ReadonlyArray<StoryRun<string>>, n: number) =>
  ["s0", "s1", "s2", "end"].reduce<{ views: ReadonlyArray<View>; ticked: number }>(
    (acc, name) => {
      const next = shown(runs, n, name, acc.ticked);

      return { views: [...acc.views, next.view], ticked: next.ticked };
    },
    { views: [], ticked: 0 },
  ).views;

describe("every three-step sequence on one two-key schedule (Turn R14 to R17, R19, R25, R27; WriteAhead R4)", () => {
  for (const [pattern, group] of GROUPS) {
    const moves = (group[0]?.atoms ?? []).map(moveOf);
    let played: Promise<Played> | undefined;
    const runOnce = () => (played ??= runsOf(group, moves));

    describe(pattern, () => {
      for (const [n, s] of group.entries())
        (wrongToday(s) ? it.fails : it)(
          titleOf(s),
          async () => {
            const once = await runOnce();

            expect({ views: viewsShown(once.runs, n), breaches: breachesFor(once, n) }).toEqual({
              views: viewsOf(s.atoms),
              breaches: [],
            });
          },
          60_000,
        );
    });
  }
});
