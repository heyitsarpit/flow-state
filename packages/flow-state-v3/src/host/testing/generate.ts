// @effect-diagnostics unstableApiUsage:off -- generation and shrinking are Effect's Arbitrary, which Effect marks unstable; chosen over a generator of our own.
import { Arbitrary, Duration, Effect, Option, Schema } from "effect";
import type { AnyServer } from "./fake.ts";
import { mixOf, sharedOf } from "./mix.ts";
import { runFrom, type Source, type StoryRun, type View } from "./run.ts";
import { type Property, print, printMix, type Samples } from "./samples.ts";
import { Step, StoryFailed, StoryTurnLimit, WorldWord } from "./steps.ts";
import { SubjectId } from "./story.ts";

/**
 * The profiles a generated run draws with: `usual`, people on a healthy network; `stress`,
 * everything at once; and `mix`, several apps on one page whose work overlaps: slow and refused
 * store writes, answers in flight, reloads and an offline span.
 */
export type Profile = "usual" | "stress" | "mix";

/**
 * A drawing: one of the two profiles, or the pair sweep's drive, the usual profile with lost
 * answers and held and refused writes.
 */
export type Drawing = Profile | "drive";

type StepKind =
  | "nothing"
  | "user"
  | "burst"
  | "think"
  | "gap"
  | "reload"
  | "disposeRuntime"
  | "disposeActor"
  | "navigate"
  | "control";

type Answer =
  | "ok"
  | "latency"
  | "fail"
  | "lost"
  | "lostButLanded"
  | "failButLanded"
  | "never"
  | "slow"
  | "reordered"
  | "late";

type Write = "ack" | "refuse" | "hang" | "land" | "slow";

type Table<K> = ReadonlyArray<readonly [K, number]>;

// The usual, stress and mix runs: what a person does per step, what the server answers per
// request, and what the store does per write batch.
const STEPS: Record<Drawing, Table<StepKind>> = {
  usual: [
    ["user", 55],
    ["think", 41],
    ["navigate", 2],
    ["control", 2],
  ],
  stress: [
    ["user", 64],
    ["burst", 1],
    ["gap", 28],
    ["reload", 3],
    ["disposeRuntime", 1],
    ["disposeActor", 1],
    ["navigate", 1],
    ["control", 1],
  ],
  drive: [
    ["user", 60],
    ["think", 38],
    ["control", 2],
  ],
  mix: [
    ["user", 60],
    ["think", 20],
    ["gap", 12],
    ["reload", 4],
    ["disposeRuntime", 1],
    ["disposeActor", 1],
    ["navigate", 1],
    ["control", 1],
  ],
};

const ANSWERS: Record<Drawing, Table<Answer>> = {
  usual: [
    ["latency", 97],
    ["fail", 3],
  ],
  stress: [
    ["ok", 35],
    ["fail", 10],
    ["lost", 10],
    ["lostButLanded", 10],
    ["failButLanded", 5],
    ["never", 5],
    ["slow", 10],
    ["reordered", 10],
    ["late", 5],
  ],
  drive: [
    ["latency", 88],
    ["fail", 2],
    ["lost", 5],
    ["lostButLanded", 5],
  ],
  mix: [
    ["latency", 80],
    ["fail", 5],
    ["lost", 5],
    ["lostButLanded", 5],
    ["never", 5],
  ],
};

const WRITES: Record<Drawing, Table<Write>> = {
  usual: [["ack", 100]],
  stress: [
    ["ack", 75],
    ["refuse", 15],
    ["hang", 5],
    ["land", 5],
  ],
  drive: [
    ["ack", 80],
    ["slow", 15],
    ["refuse", 5],
  ],
  mix: [
    ["ack", 50],
    ["slow", 35],
    ["refuse", 15],
  ],
};

const LENGTHS: Record<Drawing, readonly [number, number]> = {
  usual: [40, 150],
  stress: [100, 300],
  drive: [40, 150],
  mix: [60, 200],
};

const RANGE = 1000;

/**
 * One draw: the kind of step, and three numbers that pick within it and draw the answers and
 * writes armed before it.
 */
type Draw = readonly [number, number, number, number];

// Drawn from a wide range and spread down to 0..999: Arbitrary favours small values and 0, so a
// narrow range would draw the first weight far too often.
const digit = Arbitrary.schema(
  Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1_000_000_000 })),
);

// Arbitrary favours the ends of a range; multiplying by a prime coprime to the range spreads its
// digits evenly over the weights, and keeps 0, toward which a draw shrinks, at 0.
const spread = (d: number) => (d === 0 ? 0 : 1 + ((Math.imul(d, 0x9e3779b1) >>> 0) % (RANGE - 1)));

// RETURN_TYPE: the Draw tuple, which the array literal would widen to number[].
const spreadDraw = ([a, b, c, d]: Draw): Draw => [spread(a), spread(b), spread(c), spread(d)];

