import { Equal, Option } from "effect";

// The ledger of one machine's owed firings and owed issues over a sequence of occasions, each step
// taken from Schedules R1 to R14 and its tables, never from a run. Schedule `t` is keyed by `good`
// and `bad`, one minute each, with one pause reason A per key, a `restartOn` selection read for
// every key from memory and the dial's context, `disarmOn: [Stop]`, and `bad`'s delay out of range
// while `far` is set. Schedule `u` is unkeyed, armed by `Go`, a two-step series of one minute each,
// held by reason B and disarmed by `Stop`. Every check keeps its last outcome on its own timer, so
// an issue is a failed last outcome: it changes only when that check runs again, or an arming
// start settles the firing's, and goes with its timer (Schedules R5). The record holds each timer
// whole, so a reload re-reads only the level checks and a selection with no baseline (Schedules R3,
// R14); the owner raises `Context` after a wake when the dial differs from what the scope last
// heard (Schedules R3, the lifecycle table).

export type Flag = "t" | "f" | "x";

/**
 * The two keys, in code-unit order, the order equal deadlines fire in (Schedules R12).
 */
export const KEYS = ["bad", "good"] as const;

export type KeyName = (typeof KEYS)[number];

/**
 * What the schedules' functions read: the keys listed, or `keys` throwing; each key's reason A;
 * whether `bad`'s delay is out of range; the `restartOn` selection, or it throwing; whether a
 * firing's send turn is refused; reason B of `u`; whether a committed send writes the selection;
 * and the dial's state, which the selection reads as context.
 */
export type World = {
  readonly keys: ReadonlyArray<KeyName>;
  readonly keysThrow: boolean;
  readonly a: Readonly<Record<KeyName, Flag>>;
  readonly far: boolean;
  readonly sel: number;
  readonly selThrow: boolean;
  readonly refuse: boolean;
  readonly b: boolean;
  readonly bump: boolean;
  readonly dial: boolean;
};

/**
 * The world at creation: `good` alone, every check clean, the dial low.
 */
export const FIRST: World = {
  keys: ["good"],
  keysThrow: false,
  a: { bad: "f", good: "f" },
  far: false,
  sel: 0,
  selThrow: false,
  refuse: false,
  b: false,
  bump: false,
  dial: false,
};

/**
 * Which build a step runs under: the first, with reasons A and B; the one without `paused`; and
 * the one with A renamed Z. An edited build stays in force for the rest of its row.
 */
export type Build = "paused" | "plain" | "renamed";

/**
 * One step of a sequence: a write that changes one part of the world; a `Stop` that writes as it
 * disarms; a re-entry; `Go`, which arms `u`; the dial turned; a minute passing; a reload under the
 * same build, under an edited build, or after the dial turned while the page was closed.
 */
export type Atom =
  | { readonly kind: "write" | "stop"; readonly title: string; readonly write: (w: World) => World }
  | {
      readonly kind: "reenter" | "go" | "context" | "minute" | "reload" | "away";
      readonly title: string;
    }
  | { readonly kind: "edited"; readonly title: string; readonly build: Build };

const written = (title: string, write: (w: World) => World) =>
  ({ kind: "write", title, write }) as const;

const stopped = (title: string, write: (w: World) => World) =>
  ({ kind: "stop", title, write }) as const;

const both: ReadonlyArray<KeyName> = ["bad", "good"];

const reason = (key: KeyName, flag: Flag) =>
  written(`A ${key} ${{ t: "true", f: "false", x: "throws" }[flag]}`, (w) => ({
    ...w,
    a: { ...w.a, [key]: flag },
  }));

/**
 * Every step a sequence draws from, by letter from `a`.
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
  stopped("Stop", (w) => w),
  { kind: "reenter", title: "re-entry" },
  { kind: "minute", title: "a minute passes" },
  { kind: "reload", title: "reload" },
  { kind: "edited", title: "reload without paused", build: "plain" },
  { kind: "context", title: "context changes the selection" },
  stopped("Stop with a changed selection", (w) => ({ ...w, sel: w.sel + 1, selThrow: false })),
  stopped("Stop while bad appears", (w) => ({ ...w, keys: both, keysThrow: false, far: false })),
  { kind: "edited", title: "reload with A renamed", build: "renamed" },
  { kind: "away", title: "reload after the context changed while away" },
  { kind: "go", title: "Go arms u" },
  written("B true", (w) => ({ ...w, b: true })),
];

/**
 * Steps only the named rows draw from, by letter.
 */
export const NAMED_ATOMS: ReadonlyMap<string, Atom> = new Map([
  ["#", written("sends write the selection", (w) => ({ ...w, bump: true }))],
  ["%", written("sends keep the selection", (w) => ({ ...w, bump: false }))],
]);

