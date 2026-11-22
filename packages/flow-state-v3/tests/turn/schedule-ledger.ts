import { Equal, Option } from "effect";

// The ledger of one keyed schedule's owed firings and owed issues over a sequence of occasions,
// each step taken from Schedules R1 to R14 and its tables, never from a run. The schedule `t` is
// keyed by `good` and `bad`, one minute each, with one pause reason A per key, a `restartOn`
// selection read for every key, `disarmOn: [Stop]`, and `bad`'s delay out of range while `far` is
// set. Every check keeps its last outcome on its own timer, so an issue is a failed last outcome:
// it changes only when that check runs again, or an arming start settles the firing's, and goes
// with its timer (Schedules R5). The record holds each timer whole, so a reload re-reads only the
// level checks and a selection with no baseline (Schedules R3, R14).

export type Flag = "t" | "f" | "x";

/**
 * The two keys, in code-unit order, the order equal deadlines fire in (Schedules R12).
 */
export const KEYS = ["bad", "good"] as const;

export type KeyName = (typeof KEYS)[number];

/**
 * What the schedule's functions read: the keys listed, or `keys` throwing; each key's reason A;
 * whether `bad`'s delay is out of range; the `restartOn` selection, or it throwing; and whether a
 * firing's send turn is refused.
 */
export type World = {
  readonly keys: ReadonlyArray<KeyName>;
  readonly keysThrow: boolean;
  readonly a: Readonly<Record<KeyName, Flag>>;
  readonly far: boolean;
  readonly sel: number;
  readonly selThrow: boolean;
  readonly refuse: boolean;
};

/**
 * The world at creation: `good` alone, every check clean.
 */
export const FIRST: World = {
  keys: ["good"],
  keysThrow: false,
  a: { bad: "f", good: "f" },
  far: false,
  sel: 0,
  selThrow: false,
  refuse: false,
};

type Plain = "stop" | "reenter" | "minute" | "reload" | "edited";

/**
 * One step of a sequence: a write that changes one part of the world, `Stop`, a re-entry, a
 * minute passing, a reload under the same build, or a reload under the build without `paused`.
 */
export type Atom =
  | { readonly kind: "write"; readonly title: string; readonly write: (w: World) => World }
  | { readonly kind: Plain; readonly title: string };

const written = (title: string, write: (w: World) => World) =>
  ({ kind: "write", title, write }) as const;

const both: ReadonlyArray<KeyName> = ["bad", "good"];

const reason = (key: KeyName, flag: Flag) =>
  written(`A ${key} ${{ t: "true", f: "false", x: "throws" }[flag]}`, (w) => ({
    ...w,
    a: { ...w.a, [key]: flag },
  }));

/**
 * Every step a sequence draws from.
 */
export const ATOMS: ReadonlyArray<Atom> = [
  written("bad appears", (w) => ({ ...w, keys: both, keysThrow: false, far: false })),
  written("bad appears out of range", (w) => ({ ...w, keys: both, keysThrow: false, far: true })),
  written("bad leaves", (w) => ({ ...w, keys: ["good"], keysThrow: false })),
  written("keys throw", (w) => ({ ...w, keysThrow: true })),
  reason("good", "t"),
  reason("good", "f"),
  reason("good", "x"),
  reason("bad", "t"),
  reason("bad", "f"),
  reason("bad", "x"),
  written("selection changes", (w) => ({ ...w, sel: w.sel + 1, selThrow: false })),
  written("selection throws", (w) => ({ ...w, selThrow: true })),
  written("selection reads again", (w) => ({ ...w, selThrow: false })),
  written("sends refused", (w) => ({ ...w, refuse: true })),
  written("sends accepted", (w) => ({ ...w, refuse: false })),
  { kind: "stop", title: "Stop" },
  { kind: "reenter", title: "re-entry" },
  { kind: "minute", title: "a minute passes" },
  { kind: "reload", title: "reload" },
  { kind: "edited", title: "reload without paused" },
];

type Arming = "idle" | "refused" | "armed";

// One timer: its arming, the reasons it last read true, its baseline, and whether each of its
// checks failed last: `restartOn`, the pause reasons, and its last firing's send.
type Timer = {
  readonly key: KeyName;
  readonly arming: Arming;
  readonly reasons: ReadonlyArray<string>;
  readonly baseline: Option.Option<number>;
  readonly selFailed: boolean;
  readonly reasonFailed: boolean;
  readonly firingFailed: boolean;
};