const drawsOf = (drawing: Drawing) =>
  Arbitrary.array(Arbitrary.all([digit, digit, digit, digit]).pipe(Arbitrary.map(spreadDraw)), {
    minLength: LENGTHS[drawing][0],
    maxLength: LENGTHS[drawing][1],
  });

const weighted = <K>(table: Table<K>, at: number) => {
  const total = table.reduce((sum, [, w]) => sum + w, 0);
  let left = (at * total) / RANGE;

  for (const [kind, w] of table) {
    if (left < w) return Option.some(kind);
    left -= w;
  }

  return Option.fromUndefinedOr(table.at(-1)?.[0]);
};

// A draw shrinks toward 0, so a kind digit of 0 gives no step: shrinking a run whose length is
// bounded below empties the draws a failure does not need.
// RETURN_TYPE: the step kinds' union, which the literal "nothing" would widen to a string.
const stepKind = (drawing: Drawing, at: number): StepKind =>
  at === 0 ? "nothing" : Option.getOrElse(weighted(STEPS[drawing], at - 1), () => "nothing");

const pick = <A>(items: ReadonlyArray<A>, at: number) =>
  Option.fromUndefinedOr(items[at % Math.max(items.length, 1)]);

// A duration from lo to hi milliseconds, log-uniform over the digit.
const span = (lo: number, hi: number, at: number) =>
  Math.round(lo * (hi / lo) ** (at / (RANGE - 1)));

// A digit for the n-th of several draws made from one.
// An independent digit for each use of one drawn digit (an endpoint's answer, its delay, the
// store's write), hashed with a salt.
const mix = (at: number, salt: number) => {
  let h = Math.imul((at + 1) ^ Math.imul(salt + 1, 0x9e3779b1), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);

  return ((h ^ (h >>> 16)) >>> 0) % RANGE;
};

// The salt of a write's digits, apart from any answer's.
const WRITE_SALT = 1000;

// A digit of the world's answer to an endpoint's next call: keyed to the endpoint's name and its
// call count, and to the draw whose step is current when that count is reached, so a shrunk draw
// changes only the answers its own steps meet, and dropping another fixture moves none.
const worldDigit = (digit: number, key: string, count: number, use: number) => {
  let h = Math.imul(digit + 1, 0x9e3779b1);

  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193);

  return mix(h ^ Math.imul(count + 1, 0x85ebca6b), use);
};

// Which digit of a draw each use of an answer reads: its pick of a failure, its delay, and the
// answer itself (offline too).
const PICK = 1;

const DELAY = 2;

const ANSWER = 3;

/**
 * A stretch of a run's virtual time, from its start up to its end, in milliseconds, and the
 * indices of the steps that open and close it in the run's steps.
 */
export type Span = {
  readonly from: number;
  readonly until: number;
  readonly fromStep: number;
  readonly untilStep: number;
};

const advance = (ms: number) => Step.advance({ duration: `${ms} millis` });

const millisOf = (step: Step) =>
  step._tag === "advance" ? Duration.toMillis(Duration.fromInputUnsafe(step.duration)) : 0;

type Endpoint = { readonly server: AnyServer; readonly endpoint: string };

const keyOf = (at: Endpoint) => `${at.server.name}.${at.endpoint}`;

const endpointsOf = (samples: Samples) =>
  samples.servers.flatMap(({ server }) =>
    Object.keys(server.endpoints).map((endpoint) => ({ server, endpoint })),
  );

/**
 * What a run picks from, slot by slot: every fixture's steps, actors, endpoints and control words,
 * with a dropped fixture's slots kept empty, so the fixtures left pick as they did before; `mixed`
 * when drawn over several fixtures.
 */
type Pools = {
  readonly mixed: boolean;
  readonly steps: ReadonlyArray<Option.Option<Step>>;
  readonly actors: ReadonlyArray<Option.Option<Samples["actors"][number]>>;
  readonly endpoints: ReadonlyArray<Option.Option<Endpoint>>;
  readonly failures: ReadonlyArray<Option.Option<WorldWord>>;
  readonly landedFailures: ReadonlyArray<Option.Option<WorldWord>>;
  readonly controls: ReadonlyArray<Option.Option<WorldWord>>;
};

const slots = <A>(
  all: ReadonlyArray<Samples>,
  kept: ReadonlyArray<Samples>,
  of: (part: Samples) => ReadonlyArray<A>,
) =>
  all.flatMap((part) =>
    of(part).map((a) => (kept.includes(part) ? Option.some(a) : Option.none<A>())),
  );

// RETURN_TYPE: the Pools contract, whose slot lists inference would widen per field.
const poolsOf = (all: ReadonlyArray<Samples>, kept: ReadonlyArray<Samples>): Pools => ({
  mixed: all.length > 1,
  steps: slots(all, kept, (p) => p.steps),
  actors: slots(all, kept, (p) => p.actors),
  endpoints: slots(all, kept, endpointsOf),
  failures: slots(all, kept, (p) => p.failures),
  landedFailures: slots(all, kept, (p) => p.landedFailures),
  controls: slots(all, kept, (p) => p.controls),
});

