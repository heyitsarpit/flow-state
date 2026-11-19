import { Option, Predicate } from "effect";
import { RuntimeDefaults } from "../../core/defaults.ts";
import type { Phase } from "../../core/world.ts";
import { type ActorId, actorKey, sameActor } from "../../core/world.ts";
import {
  closing,
  generateSource,
  inconclusiveOf,
  pendingOf,
  quieting,
  runSource,
} from "./generate.ts";
import type { Source, View } from "./run.ts";
import { type Property, print, type Samples } from "./samples.ts";
import { Step, StoryFailed, WorldWord } from "./steps.ts";

/**
 * The phases a write's head can stand in, as the pair sweep crosses them.
 */
export const PHASES: ReadonlyArray<Phase["_tag"]> = [
  "Acknowledging",
  "Unsent",
  "Withdrawing",
  "Recapturing",
  "Resending",
  "OnWire",
  "Cancelling",
  "Held",
];

/**
 * The faults the pair sweep gives a write in each phase: a reload, a lost answer, a refused storage
 * write, the actor's disposal, forget and release, and the Runtime's disposal with its bound.
 */
export const FAULTS = [
  "reload",
  "lost answer",
  "storage refusal",
  "actor disposal",
  "forget",
  "release",
  "disposal bound",
] as const;

/**
 * One of the pair sweep's faults.
 */
export type Fault = (typeof FAULTS)[number];

/**
 * One cell of the pair sweep: a phase and a fault. Reached, it holds the rules' breaches and the
 * run printed as a Story; unreached, why: no drive put a write in the phase, the drive replayed did
 * not put it there again, or the fault could not fire while a write stood there.
 */
export type Cell = {
  readonly phase: Phase["_tag"];
  readonly fault: Fault;
  readonly outcome:
    | { readonly _tag: "Reached"; readonly breaches: ReadonlyArray<string>; readonly story: string }
    | { readonly _tag: "Unreached"; readonly why: "no write in the phase" }
    | {
        readonly _tag: "Unreached";
        readonly why: "the fault did not fire" | "the drive did not replay to the phase";
        readonly story: string;
      };
};

type Reach = { readonly prefix: ReadonlyArray<Step>; readonly actor: ActorId };

const standing = (view: View, phase: Phase["_tag"], actor: ActorId) =>
  view.lanes().some((lane) => lane.phase === phase && lane.actor === actorKey(actor));

// Drives one seed and notes, for each phase, the steps before a write first stood in it.
const reachOf = (samples: Samples, seed: number, found: Map<string, Reach>) => {
  const inner = generateSource(samples, "drive", seed);
  const given: Array<Step> = [];

  const source: Source = (view) => {
    for (const lane of view.lanes()) {
      const actor = samples.actors.find((a) => actorKey(a.actor) === lane.actor);

      if (!found.has(lane.phase) && actor !== undefined)
        found.set(lane.phase, { prefix: [...given], actor: actor.actor });
    }

    const step = inner(view);

    if (Predicate.isObject(step)) given.push(step);

    return step;
  };

  runSource(samples, `${samples.id}/drive-${seed}`, source);
};

// Only a head on the wire has a call whose answer can be lost.
const ON_WIRE: ReadonlySet<Phase["_tag"]> = new Set<Phase["_tag"]>(["OnWire", "Cancelling"]);

// Whether a call's input carries an Attempt's id, the idempotency key a write sends, as any of its
// values.
// RETURN_TYPE: the function recurses, so its result type cannot be inferred.
const carries = (input: unknown, attempt: string): boolean =>
  input === attempt ||
  (Predicate.isObject(input) && Object.values(input).some((v) => carries(v, attempt)));

// The held call of the write standing in the phase: the one carrying its Attempt's id, and only
// when it is its endpoint's oldest held call, the one a wire word acts on.
const callOf = (view: View, phase: Phase["_tag"], actor: ActorId) =>
  Option.flatMap(
    Option.fromUndefinedOr(
      view.lanes().find((lane) => lane.phase === phase && lane.actor === actorKey(actor)),
    ),
    (lane) =>
      Option.filter(
        Option.fromUndefinedOr(view.held.find((h) => carries(h.input, lane.attempt))),
        (call) =>
          view.held.find((h) => h.server === call.server && h.endpoint === call.endpoint) === call,
      ),
  );