/**
 * The ledger: the world, whether the build declares `paused`, whether `keys` failed last, and
 * each listed key's timer.
 */
export type Ledger = {
  readonly world: World;
  readonly paused: boolean;
  readonly keysFailed: boolean;
  readonly timers: ReadonlyArray<Timer>;
};

// One occasion: the world it reads; whether its state exited (and entered again); whether its
// event is the schedule's `disarmOn`; whether it is a committed turn (`Turn`), which compares
// `restartOn`; and the firing it carries, refused or not. Anything else is `Settled` (a refused
// firing) or `Wake` (a reload), which compare only a timer with no baseline.
type Occasion = {
  readonly world: World;
  readonly exited: boolean;
  readonly disarmed: boolean;
  readonly committed: boolean;
  readonly firing: Option.Option<{ readonly key: KeyName; readonly refused: boolean }>;
};

type Working = { readonly timer: Timer; readonly start: boolean };

const held = (t: Timer) => t.arming === "armed" && t.reasons.length > 0;

// Schedules R11, R13 and tables Keys and Firing: exit removes every timer, and a re-entered
// state's new timers inherit nothing; a firing ends its Duration and its send's outcome is the
// timer's last firing; `keys` that throw keep the timers; a listed key new to the schedule is a
// new timer, armed from step one, with reasons `[]`. A refused start is tried again on every
// occasion (Schedules R1). A reload keeps every saved outcome (Schedules R3).
// RETURN_TYPE: each branch's literal arming stays the Arming union.
const keyed = (l: Ledger, o: Occasion): ReadonlyArray<Working> => {
  const carried = (o.exited ? [] : l.timers).map((t) => {
    const fired = Option.exists(o.firing, (f) => f.key === t.key);

    return {
      timer: fired
        ? {
            ...t,
            arming: "idle" as const,
            firingFailed: Option.exists(o.firing, (f) => f.refused),
          }
        : t,
      start: t.arming === "refused",
    };
  });

  if (o.world.keysThrow) return carried;

  return o.world.keys.map((key) => {
    const kept = carried.find((w) => w.timer.key === key);

    if (kept !== undefined) return kept;

    return {
      timer: {
        key,
        arming: "idle",
        reasons: [],
        baseline: Option.none(),
        selFailed: false,
        reasonFailed: false,
        firingFailed: false,
      },
      start: true,
    };
  });
};

// Schedules R2, R7 and table Selection: a committed turn compares `restartOn` for every timer, and
// any other occasion only for a timer with no baseline; a first clean read is a silent baseline,
// a changed one restarts unless the turn disarms; a throw keeps the baseline and fails the check.
// RETURN_TYPE: each branch's literal arming stays the Arming union.
const selected = (w: Working, o: Occasion): Working => {
  if (!o.committed && Option.isSome(w.timer.baseline)) return w;

  if (o.world.selThrow) return { ...w, timer: { ...w.timer, selFailed: true } };

  const changed = Option.exists(w.timer.baseline, (b) => !Equal.equals(b, o.world.sel));

  return {
    ...w,
    timer: { ...w.timer, baseline: Option.some(o.world.sel), selFailed: false },
    start: w.start || (o.committed && changed && !o.disarmed),
  };
};

// Schedules R11 and tables Arming and Firing: a disarming turn leaves every timer idle and starts
// none; a start arms from step one, or is refused while `bad`'s delay is out of range; an arming
// that succeeds clears the last firing's failure.
// RETURN_TYPE: each branch's literal arming stays the Arming union.
const armed = (w: Working, o: Occasion): Timer => {
  if (o.disarmed) return { ...w.timer, arming: "idle" };

  if (!w.start) return w.timer;

  return w.timer.key === "bad" && o.world.far
    ? { ...w.timer, arming: "refused" }
    : { ...w.timer, arming: "armed", firingFailed: false };
};

// Schedules R4, R6, R14 and table Reasons: every occasion reads each timer's reasons, armed or idle; A true holds, false
// frees, a throw keeps the last reasons and fails the check. A build without `paused` reads none.
// RETURN_TYPE: each branch's literal reasons stay a list of names.
const reasoned = (t: Timer, l: Ledger, o: Occasion): Timer => {
  if (!l.paused) return { ...t, reasons: [], reasonFailed: false };

  const flag = o.world.a[t.key];

  if (flag === "x") return { ...t, reasonFailed: true };

  return { ...t, reasons: flag === "t" ? ["A"] : [], reasonFailed: false };
};