const pickSlot = <A>(items: ReadonlyArray<Option.Option<A>>, at: number) =>
  Option.flatten(pick(items, at));

const wire = (
  at: Endpoint,
  word: "hold" | "drop" | "release" | "lose",
  where: "request" | "response",
) =>
  Step.world({
    words: [WorldWord.wire({ server: at.server, endpoint: at.endpoint, word, at: where })],
  });

const storage = (word: "hold" | "refuse" | "release") =>
  Step.world({ words: [WorldWord.storage({ word })] });

const network = (word: "offline" | "online") =>
  Step.world({ words: [WorldWord.network({ word })] });

const control = (word: WorldWord) => Step.world({ words: [word] });

const QUIET_ROUNDS = 2;

const QUIET_LIMIT = 500;

const QUIET = Step.advance({ duration: "2 minutes" });

/**
 * Quiets the world: releases every held call and write, then moves time past every deadline and
 * bound, until nothing is held through two quiet rounds. Past its limit it ends, and the run's end
 * shows what is still pending.
 */
// RETURN_TYPE: the Source contract types the view each pull receives.
export const quieting = (): Source => {
  // The first advance counts as a quiet round unless something is held after it.
  let rounds = 1;
  let pulls = 0;

  return (view) => {
    pulls += 1;
    const held = view.held[0];

    if (pulls > QUIET_LIMIT) return "done";

    // Time passes every deadline first, so an answer never released (Never) comes too late.
    if (pulls === 1) return QUIET;

    if (held !== undefined) {
      rounds = 0;

      return wire(held, "release", "request");
    }

    if (view.heldWrites > 0) {
      rounds = 0;

      return storage("release");
    }

    return rounds++ < QUIET_ROUNDS ? QUIET : "done";
  };
};

// What the step words of an armed answer are, before the call it answers arrives.
const armedSteps = (pools: Pools, at: Endpoint, answer: Answer, n: number) => {
  const hold = [wire(at, "hold", "request")];
  const lostButLanded = [wire(at, "drop", "response")];

  const steps: Record<Answer, () => ReadonlyArray<Step>> = {
    ok: () => [],
    latency: () => hold,
    slow: () => hold,
    reordered: () => hold,
    late: () => hold,
    never: () => hold,
    fail: () => Option.toArray(Option.map(pickSlot(pools.failures, n), control)),
    failButLanded: () =>
      Option.match(pickSlot(pools.landedFailures, n), {
        onNone: () => lostButLanded,
        onSome: (word) => [control(word)],
      }),
    lost: () => [wire(at, "drop", "request")],
    lostButLanded: () => lostButLanded,
  };

  return steps[answer]();
};

// When an answer held at the server is released, from the time its call arrived.
const delayOf = (answer: Answer, at: number) => {
  const delays: Partial<Record<Answer, () => number>> = {
    latency: () => (at < 20 ? span(2000, 5000, at * 50) : span(50, 800, at)),
    slow: () => span(1000, 90_000, at),
    late: () => span(61_000, 120_000, at),
  };

  return Option.map(Option.fromUndefinedOr(delays[answer]), (delay) => delay());
};

type Timer = {
  readonly due: number;
  readonly at: Option.Option<Endpoint>;
  readonly afterCalls: number;
};

/**
 * What is still pending when a run stops: held calls and writes, and lanes in flight.
 */
export const pendingOf = (view: View) => [
  ...view.held.map((h) => `a call held at ${keyOf(h)}`),
  ...Array.from({ length: view.heldWrites }, () => "a held write"),
  ...view
    .lanes()
    .filter((lane) => lane.state === "InFlight")
    .map((lane) => `${lane.actor}'s ${lane.operation} lane ${lane.phase}`),
];

/**
 * A step source over draws: it ensures every actor first, arms each endpoint's next answer and the
 * store's next write from the drawing's tables, releases held answers when their delay passes,
 * gives each draw's steps (skipping a draw invalid where it falls), and then quiets the world.
 */