// Whether the oldest held store write acknowledges the write standing in the phase: one batch is
// out at a time, so no later write can be issued while the write waits on it.
const waitsOnHeld = (view: View, phase: Phase["_tag"], actor: ActorId) =>
  view
    .lanes()
    .some(
      (lane) =>
        lane.phase === phase &&
        lane.actor === actorKey(actor) &&
        (view.heldWrites[0] ?? []).includes(lane.attempt),
    );

// The steps of a fault given while a write stands in its phase, or none when it cannot fire there.
// A storage refusal refuses the held write the write waits on; with none, it refuses the next
// write, which fires later, when that write is issued, and is judged then.
const faultOf = (fault: Fault, phase: Phase["_tag"], actor: ActorId, view: View) => {
  const steps: Record<Fault, () => ReadonlyArray<Step>> = {
    reload: () => [Step.reload({ reattach: true, heldWrites: "abort" })],
    "lost answer": () =>
      Option.match(ON_WIRE.has(phase) ? callOf(view, phase, actor) : Option.none(), {
        onNone: () => [],
        onSome: ({ server, endpoint }) => [
          Step.world({
            words: [WorldWord.wire({ server, endpoint, word: "lose", at: "response" })],
          }),
        ],
      }),
    "storage refusal": () => [
      Step.world({
        words: [
          WorldWord.storage({
            word: waitsOnHeld(view, phase, actor) ? "refuseHeld" : "refuse",
          }),
        ],
      }),
    ],
    // An app closes a provider's consumers before it: the Runtime refuses it while they are bound.
    "actor disposal": () =>
      closing(view, actor).map((closed) => Step.dispose({ actor: closed, how: "dispose" })),
    forget: () => [Step.dispose({ actor, how: "forget" })],
    release: () => Array.from({ length: view.uses(actor) }, () => Step.detach({ actor })),
    "disposal bound": () => [
      Step.disposeRuntime({ forget: false }),
      Step.advance({ duration: RuntimeDefaults.disposalBound }),
    ],
  };

  return steps[fault]();
};

const refusedOf = (view: View) => view.writes.filter((w) => w === "refused").length;

// One run of a cell: the drive's steps to the phase, the fault, at most one nudge (a sample step
// of the write's actor, which gives it a turn to write while a refusal waits), then quiet.
const tryCell = (
  samples: Samples,
  id: string,
  phase: Phase["_tag"],
  fault: Fault,
  reach: Reach,
  nudge: Option.Option<Step>,
) => {
  const queue = [...reach.prefix];
  const quiet = quieting();
  let given = false;
  let fired = false;
  let refusedBefore = 0;
  let stood = false;
  let replayed = false;
  let pending: ReadonlyArray<string> = [];

  const waits = [
    ...Option.toArray(nudge),
    Step.world({ words: [WorldWord.storage({ word: "release" })] }),
  ];

  const quietly: Source = (view) => {
    const step = quiet(view);

    if (step === "done") pending = pendingOf(view);

    return step;
  };

  // The drive's steps replayed must leave the write in its phase; a fault given elsewhere would
  // judge some other cell.
  const give = (view: View) => {
    given = true;
    stood = standing(view, phase, reach.actor);
    replayed = stood;
    const steps = stood ? faultOf(fault, phase, reach.actor, view) : [];
    fired =
      steps.length > 0 && (fault !== "storage refusal" || waitsOnHeld(view, phase, reach.actor));
    refusedBefore = refusedOf(view);
    queue.push(...steps);

    return "skip" as const;
  };

  // While a refusal waits for its write, the nudge, then a held write's release, give it one; once
  // the write's own batch is the oldest held, that batch is refused.
  const wait = (view: View) => {
    if (refusedOf(view) > refusedBefore) fired = stood;
    stood = standing(view, phase, reach.actor);

    if (!fired && stood && waitsOnHeld(view, phase, reach.actor)) {
      fired = true;

      return Step.world({ words: [WorldWord.storage({ word: "refuseHeld" })] });
    }

    const step = !fired && stood ? waits.shift() : undefined;
    const pointless = step?._tag === "world" && view.heldWrites.length === 0;

    return step === undefined || pointless ? quietly(view) : step;
  };

  const source: Source = (view) => {
    const prefixed = queue.shift();

    if (prefixed !== undefined) return prefixed;

    if (!given) return give(view);

    return fault === "storage refusal" && !fired ? wait(view) : quietly(view);
  };

  const beforeGiven = () => !given;

  try {
    const generated = runSource(samples, id, source);

    return { steps: generated.steps, run: Option.some(generated.run), fired, replayed, pending };
  } catch (fault) {
    // A drive that does not replay can fail its own script (a release with nothing held) before
    // the fault is given: that cell is unreached, not a fault of the sweep.
    if (fault instanceof StoryFailed && beforeGiven())
      return { steps: reach.prefix, run: Option.none(), fired: false, replayed: false, pending };

    // oxlint-disable-next-line lint-bomb/no-throw-in-core -- a script fault after the fault is given is a defect of the sweep, never a finding about the app
    throw fault;
  }
};