type Arming = "idle" | "refused" | "armed";

// One timer of `t`: its arming, the reasons it last read true, its baseline, whether each of its
// checks failed last (`restartOn`, the pause reasons, and its last firing's send), and how many
// starts armed it, which tells a queued firing of an older arming apart.
type Timer = {
  readonly key: KeyName;
  readonly arming: Arming;
  readonly reasons: ReadonlyArray<string>;
  readonly baseline: Option.Option<number>;
  readonly selFailed: boolean;
  readonly reasonFailed: boolean;
  readonly firingFailed: boolean;
  readonly epoch: number;
};

// The one timer of `u`: its arming, the step its run is at (0 before its first firing), the
// reasons it last read true and whether its last firing's send failed.
type Single = {
  readonly armed: boolean;
  readonly step: number;
  readonly reasons: ReadonlyArray<string>;
  readonly firingFailed: boolean;
};

/**
 * The ledger: the world, the build, whether `keys` failed last, each listed key's timer of `t`,
 * and `u`'s timer.
 */
export type Ledger = {
  readonly world: World;
  readonly build: Build;
  readonly keysFailed: boolean;
  readonly timers: ReadonlyArray<Timer>;
  readonly u: Single;
};

// The firing an occasion carries, refused or not: a key of `t`, or `u`.
type Fired = { readonly of: KeyName | "u"; readonly refused: boolean };

// One occasion: the world it reads; whether its state exited (and entered again); whether its
// event is the schedules' `disarmOn`; whether it compares `restartOn` (`Turn` and `Context`);
// whether it is `Context`, which restarts as a turn does; whether its turn started `u` (`Go`); and
// the firing it carries, refused or not. Anything else is `Settled` (a refused firing) or `Wake`
// (a reload), which compare only a timer with no baseline.
type Occasion = {
  readonly world: World;
  readonly exited: boolean;
  readonly disarmed: boolean;
  readonly compares: boolean;
  readonly started: boolean;
  readonly firing: Option.Option<Fired>;
};

type Working = { readonly timer: Timer; readonly start: boolean };

const held = (t: { readonly reasons: ReadonlyArray<string> }) => t.reasons.length > 0;

const selectionOf = (w: World) => w.sel + (w.dial ? 1000 : 0);

const firedOf = (o: Occasion, of: KeyName | "u") => Option.filter(o.firing, (f) => f.of === of);

// Schedules R11, R13 and tables Keys and Firing: exit removes every timer, and a re-entered
// state's new timers inherit nothing; a firing ends its Duration and its send's outcome is the
// timer's last firing; `keys` that throw keep the timers; a listed key new to the schedule is a
// new timer, armed from step one, with reasons `[]`. A refused start is tried again on every
// occasion (Schedules R1). A reload keeps every saved outcome (Schedules R3).
// RETURN_TYPE: each branch's literal arming stays the Arming union.
const keyed = (l: Ledger, o: Occasion): ReadonlyArray<Working> => {
  const carried = (o.exited ? [] : l.timers).map((t) => {
    const fired = firedOf(o, t.key);

    return {
      timer: Option.match(fired, {
        onNone: () => t,
        onSome: (f) => ({ ...t, arming: "idle" as const, firingFailed: f.refused }),
      }),
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
        epoch: 0,
      },
      start: true,
    };
  });
};