const sourceOf = (pools: Pools, drawing: Drawing, draws: ReadonlyArray<Draw>, seed: number) => {
  let pending: ReadonlyArray<string> = [];

  const queue: Array<Step> = pools.actors.flatMap((slot) =>
    Option.toArray(Option.map(slot, ({ actor, context }) => Step.ensure({ actor, context }))),
  );

  const front: Array<Step> = [];
  const endpoints = pools.endpoints.flatMap((slot) => Option.toArray(slot));
  // The run's world: one drawn digit every answer is keyed by, beside its endpoint and call count.
  const world = draws[0]?.[3] ?? 0;
  const armed = new Map<string, { readonly calls: number; readonly answer: Answer }>();
  const timers: Array<Timer> = [];
  const quiet = quieting();
  let writes: Option.Option<{ readonly count: number; readonly write: Write }> = Option.none();
  let landOnReload = false;
  let now = 0;
  let rest = 0;
  let next = 0;

  // The one offline span of a stress run starts at a drawn draw, counted from the end, so a shrunk
  // draw of 0 puts it after everything a failure needs.
  const offlineAt =
    drawing === "stress" || drawing === "mix"
      ? draws.length - 1 - Math.floor(((draws[0]?.[1] ?? 0) * draws.length) / RANGE)
      : -1;

  let offlineLeft = 0;
  let offline: Option.Option<Span> = Option.none();
  let online = false;
  let given = 0;
  const tally = new Map<string, string>();
  let quieted = false;
  const offlineNow = () => Option.exists(offline, (o) => now >= o.from && now < o.until);

  // Once the call an answer was armed for has arrived, its release is timed and the endpoint's
  // next answer is armed; offline, every answer is Lost or Never.
  const armEndpoint = (view: View, digits: Draw, at: Endpoint, slot: number) => {
    const calls = view.calls(at.server, at.endpoint);
    const before = armed.get(keyOf(at));

    if (before !== undefined && calls === before.calls) return;
    // Over one fixture an answer reads the current draw, so a shrunk draw changes the answers its
    // own steps meet. Over several it reads the run's world digit by endpoint and call count, so
    // dropping a fixture moves no answer of the rest.
    const n = slot * 1_000_003 + calls;

    const digit = (use: number) =>
      pools.mixed ? worldDigit(world, keyOf(at), calls, use) : mix(digits[use] ?? 0, n);

    if (before !== undefined) {
      const delay = delayOf(before.answer, digit(DELAY));

      if (Option.isSome(delay))
        timers.push({ due: now + delay.value, at: Option.some(at), afterCalls: 0 });

      if (before.answer === "reordered")
        timers.push({ due: Number.POSITIVE_INFINITY, at: Option.some(at), afterCalls: calls + 1 });
    }

    const offlineAnswer: Answer = digit(ANSWER) % 2 === 0 ? "lost" : "never";

    const answer = offlineNow()
      ? offlineAnswer
      : Option.getOrElse(weighted(ANSWERS[drawing], digit(ANSWER)), () => "ok" as const);

    armed.set(keyOf(at), { calls, answer });

    if (!offlineNow())
      tally.set(
        pools.mixed ? `answer ${seed}:${keyOf(at)}:${calls}` : `answer ${digits[ANSWER]}:${n}`,
        answer,
      );
    front.push(...armedSteps(pools, at, answer, digit(PICK)));
  };

  // A write's digits come from the draw current when it is armed and its count. Over several
  // fixtures the count starts again at each draw, so dropping one fixture, whose batches share the
  // store, moves no other fixture's writes.
  let drawOf = { draw: -1, firstWrite: 0 };

  const arm = (view: View, digits: Draw) => {
    for (const [slot, at] of endpoints.entries()) armEndpoint(view, digits, at, slot);
    const count = view.writes.length;

    if (Option.exists(writes, (w) => w.count === count)) return;

    if (drawOf.draw !== next) drawOf = { draw: next, firstWrite: count };
    const salt = WRITE_SALT + count - (pools.mixed ? drawOf.firstWrite : 0);

    if (Option.exists(writes, (w) => w.write === "slow"))
      timers.push({
        due: now + span(50, 800, mix(digits[2], salt)),
        at: Option.none(),
        afterCalls: 0,
      });

    landOnReload = landOnReload || Option.exists(writes, (w) => w.write === "land");

    const write = Option.getOrElse(
      weighted(WRITES[drawing], mix(digits[3], salt)),
      () => "ack" as const,
    );

    writes = Option.some({ count, write });
    tally.set(`write ${digits[3]}:${count}`, `write ${write}`);

    if (write === "refuse") front.push(storage("refuse"));
    else if (write !== "ack") front.push(storage("hold"));
  };

  const fire = (view: View) => {
    const due = timers.findIndex((t) =>
      Option.match(t.at, {
        onNone: () => t.due <= now,
        onSome: (at) =>
          t.due <= now || (t.afterCalls > 0 && view.calls(at.server, at.endpoint) >= t.afterCalls),
      }),
    );

    const timer = timers[due];

    if (timer === undefined) return Option.none<Step>();
    timers.splice(due, 1);

    return Option.match(timer.at, {
      onNone: () => (view.heldWrites > 0 ? Option.some(storage("release")) : Option.none()),
      onSome: (at) =>
        view.held.some((h) => keyOf(h) === keyOf(at))
          ? Option.some(wire(at, "release", "request"))
          : Option.none(),
    });
  };

  const drawn = (view: View, [kind, a, b]: Draw) => {
    const live = !view.disposed;
    const user = live ? Option.toArray(pickSlot(pools.steps, a)) : [];
    const actor = pickSlot(pools.actors, a);

    const steps: Record<StepKind, () => ReadonlyArray<Step>> = {
      nothing: () => [],
      user: () => user,
      burst: () => user.flatMap((s) => Array.from({ length: span(50, 2000, b) }, () => s)),
      think: () => {
        rest = span(80, 20_000, b);

        return [];
      },
      gap: () => {
        rest = b % 21;

        return [];
      },
      reload: () => {
        const heldWrites = landOnReload ? "land" : "abort";
        landOnReload = false;

        return [Step.reload({ reattach: b % 2 === 0, heldWrites })];
      },
      disposeRuntime: () => (live ? [Step.disposeRuntime({ forget: false })] : []),
      disposeActor: () =>
        live
          ? Option.toArray(
              Option.map(actor, (it) =>
                Step.dispose({ actor: it.actor, how: b % 2 === 0 ? "dispose" : "forget" }),
              ),
            )
          : [],
      navigate: () =>
        live
          ? Option.toArray(
              Option.map(actor, (it) =>
                view.uses(it.actor) > 0
                  ? Step.detach({ actor: it.actor })
                  : Step.ensure({ actor: it.actor, context: it.context }),
              ),
            )
          : [],
      control: () => Option.toArray(Option.map(pickSlot(pools.controls, a), control)),
    };

    // A disposed Runtime takes no step but a reload: the next draw opens the tab again.
    return steps[
      live || stepKind(drawing, kind) === "nothing" ? stepKind(drawing, kind) : "reload"
    ]();
  };

  const give = (step: Step) => {
    const index = given++;
    now += millisOf(step);
    const word = step._tag === "world" ? step.words[0] : undefined;

    if (word?._tag === "network")
      offline = Option.map(offline, (o) =>
        word.word === "offline" ? { ...o, fromStep: index } : { ...o, untilStep: index },
      );

    return step;
  };

  const quietly: Source = (view) => {
    const step = quiet(view);

    if (step === "done") pending = pendingOf(view);

    return step === "skip" || step === "done" ? step : give(step);
  };

  // Moves time on by what is left of a think time or gap, stopping at the next timer.
  const waited = () => {
    const firstDue = Math.min(...timers.map((t) => t.due));
    const step = Math.max(0, Math.min(rest, firstDue - now));
    rest -= step;

    return step > 0 ? give(advance(step)) : "skip";
  };

  const source: Source = (view) => {
    const fronted = front.shift();

    if (fronted !== undefined) return give(fronted);

    if (quieted) return quietly(view);

    if (
      !online &&
      rest === 0 &&
      offlineLeft === 0 &&
      Option.exists(offline, (o) => now >= o.until)
    ) {
      online = true;

      return give(network("online"));
    }

    arm(view, draws[Math.min(next, draws.length - 1)] ?? [0, 0, 0, 0]);

    if (front.length > 0) return "skip";
    const fired = fire(view);

    if (Option.isSome(fired)) return give(fired.value);
    const queued = queue.shift();

    if (queued !== undefined) return give(queued);

    return rest > 0 ? waited() : drawNext(view);
  };

  // RETURN_TYPE: a Source's pull result, which its "skip" literal would widen to a string.
  const drawNext = (view: View): ReturnType<Source> => {
    const draw = draws[next];

    if (draw === undefined) {
      quieted = true;

      // A span still open when the draws end runs to its end before the world quiets.
      if (!online && Option.isSome(offline)) {
        if (offline.value.until > now) front.push(advance(offline.value.until - now));

        front.push(network("online"));
      }

      online = true;

      return "skip";
    }

    next += 1;

    // Offline, a few draws run, then time moves on to the span's end, still offline.
    if (next - 1 === offlineAt) {
      offline = Option.some({
        from: now,
        until: now + span(5000, 120_000, draw[2]),
        fromStep: Number.POSITIVE_INFINITY,
        untilStep: Number.POSITIVE_INFINITY,
      });
      offlineLeft = 5 + (draw[2] % 16);
      front.push(network("offline"));
    } else if (offlineLeft > 0) {
      offlineLeft -= 1;

      if (offlineLeft === 0)
        rest = Option.match(offline, {
          onNone: () => 0,
          onSome: (o) => Math.max(0, o.until - now),
        });
    }

    queue.push(...drawn(view, draw));

    return "skip";
  };

  return { source, pending: () => pending, offline: () => offline, tally: () => new Map(tally) };
};

