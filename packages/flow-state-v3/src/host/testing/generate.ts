// @effect-diagnostics unstableApiUsage:off -- generation and shrinking are Effect's Arbitrary, which Effect marks unstable; chosen over a generator of our own.
import { Arbitrary, Duration, Effect, Option, Schema } from "effect";
import type { AnyServer } from "./fake.ts";
import { runFrom, type Source, type StoryRun, type View } from "./run.ts";
import { type Property, print, type Samples } from "./samples.ts";
import { Step, StoryFailed, StoryTurnLimit, WorldWord } from "./steps.ts";
import { SubjectId } from "./story.ts";

/**
 * The two profiles a generated run draws with: `usual`, people on a healthy network, and `stress`,
 * everything at once.
 */
export type Profile = "usual" | "stress";

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

// The usual and stress runs (Testing O6): what a person does per step, what the server answers per
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
};

const LENGTHS: Record<Drawing, readonly [number, number]> = {
  usual: [40, 150],
  stress: [100, 300],
  drive: [40, 150],
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

const WRITE_SALT = 1000;

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
const armedSteps = (samples: Samples, at: Endpoint, answer: Answer, n: number) => {
  const hold = [wire(at, "hold", "request")];
  const lostButLanded = [wire(at, "drop", "response")];

  const steps: Record<Answer, () => ReadonlyArray<Step>> = {
    ok: () => [],
    latency: () => hold,
    slow: () => hold,
    reordered: () => hold,
    late: () => hold,
    never: () => hold,
    fail: () => Option.toArray(Option.map(pick(samples.failures, n), control)),
    failButLanded: () =>
      Option.match(pick(samples.landedFailures, n), {
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
const sourceOf = (samples: Samples, drawing: Drawing, draws: ReadonlyArray<Draw>) => {
  let pending: ReadonlyArray<string> = [];
  const queue: Array<Step> = samples.actors.map(({ actor }) => Step.ensure({ actor }));
  const front: Array<Step> = [];
  const endpoints = endpointsOf(samples);
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
    drawing === "stress"
      ? draws.length - 1 - Math.floor(((draws[0]?.[1] ?? 0) * draws.length) / RANGE)
      : -1;

  let offlineLeft = 0;
  let offline: Option.Option<Span> = Option.none();
  let online = false;
  let given = 0;
  const tally = new Map<string, number>();
  let quieted = false;
  const offlineNow = () => Option.exists(offline, (o) => now >= o.from && now < o.until);

  // Once the call an answer was armed for has arrived, its release is timed and the endpoint's
  // next answer is armed; offline, every answer is Lost or Never.
  const armEndpoint = (view: View, digits: Draw, at: Endpoint, slot: number) => {
    const calls = view.calls(at.server, at.endpoint);
    const before = armed.get(keyOf(at));

    if (before !== undefined && calls === before.calls) return;
    // Each arming of an endpoint draws afresh, though one draw's digits serve many steps.
    const n = slot * 1_000_003 + calls;

    if (before !== undefined) {
      const delay = delayOf(before.answer, mix(digits[2], n));

      if (Option.isSome(delay))
        timers.push({ due: now + delay.value, at: Option.some(at), afterCalls: 0 });

      if (before.answer === "reordered")
        timers.push({ due: Number.POSITIVE_INFINITY, at: Option.some(at), afterCalls: calls + 1 });
    }

    const offlineAnswer: Answer = mix(digits[3], n) % 2 === 0 ? "lost" : "never";

    const answer = offlineNow()
      ? offlineAnswer
      : Option.getOrElse(weighted(ANSWERS[drawing], mix(digits[3], n)), () => "ok" as const);

    armed.set(keyOf(at), { calls, answer });

    if (!offlineNow()) tally.set(answer, (tally.get(answer) ?? 0) + 1);
    front.push(...armedSteps(samples, at, answer, mix(digits[1], n)));
  };

  const arm = (view: View, digits: Draw) => {
    for (const [n, at] of endpoints.entries()) armEndpoint(view, digits, at, n);
    const count = view.writes.length;

    if (Option.exists(writes, (w) => w.count === count)) return;

    if (Option.exists(writes, (w) => w.write === "slow"))
      timers.push({
        due: now + span(50, 800, mix(digits[2], WRITE_SALT + count)),
        at: Option.none(),
        afterCalls: 0,
      });

    landOnReload = landOnReload || Option.exists(writes, (w) => w.write === "land");

    const write = Option.getOrElse(
      weighted(WRITES[drawing], mix(digits[3], WRITE_SALT + count)),
      () => "ack" as const,
    );

    writes = Option.some({ count, write });
    tally.set(`write ${write}`, (tally.get(`write ${write}`) ?? 0) + 1);

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
    const user = live ? Option.toArray(pick(samples.steps, a)) : [];
    const actor = pick(samples.actors, a);

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
      disposeRuntime: () => (live ? [Step.disposeRuntime()] : []),
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
                  : Step.ensure({ actor: it.actor }),
              ),
            )
          : [],
      control: () => Option.toArray(Option.map(pick(samples.controls, a), control)),
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
 * what was still pending at its horizon, its offline span, and how many of each answer and write it
 * drew outside that span.
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
  readonly tally: ReadonlyMap<string, number>;
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

const drawnRun = (samples: Samples, id: string, drawing: Drawing, draws: ReadonlyArray<Draw>) => {
  const drawn = sourceOf(samples, drawing, draws);

  return {
    ...runSource(samples, id, drawn.source),
    pending: drawn.pending(),
    offline: drawn.offline(),
    tally: drawn.tally(),
  };
};

/**
 * The step source one drawing of a fixture's samples gives from a seed.
 */
export const generateSource = (samples: Samples, drawing: Drawing, seed: number) =>
  sourceOf(samples, drawing, drawsFrom(drawing, seed)).source;

/**
 * Runs one drawing of a fixture's samples from a seed and returns the run it gives.
 */
export const generate = (
  samples: Samples,
  options: { readonly drawing: Drawing; readonly seed: number },
) =>
  drawnRun(
    samples,
    `${samples.id}/${options.drawing}-${options.seed}`,
    options.drawing,
    drawsFrom(options.drawing, options.seed),
  );

type Verdict = { readonly rule: string; readonly breaches: ReadonlyArray<string> };

const LIMIT_RULE = "Stories I7";

const HORIZON_RULE = "Testing O6";

/**
 * Why a quieted run judged nothing: work still pending at its horizon, or no evidence recorded.
 * Either is a breach of Testing O6, so such a run never passes.
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

// The breaches a run of draws gives: a turn limit, and work still pending at the horizon, are
// breaches of their own; a script fault is a fault of the generator, so it is thrown.
const judged = (
  samples: Samples,
  id: string,
  drawing: Drawing,
  draws: ReadonlyArray<Draw>,
  properties: ReadonlyArray<Property>,
) => {
  try {
    const generated = drawnRun(samples, id, drawing, draws);

    const verdicts: ReadonlyArray<Verdict> = properties.flatMap((p) => {
      const breaches = p.breaches(generated.run);

      return breaches.length > 0 ? [{ rule: p.rule, breaches }] : [];
    });

    return {
      generated: Option.some(generated),
      verdicts: [...verdicts, ...inconclusiveOf(generated.run, generated.pending)],
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
 * number of draws it was drawn with, and the shrunk run as steps and printed as a Story.
 */
export type Failure = {
  readonly seed: number;
  readonly rule: string;
  readonly breaches: ReadonlyArray<string>;
  readonly drawn: number;
  readonly steps: ReadonlyArray<Step>;
  readonly story: string;
};

/**
 * Generates runs of a fixture from seeds and applies properties to each.
 *
 * **When to use**
 *
 * Over a fixture's samples, with the run rules as properties, to find sequences no hand-written
 * Story tried.
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
 * deadline and bound; work still pending then is inconclusive, a breach of Testing O6. A run that
 * breaks a property is shrunk by Arbitrary over its draws, keeping only smaller runs that break the
 * same rule, and printed as a chained `Story.app(...)`.
 *
 * **Gotchas**
 *
 * - A turn limit counts as a breach of Stories I7; a script fault is a fault of the generator and
 *   is thrown.
 * - Shrinking is bounded at 1,000 candidates, so a shrunk run is small, not always smallest.
 * - It stops at the first seed that fails, so the result holds at most one failure.
 * - A check that ends `Exhausted` or `ReplayMismatch` judged nothing, so it is a failure of
 *   Testing O6 with Arbitrary's message and no Story.
 */
// RETURN_TYPE: the exported Failure contract, which the shrunk run's branches would split.
export const propertyTest = (
  samples: Samples,
  options: {
    readonly profile: Profile;
    readonly properties: ReadonlyArray<Property>;
    readonly seeds: ReadonlyArray<number>;
  },
): ReadonlyArray<Failure> => {
  // RETURN_TYPE: one Failure list for the passed and the shrunk branch, which inference would split.
  const checked = (seed: number): ReadonlyArray<Failure> => {
    const id = `${samples.id}/${options.profile}-${seed}`;
    let rule: Option.Option<string> = Option.none();

    const property = (draws: ReadonlyArray<Draw>) => {
      const { verdicts } = judged(samples, id, options.profile, draws, options.properties);

      return Option.match(rule, {
        onNone: () => {
          rule = Option.map(Option.fromUndefinedOr(verdicts[0]), (v) => v.rule);

          return verdicts.length === 0;
        },
        onSome: (target) => !verdicts.some((v) => v.rule === target),
      });
    };

    // oxlint-disable-next-line lint-bomb/no-effect-runner-in-domain -- a generated run is checked synchronously at the test's boundary
    const result = Effect.runSync(
      Arbitrary.checkEffect(drawsOf(options.profile), property, {
        runs: 1,
        seed,
        size: LENGTHS[options.profile][1],
        maxShrinks: MAX_SHRINKS,
      }),
    );

    if (result._tag === "Passed") return [];

    if (result._tag === "Exhausted" || result._tag === "ReplayMismatch")
      return [
        {
          seed,
          rule: HORIZON_RULE,
          breaches: [`inconclusive: ${Arbitrary.formatCheckFailure(result) ?? result._tag}`],
          drawn: 0,
          steps: [],
          story: "",
        },
      ];
    const target = Option.getOrElse(rule, () => LIMIT_RULE);
    const shrunk = judged(samples, id, options.profile, result.shrunkInput, options.properties);
    const steps = Option.match(shrunk.generated, { onNone: () => [], onSome: (g) => g.steps });

    return [
      {
        seed,
        rule: target,
        breaches: shrunk.verdicts.filter((v) => v.rule === target).flatMap((v) => v.breaches),
        drawn: result.initialInput.length,
        steps,
        story: print(samples, id, steps),
      },
    ];
  };

  for (const seed of options.seeds) {
    const failed = checked(seed);

    if (failed.length > 0) return failed;
  }

  return [];
};