// Schedules R2, R7 and table Selection: `Turn` and `Context` compare `restartOn` for every timer,
// and any other occasion only for a timer with no baseline; a first clean read is a silent
// baseline, a changed one restarts unless the turn disarms; a throw keeps the baseline and fails
// the check.
// RETURN_TYPE: each branch's literal arming stays the Arming union.
const selected = (w: Working, o: Occasion): Working => {
  if (!o.compares && Option.isSome(w.timer.baseline)) return w;

  if (o.world.selThrow) return { ...w, timer: { ...w.timer, selFailed: true } };

  const value = selectionOf(o.world);
  const changed = Option.exists(w.timer.baseline, (b) => !Equal.equals(b, value));

  return {
    ...w,
    timer: { ...w.timer, baseline: Option.some(value), selFailed: false },
    start: w.start || (o.compares && changed && !o.disarmed),
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
    : { ...w.timer, arming: "armed", firingFailed: false, epoch: w.timer.epoch + 1 };
};

// The reason `t` declares under a build, if any.
const REASONS_OF_T: Readonly<Record<Build, ReadonlyArray<string>>> = {
  paused: ["A"],
  plain: [],
  renamed: ["Z"],
};

const reasonOfT = (build: Build) => REASONS_OF_T[build];

// Schedules R4, R6, R14 and table Reasons: every occasion reads each timer's reasons, armed or
// idle; A (or Z) true holds, false frees, a throw keeps the last reasons and fails the check. A
// build without `paused` reads none.
// RETURN_TYPE: each branch's literal reasons stay a list of names.
const reasoned = (t: Timer, l: Ledger, o: Occasion): Timer => {
  const [name] = reasonOfT(l.build);

  if (name === undefined) return { ...t, reasons: [], reasonFailed: false };

  const flag = o.world.a[t.key];

  if (flag === "x") return { ...t, reasonFailed: true };

  return { ...t, reasons: flag === "t" ? [name] : [], reasonFailed: false };
};

const NEW_U: Single = { armed: false, step: 0, reasons: [], firingFailed: false };

// `u` through tables Keys, Arming, Firing and Reasons: a re-entry is a new timer; a disarm leaves
// it idle; `Go` arms it from step one and settles its last firing; its firing takes its next step
// (two in all) whether or not the send commits, and its send's outcome is its last firing; reason
// B is read on every occasion, under every build that declares it.
// `u`'s arming after the occasion's disarm or start, both after its firing's step.
const armingOfU = (u: Single, o: Occasion) => {
  if (o.disarmed) return { ...u, armed: false, step: 0 };

  return o.started ? { ...u, armed: true, step: 0, firingFailed: false } : u;
};

// RETURN_TYPE: the Single contract each branch builds.
const singled = (l: Ledger, o: Occasion): Single => {
  const before = o.exited ? NEW_U : l.u;

  const stepped = Option.match(firedOf(o, "u"), {
    onNone: () => before,
    onSome: (f) => ({
      ...before,
      armed: before.step === 0,
      step: before.step === 0 ? 1 : 0,
      firingFailed: f.refused,
    }),
  });

  return { ...armingOfU(stepped, o), reasons: l.build !== "plain" && o.world.b ? ["B"] : [] };
};

// RETURN_TYPE: the Ledger contract a reduce over steps carries.
const decided = (l: Ledger, o: Occasion): Ledger => ({
  ...l,
  world: o.world,
  keysFailed: o.world.keysThrow,
  timers: keyed(l, o).map((w) => reasoned(armed(selected(w, o), o), l, o)),
  u: singled(l, o),
});

const turn = (world: World) =>
  ({
    world,
    exited: false,
    disarmed: false,
    compares: true,
    started: false,
    firing: Option.none(),
  }) satisfies Occasion;

/**
 * The ledger at creation: the entry arms `good`; `u` waits for `Go` (Schedules R13, table Arming).
 */
export const CREATED: Ledger = decided(
  { world: FIRST, build: "paused", keysFailed: false, timers: [], u: NEW_U },
  { ...turn(FIRST), exited: true },
);

// Schedules R12: every armed, unheld timer is due within a minute and fires once, each a
// separate turn in due order: a committed one is a `Turn`, which writes the selection when sends
// do, a refused one `Settled`, which compares only a selection with no baseline.
const minute = (l: Ledger) => {
  const due: Array<{ readonly of: KeyName | "u"; readonly epoch: number }> = l.timers
    .filter((t) => t.arming === "armed" && !held(t))
    .map((t) => ({ of: t.key, epoch: t.epoch }));

  if (l.u.armed && !held(l.u)) due.push({ of: "u", epoch: 0 });

  return due.reduce<{ ledger: Ledger; fired: ReadonlyArray<string> }>(
    (acc, { of, epoch }) => {
      const live =
        of === "u"
          ? acc.ledger.u.armed
          : acc.ledger.timers.some(
              (t) => t.key === of && t.arming === "armed" && t.epoch === epoch,
            );

      // A firing whose arming a turn before it restarted or stopped is dropped (Schedules R12).
      if (!live) return acc;

      const refused = acc.ledger.world.refuse;
      const world = refused || !acc.ledger.world.bump ? acc.ledger.world : bumped(acc.ledger.world);

      return {
        ledger: decided(acc.ledger, {
          ...turn(world),
          compares: !refused,
          firing: Option.some({ of, refused }),
        }),
        fired: refused ? acc.fired : [...acc.fired, of],
      };
    },
    { ledger: l, fired: [] },
  );
};

const bumped = (w: World) => ({ ...w, sel: w.sel + 1 });

// A wake under a build: a saved reason the build does not declare is dropped first (the decoder
// table), then every check reads silently.
const woken = (l: Ledger, build: Build) => {
  const declared = reasonOfT(build);

  const timers = l.timers.map((t) => ({
    ...t,
    reasons: t.reasons.filter((r) => declared.includes(r)),
  }));

  return decided({ ...l, build, timers }, { ...turn(l.world), compares: false });
};

/**
 * One step: the ledger after it, and the timers whose firings committed in it.
 */
export const stepped = (l: Ledger, atom: Atom) => {
  if (atom.kind === "minute") return minute(l);

  if (atom.kind === "write") return { ledger: decided(l, turn(atom.write(l.world))), fired: [] };

  if (atom.kind === "stop")
    return { ledger: decided(l, { ...turn(atom.write(l.world)), disarmed: true }), fired: [] };

  if (atom.kind === "edited") return { ledger: woken(l, atom.build), fired: [] };

  return { ledger: PLAIN[atom.kind](l), fired: [] };
};

// The steps that write nothing: a re-entry, `Go`, the dial's flip, and the reloads under the same
// build.
const PLAIN = {
  reenter: (l: Ledger) => decided(l, { ...turn(l.world), exited: true }),
  go: (l: Ledger) => decided(l, { ...turn(l.world), started: true }),
  context: (l: Ledger) => decided(l, turn({ ...l.world, dial: !l.world.dial })),
  reload: (l: Ledger) => woken(l, l.build),
  away: (l: Ledger) => away(l),
};

// A reload after the dial turned while the page was closed: a wake, then the owed `Context`.
const away = (l: Ledger) => {
  const world = { ...l.world, dial: !l.world.dial };

  return decided(woken({ ...l, world }, l.build), turn(world));
};

/**
 * The slots a schedule issue names: `keys`, `restartOn`, the arming's delay, reason A or Z, and
 * the send's turn.
 */
export const SLOTS = {
  keys: "states.ON.schedules.t.keys",
  restartOn: "states.ON.schedules.t.restartOn",
  arming: "states.ON.schedules.t.schedule",
  reason: (name: string) => `states.ON.schedules.t.paused.${name}`,
  send: "on.Tick[0].updateMemory",
} as const;

/**
 * What a step shows: each armed timer, due or held; each source's issue as `key slot` (`-` for
 * `keys`, `u` for `u`); and the timers whose firings committed in the step.
 */
export type View = {
  readonly timers: ReadonlyArray<string>;
  readonly issues: ReadonlyArray<string>;
  readonly fired: ReadonlyArray<string>;
};

// Schedules R5 and `scheduleIssues`: one issue per source, the first failed outcome in check
// order: the last firing, then `restartOn`, then the arming, then the reasons.
const issueOf = (t: Timer, build: Build) => {
  const failed = [
    t.firingFailed ? [SLOTS.send] : [],
    t.selFailed ? [SLOTS.restartOn] : [],
    t.arming === "refused" ? [SLOTS.arming] : [],
    t.reasonFailed ? reasonOfT(build).map(SLOTS.reason) : [],
  ].flat();

  return failed.slice(0, 1).map((slot) => `${t.key} ${slot}`);
};

/**
 * The view a ledger owes.
 */
export const viewOf = (l: Ledger, fired: ReadonlyArray<string>) => {
  const issues = l.timers.flatMap((t) => issueOf(t, l.build));
  const timers = l.timers.filter((t) => t.arming === "armed").map((t) => `${t.key} ${shownOf(t)}`);

  if (l.keysFailed) issues.push(`- ${SLOTS.keys}`);

  if (l.u.firingFailed) issues.push(`u ${SLOTS.send}`);

  if (l.u.armed) timers.push(`u ${shownOf(l.u)}`);

  return {
    timers: timers.toSorted(),
    issues: issues.toSorted(),
    fired: fired.toSorted(),
  } satisfies View;
};

const shownOf = (t: { readonly reasons: ReadonlyArray<string> }) => (held(t) ? "held" : "due");

// The clock run out: a minute at a time until nothing is left to fire (Schedules R12).
const runOut = (l: Ledger) => {
  let ledger = l;
  let fired: ReadonlyArray<string> = [];

  for (let n = 0; n < 4; n += 1) {
    const next = minute(ledger);

    ledger = next.ledger;
    fired = [...fired, ...next.fired];
  }

  return { ledger, fired };
};

/**
 * The views a sequence owes: one after each step, then one after the clock runs out, when every
 * armed, unheld timer fires until none is left (Schedules R12).
 */
export const viewsOf = (atoms: ReadonlyArray<Atom>) => {
  const views: Array<View> = [];
  let ledger = CREATED;

  for (const atom of atoms) {
    const next = stepped(ledger, atom);

    views.push(viewOf(next.ledger, next.fired));
    ledger = next.ledger;
  }

  const end = runOut(ledger);

  views.push(viewOf(end.ledger, end.fired));

  return views;
};