/**
 * A generated run: its steps as a Story would hold them (unused words left out), what it recorded,
 * what was still pending at its horizon, its offline span, each answer and write it drew outside
 * that span (an answer by seed, endpoint and call count, a write by the draw's digit and count),
 * and, for several fixtures in one Runtime, how many steps
 * touched two or more of them (`shared`; 0 for one fixture).
 *
 * **Gotchas**
 *
 * - An answer is drawn for each endpoint's next call; further calls of that endpoint within the same
 *   step are answered at once.
 */
export type Generated = {
  readonly steps: ReadonlyArray<Step>;
  readonly run: StoryRun;
  readonly pending: ReadonlyArray<string>;
  readonly offline: Option.Option<Span>;
  readonly tally: ReadonlyMap<string, string>;
  readonly shared: number;
};

/**
 * Runs a source over a fixture's samples, keeping the Story's own store order and session seeds so
 * the printed steps replay it exactly as a Story.
 */
export const runSource = (samples: Samples, id: string, source: Source) => {
  const drawn = runFrom(samples.story[SubjectId], id, source, {
    seed: Option.none(),
    lenient: true,
  });

  const unused = new Set(drawn.unused);

  return { steps: drawn.run.steps.filter((_, n) => !unused.has(n)), run: drawn.run };
};