// RETURN_TYPE: the exported Cell contract, which the two outcomes' literals would widen.
const cellOf = (
  samples: Samples,
  phase: Phase["_tag"],
  fault: Fault,
  reach: Reach,
  properties: ReadonlyArray<Property>,
): Cell => {
  const id = `${samples.id}/${phase}-${fault.replaceAll(" ", "-")}`;

  const nudges = samples.steps
    .filter((s) => s._tag === "send" && sameActor(s.actor, reach.actor))
    .map(Option.some);

  const tries =
    fault === "storage refusal" ? [Option.none<Step>(), ...nudges] : [Option.none<Step>()];

  const first = tryCell(samples, id, phase, fault, reach, Option.none());

  const { steps, run, fired, replayed, pending } = first.fired
    ? first
    : (tries
        .slice(1)
        .map((nudge) => tryCell(samples, id, phase, fault, reach, nudge))
        .find((t) => t.fired) ?? first);

  return Option.match(
    Option.filter(run, () => fired),
    {
      onSome: (reached) => ({
        phase,
        fault,
        outcome: {
          _tag: "Reached",
          breaches: [
            ...properties.flatMap((p) => p.breaches(reached)),
            ...inconclusiveOf(reached, pending).flatMap((v) => v.breaches),
          ],
          story: print(samples, id, steps),
        },
      }),
      onNone: () => ({
        phase,
        fault,
        outcome: {
          _tag: "Unreached",
          why: replayed ? "the fault did not fire" : "the drive did not replay to the phase",
          story: print(samples, id, steps),
        },
      }),
    },
  );
};

/**
 * Drives a fixture until a write stands in each phase, then gives it each fault, quiets the world
 * and applies the properties.
 *
 * **When to use**
 *
 * Once per fixture as the deterministic floor of a test gate: every phase a write can hold, crossed
 * with every fault, each driven once.
 *
 * **Details**
 *
 * The drive is the usual profile with lost answers and held and refused writes, from each seed in
 * turn until every phase in `stopAt` is found (all of `PHASES` drives every seed), so a phase that
 * only a loss or a held write opens is reached.
 * The fault is given at the first step boundary where a write of a sampled actor stands in the
 * phase, and only if the drive's steps replayed put it there again; a lost answer loses the write's
 * own call (the held call carrying its Attempt's id, when it is its endpoint's oldest), and a
 * storage refusal refuses the held store write that acknowledges the write when it is the oldest
 * held one, or else counts only when the write it refuses is issued in a step that began with the
 * write still in the phase. A reached cell's breaches include work still pending after the quiet
 * phase and a run that recorded nothing, as `propertyTest` judges them. Every cell is returned:
 * reached with its breaches, or unreached with why.
 */
export const pairSweep = (
  samples: Samples,
  options: {
    readonly properties: ReadonlyArray<Property>;
    readonly seeds: ReadonlyArray<number>;
    readonly stopAt: ReadonlyArray<Phase["_tag"]>;
  },
) => {
  const found = new Map<string, Reach>();

  for (const seed of options.seeds)
    if (!options.stopAt.every((phase) => found.has(phase))) reachOf(samples, seed, found);

  return PHASES.flatMap((phase) =>
    FAULTS.map((fault) => {
      const reach = found.get(phase);

      return reach === undefined
        ? ({
            phase,
            fault,
            outcome: { _tag: "Unreached", why: "no write in the phase" },
          } satisfies Cell)
        : cellOf(samples, phase, fault, reach, options.properties);
    }),
  );
};