// RETURN_TYPE: the Ledger contract a reduce over steps carries.
const decided = (l: Ledger, o: Occasion): Ledger => ({
  ...l,
  world: o.world,
  keysFailed: o.world.keysThrow,
  timers: keyed(l, o).map((w) => reasoned(armed(selected(w, o), o), l, o)),
});

const turn = (world: World) =>
  ({
    world,
    exited: false,
    disarmed: false,
    committed: true,
    firing: Option.none(),
  }) satisfies Occasion;

/**
 * The ledger at creation: the entry arms `good` (Schedules R13, table Arming).
 */
export const CREATED: Ledger = decided(
  { world: FIRST, paused: true, keysFailed: false, timers: [] },
  { ...turn(FIRST), exited: true },
);

// Schedules R12: every armed, unheld timer is due within a minute and fires once, each a
// separate turn: a committed one is a `Turn`, a refused one `Settled`, which compares only a
// selection with no baseline.
const minute = (l: Ledger) => {
  const due = l.timers.filter((t) => t.arming === "armed" && !held(t)).map((t) => t.key);
  const refused = l.world.refuse;

  return {
    ledger: due.reduce(
      (acc, key) =>
        decided(acc, {
          ...turn(acc.world),
          committed: !refused,
          firing: Option.some({ key, refused }),
        }),
      l,
    ),
    fired: refused ? [] : due,
  };
};

const restored = (l: Ledger, paused: boolean) =>
  decided({ ...l, paused }, { ...turn(l.world), committed: false });

/**
 * One step: the ledger after it, and the keys whose firings committed in it.
 */
export const stepped = (l: Ledger, atom: Atom) => {
  switch (atom.kind) {
    case "write":
      return { ledger: decided(l, turn(atom.write(l.world))), fired: [] };
    case "stop":
      return { ledger: decided(l, { ...turn(l.world), disarmed: true }), fired: [] };
    case "reenter":
      return { ledger: decided(l, { ...turn(l.world), exited: true }), fired: [] };
    case "minute":
      return minute(l);
    case "reload":
      return { ledger: restored(l, l.paused), fired: [] };
    case "edited":
      return { ledger: restored(l, false), fired: [] };
  }
};

/**
 * The slots a schedule issue names: `keys`, `restartOn`, the arming's delay, reason A, and the
 * send's turn.
 */
export const SLOTS = {
  keys: "states.ON.schedules.t.keys",
  restartOn: "states.ON.schedules.t.restartOn",
  arming: "states.ON.schedules.t.schedule",
  reason: "states.ON.schedules.t.paused.A",
  send: "on.Tick[0].updateMemory",
} as const;

/**
 * What a step shows: each armed timer, due or held; each source's issue as `key slot` (`-` for
 * `keys`); and the keys whose firings committed in the step.
 */
export type View = {
  readonly timers: ReadonlyArray<string>;
  readonly issues: ReadonlyArray<string>;
  readonly fired: ReadonlyArray<string>;
};

// Schedules R5 and `scheduleIssues`: one issue per source, the first failed outcome in check order: the last firing, then
// `restartOn`, then the arming, then the reasons.
const issueOf = (t: Timer) => {
  const failed = [
    t.firingFailed ? [SLOTS.send] : [],
    t.selFailed ? [SLOTS.restartOn] : [],
    t.arming === "refused" ? [SLOTS.arming] : [],
    t.reasonFailed ? [SLOTS.reason] : [],
  ].flat();

  return failed.slice(0, 1).map((slot) => `${t.key} ${slot}`);
};

/**
 * The view a ledger owes.
 */
export const viewOf = (l: Ledger, fired: ReadonlyArray<string>) => {
  const timers = l.timers.flatMap(issueOf);

  return {
    timers: l.timers
      .filter((t) => t.arming === "armed")
      .map((t) => `${t.key} ${held(t) ? "held" : "due"}`),
    issues: (l.keysFailed ? [`- ${SLOTS.keys}`, ...timers] : timers).toSorted(),
    fired: fired.toSorted(),
  } satisfies View;
};

/**
 * The views a sequence owes: one after each step, then one after the clock runs out, when every
 * armed, unheld timer fires once (Schedules R12).
 */
export const viewsOf = (atoms: ReadonlyArray<Atom>) => {
  const views: Array<View> = [];
  let ledger = CREATED;

  for (const atom of atoms) {
    const next = stepped(ledger, atom);

    views.push(viewOf(next.ledger, next.fired));
    ledger = next.ledger;
  }

  const end = minute(ledger);

  views.push(viewOf(end.ledger, end.fired));

  return views;
};