// The draws a seed gives a drawing, as Arbitrary's first run from that seed draws them.
const drawsFrom = (drawing: Drawing, seed: number) => {
  let found: ReadonlyArray<Draw> = [];

  // oxlint-disable-next-line lint-bomb/no-effect-runner-in-domain -- a generated run is drawn synchronously at the test's boundary
  Effect.runSync(
    Arbitrary.checkEffect(
      drawsOf(drawing),
      (draws) => {
        found = draws;

        return true;
      },
      { runs: 1, seed, size: LENGTHS[drawing][1] },
    ),
  );

  return found;
};

/**
 * The fixtures a generated run draws from: one fixture's samples, or several run in one Runtime.
 */
type Fixtures = Samples | ReadonlyArray<Samples>;

// RETURN_TYPE: a list of parts, which the one-fixture branch would type as a tuple.
const partsOf = (fixtures: Fixtures): ReadonlyArray<Samples> =>
  "id" in fixtures ? [fixtures] : fixtures;

/**
 * One run's drawing: every fixture it was drawn over, the fixtures it keeps (the rest dropped,
 * their slots left empty), the drawing and the seed.
 */
type Drawn = {
  readonly all: ReadonlyArray<Samples>;
  readonly kept: ReadonlyArray<Samples>;
  readonly drawing: Drawing;
  readonly seed: number;
};

const idOf = (at: Drawn) => `${mixOf(at.kept).id}/${at.drawing}-${at.seed}`;

// RETURN_TYPE: the exported Generated contract.
const drawnRun = (at: Drawn, draws: ReadonlyArray<Draw>): Generated => {
  const samples = mixOf(at.kept);
  const drawn = sourceOf(poolsOf(at.all, at.kept), at.drawing, draws, at.seed);
  const ran = runSource(samples, idOf(at), drawn.source);

  return {
    ...ran,
    pending: drawn.pending(),
    offline: drawn.offline(),
    tally: drawn.tally(),
    shared: at.kept.length > 1 ? sharedOf(ran.run, at.kept) : 0,
  };
};

/**
 * The step source one drawing of a fixture's samples gives from a seed.
 */
export const generateSource = (samples: Samples, drawing: Drawing, seed: number) =>
  sourceOf(poolsOf([samples], [samples]), drawing, drawsFrom(drawing, seed), seed).source;

/**
 * Runs one drawing of a fixture's samples, or of several fixtures' in one Runtime, from a seed and
 * returns the run it gives.
 */
export const generate = (
  fixtures: Fixtures,
  options: { readonly drawing: Drawing; readonly seed: number },
) => {
  const all = partsOf(fixtures);

  return drawnRun(
    { all, kept: all, drawing: options.drawing, seed: options.seed },
    drawsFrom(options.drawing, options.seed),
  );
};

type Verdict = { readonly rule: string; readonly breaches: ReadonlyArray<string> };

const LIMIT_RULE = "turn limit";

const HORIZON_RULE = "inconclusive";

/**
 * Why a quieted run judged nothing: work still pending at its horizon, or no evidence recorded.
 * Either is an `inconclusive` verdict, so such a run never passes.
 */
export const inconclusiveOf = (run: StoryRun, pending: ReadonlyArray<string>) => {
  const verdicts: Array<Verdict> = [];

  if (pending.length > 0)
    verdicts.push({
      rule: HORIZON_RULE,
      breaches: pending.map((p) => `inconclusive: ${p} at the horizon`),
    });

  if (run.evidence.length === 0)
    verdicts.push({ rule: HORIZON_RULE, breaches: ["inconclusive: the run recorded no evidence"] });

  return verdicts;
};

// A run of several fixtures where no step touched two of them shared nothing: it is inconclusive.
const unsharedOf = (parts: ReadonlyArray<Samples>, generated: Generated) => {
  if (parts.length < 2 || generated.shared > 0) return [];

  return [{ rule: HORIZON_RULE, breaches: ["inconclusive: no step touched two fixtures"] }];
};

// The breaches a run of draws gives: a turn limit, and work still pending at the horizon, are
// breaches of their own; a script fault is a fault of the generator, so it is thrown.
const judged = (at: Drawn, draws: ReadonlyArray<Draw>, properties: ReadonlyArray<Property>) => {
  try {
    const generated = drawnRun(at, draws);

    const verdicts: ReadonlyArray<Verdict> = properties.flatMap((p) => {
      const breaches = p.breaches(generated.run);

      return breaches.length > 0 ? [{ rule: p.rule, breaches }] : [];
    });

    return {
      generated: Option.some(generated),
      verdicts: [
        ...verdicts,
        ...inconclusiveOf(generated.run, generated.pending),
        ...unsharedOf(at.kept, generated),
      ],
    };
  } catch (fault) {
    if (fault instanceof StoryTurnLimit)
      return {
        generated: Option.none<Generated>(),
        verdicts: [{ rule: LIMIT_RULE, breaches: [fault.message] }],
      };

    // oxlint-disable-next-line lint-bomb/no-throw-in-core -- a script fault in a generated run is a defect of the generator, never a finding about the app
    throw fault instanceof StoryFailed
      ? new Error(`a generated run failed its script: ${fault.problem}`)
      : fault;
  }
};

const MAX_SHRINKS = 1000;

/**
 * A generated run that broke a property: its seed, the rule, the breaches of its shrunk run, the
 * number of draws it was drawn with, the shrink candidates tried (at most 1,000, the bound), the
 * fixtures it kept, and the shrunk run as steps and printed:
 * as a Story for one fixture, as steps under a comment line for several.
 */
export type Failure = {
  readonly seed: number;
  readonly rule: string;
  readonly breaches: ReadonlyArray<string>;
  readonly drawn: number;
  readonly shrinks: number;
  readonly fixtures: ReadonlyArray<string>;
  readonly steps: ReadonlyArray<Step>;
  readonly story: string;
};

type Check = {
  readonly profile: Profile;
  readonly properties: ReadonlyArray<Property>;
};

// Checks a seed's draws with Arbitrary: with no target, the run must break no rule, and the first
// rule broken becomes the target; with a target, the run must not break it. Shrinks up to `shrinks`.
const search = (at: Drawn, check: Check, target: Option.Option<string>, shrinks: number) => {
  let rule = target;

  const property = (draws: ReadonlyArray<Draw>) => {
    const { verdicts } = judged(at, draws, check.properties);

    return Option.match(rule, {
      onNone: () => {
        rule = Option.map(Option.fromUndefinedOr(verdicts[0]), (v) => v.rule);

        return verdicts.length === 0;
      },
      onSome: (wanted) => !verdicts.some((v) => v.rule === wanted),
    });
  };

  // oxlint-disable-next-line lint-bomb/no-effect-runner-in-domain -- a generated run is checked synchronously at the test's boundary
  const result = Effect.runSync(
    Arbitrary.checkEffect(drawsOf(check.profile), property, {
      runs: 1,
      seed: at.seed,
      size: LENGTHS[check.profile][1],
      maxShrinks: shrinks,
    }),
  );

  return { result, rule };
};

const MAX_SUBSETS = 64;

// Every nonempty subset of the parts, smallest first, while there are at most 64 of them.
const subsetsOf = (parts: ReadonlyArray<Samples>) =>
  2 ** parts.length > MAX_SUBSETS
    ? []
    : Array.from({ length: 2 ** parts.length - 1 }, (_, n) =>
        parts.filter((_, k) => ((n + 1) >> k) % 2 === 1),
      ).toSorted((a, b) => a.length - b.length);

// Drops whole fixtures while the draws still break the rule, their slots kept empty so the rest
// pick as before: the smallest subset of the kept parts that breaks the same rule, or, past 64
// subsets, each part in turn left out while the rest still break it.
const dropped = (at: Drawn, check: Check, rule: string, draws: ReadonlyArray<Draw>) => {
  const breaks = (kept: ReadonlyArray<Samples>) =>
    judged({ ...at, kept }, draws, check.properties).verdicts.some((v) => v.rule === rule);

  const smallest = subsetsOf(at.kept).find(
    (kept) => kept.length === at.kept.length || breaks(kept),
  );

  return (
    smallest ??
    at.kept.reduce<ReadonlyArray<Samples>>((kept, part) => {
      const rest = kept.filter((p) => p !== part);

      return rest.length > 0 && breaks(rest) ? rest : kept;
    }, at.kept)
  );
};

// RETURN_TYPE: the exported Failure contract, which the inconclusive and shrunk branches would split.
const inconclusive = (seed: number, parts: ReadonlyArray<Samples>, message: string): Failure => ({
  seed,
  rule: HORIZON_RULE,
  breaches: [`inconclusive: ${message}`],
  drawn: 0,
  shrinks: 0,
  fixtures: parts.map((p) => p.id),
  steps: [],
  story: "",
});

/**
 * Generates runs of a fixture, or of several fixtures in one Runtime, from seeds and applies
 * properties to each.
 *
 * **When to use**
 *
 * Over a fixture's samples, with the run rules as properties, to find sequences no hand-written
 * Story tried. Over several fixtures, to find what happens between apps that share a page's store,
 * network, clock and tab.
 *
 * **Details**
 *
 * Each seed draws one run with the profile on a fresh production Runtime, through Effect's
 * `Arbitrary`, and the same seed always draws the same run. A run ensures every actor, then takes
 * one step per draw: a person's sample step, a burst of 50 to 2,000 of one, think time, a reload or a
 * disposal, by
 * the profile's weights. Before each step it arms each endpoint's next answer and the store's next
 * write from the profile's tables, as wire, storage and control words; held answers are released
 * when their drawn delay passes. Every answer is a handler's: a word decides only delivery, and a
 * failure is a control that changes the server's truth. A draw invalid where it falls (a release
 * with nothing held) gives no step, the draw after a Runtime's disposal reloads the tab, and a
 * hold, drop or refuse that no call or write used is left out. After
 * its draws a run quiets its world: every held call and write is released and time passes every
 * deadline and bound; work still pending then is an `inconclusive` failure. A run that
 * breaks a property is shrunk by Arbitrary over its draws, keeping only smaller runs that break the
 * same rule, and printed as a chained `Story.app(...)`.
 *
 * Several fixtures run as one app in one Runtime: one fake store, one network, one clock, one tab
 * whose reloads and disposal reach them all, and every sample step of each. A run of several where
 * no step touched two of them shared nothing, so it is an `inconclusive` failure. A
 * failing run of several first drops whole fixtures while the rest still break the same rule, then
 * shrinks its draws; an inconclusive one keeps them all. The `mix` profile is drawn for several
 * fixtures: its slow store writes, answers in flight and reloads make their work overlap, where the
 * usual profile's runs rarely do.
 *
 * **Gotchas**
 *
 * - A turn limit is a `turn limit` failure; a script fault is a fault of the generator and
 *   is thrown.
 * - Shrinking is bounded at 1,000 candidates, so a shrunk run is small, not always smallest.
 * - It stops at the first seed that fails, so the result holds at most one failure.
 * - A check that ends `Exhausted` or `ReplayMismatch` judged nothing, so it is a failure of
 *   `inconclusive` with Arbitrary's message and no Story.
 * - A run of several fixtures prints as steps under a comment line, not as a Story to paste: a
 *   Story holds one setup.
 * - Several fixtures must not share a machine, a server or a capture interval (a script fault).
 */
// RETURN_TYPE: the exported Failure contract, which the shrunk run's branches would split.
export const propertyTest = (
  fixtures: Fixtures,
  options: {
    readonly profile: Profile;
    readonly properties: ReadonlyArray<Property>;
    readonly seeds: ReadonlyArray<number>;
  },
): ReadonlyArray<Failure> => {
  const all = partsOf(fixtures);

  // RETURN_TYPE: one Failure list for the passed and the shrunk branch, which inference would split.
  const checked = (seed: number): ReadonlyArray<Failure> => {
    const first: Drawn = { all, kept: all, drawing: options.profile, seed };
    const found = search(first, options, Option.none(), 0);

    if (found.result._tag === "Passed") return [];

    if (found.result._tag !== "Falsified")
      return [
        inconclusive(seed, all, Arbitrary.formatCheckFailure(found.result) ?? found.result._tag),
      ];

    const target = Option.getOrElse(found.rule, () => LIMIT_RULE);

    // An inconclusive run judged nothing about any one fixture, so none is dropped. Otherwise
    // fixtures are dropped over the first draws, the draws shrink, and fixtures are dropped again
    // over the shrunk draws, where another fixture's work no longer stands in the way.
    // RETURN_TYPE: the Drawn record both branches return.
    const drop = (at: Drawn, draws: ReadonlyArray<Draw>): Drawn =>
      target === HORIZON_RULE ? at : { ...at, kept: dropped(at, options, target, draws) };

    const once = drop(first, found.result.initialInput);
    const shrunk = search(once, options, Option.some(target), MAX_SHRINKS);

    if (shrunk.result._tag !== "Falsified")
      return [
        inconclusive(
          seed,
          once.kept,
          Arbitrary.formatCheckFailure(shrunk.result) ?? shrunk.result._tag,
        ),
      ];

    const at = drop(once, shrunk.result.shrunkInput);
    const parts = at.kept;
    const id = idOf(at);
    const last = judged(at, shrunk.result.shrunkInput, options.properties);
    const steps = Option.match(last.generated, { onNone: () => [], onSome: (g) => g.steps });
    const [only] = parts;

    return [
      {
        seed,
        rule: target,
        breaches: last.verdicts.filter((v) => v.rule === target).flatMap((v) => v.breaches),
        drawn: found.result.initialInput.length,
        shrinks: shrunk.result.shrinks,
        fixtures: parts.map((p) => p.id),
        steps,
        story:
          parts.length === 1 && only !== undefined
            ? print(only, id, steps)
            : printMix(parts, mixOf(parts), id, steps),
      },
    ];
  };

  for (const seed of options.seeds) {
    const failed = checked(seed);

    if (failed.length > 0) return failed;
  }

  return [];
};
