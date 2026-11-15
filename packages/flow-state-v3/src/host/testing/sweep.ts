import { Option, Predicate } from "effect";
import type { Phase } from "../../core/world.ts";
import { type ActorId, actorKey } from "../../core/world.ts";
import { generateSource, quieting, runSource } from "./generate.ts";
import type { Source, View } from "./run.ts";
import { type Property, print, type Samples } from "./samples.ts";
import { Step, WorldWord } from "./steps.ts";

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
 * run printed as a Story; unreached, why: no drive put a write in the phase, or the fault could not
 * fire while a write stood there.
 */
export type Cell = {
  readonly phase: string;
  readonly fault: Fault;
  readonly outcome:
    | { readonly _tag: "Reached"; readonly breaches: ReadonlyArray<string>; readonly story: string }
    | { readonly _tag: "Unreached"; readonly why: "no write in the phase" }
    | {
        readonly _tag: "Unreached";
        readonly why: "the fault did not fire";
        readonly story: string;
      };
};

type Reach = { readonly prefix: ReadonlyArray<Step>; readonly actor: ActorId };

const standing = (view: View, phase: string, actor: ActorId) =>
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
const ON_WIRE: ReadonlySet<string> = new Set(["OnWire", "Cancelling"]);

// The steps of a fault given while a write stands in its phase, or none when it cannot fire there;
// a storage refusal fires later, when the refused write is issued, and is judged then.
const faultOf = (fault: Fault, phase: string, actor: ActorId, view: View) => {
  const steps: Record<Fault, () => ReadonlyArray<Step>> = {
    reload: () => [Step.reload({ reattach: true, heldWrites: "abort" })],
    "lost answer": () =>
      Option.match(Option.fromUndefinedOr(ON_WIRE.has(phase) ? view.held[0] : undefined), {
        onNone: () => [],
        onSome: (held) => [
          Step.world({ words: [WorldWord.wire({ ...held, word: "lose", at: "response" })] }),
        ],
      }),
    "storage refusal": () => [Step.world({ words: [WorldWord.storage({ word: "refuse" })] })],
    "actor disposal": () => [Step.dispose({ actor, how: "dispose" })],
    forget: () => [Step.dispose({ actor, how: "forget" })],
    release: () => Array.from({ length: view.uses(actor) }, () => Step.detach({ actor })),
    "disposal bound": () => [Step.disposeRuntime(), Step.advance({ duration: "5 seconds" })],
  };

  return steps[fault]();
};

const refusedOf = (view: View) => view.writes.filter((w) => w === "refused").length;

// One run of a cell: the drive's steps to the phase, the fault, at most one nudge (a sample step
// of the write's actor, which gives it a turn to write while a refusal waits), then quiet.
const tryCell = (
  samples: Samples,
  id: string,
  phase: string,
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

  const waits = [
    ...Option.toArray(nudge),
    Step.world({ words: [WorldWord.storage({ word: "release" })] }),
  ];

  const give = (view: View) => {
    given = true;
    const steps = faultOf(fault, phase, reach.actor, view);
    fired = fault !== "storage refusal" && steps.length > 0;
    refusedBefore = refusedOf(view);
    stood = true;
    queue.push(...steps);

    return "skip" as const;
  };

  // While a refusal waits for its write, the nudge, then a held write's release, give it one.
  const wait = (view: View) => {
    if (refusedOf(view) > refusedBefore) fired = stood;
    stood = standing(view, phase, reach.actor);
    const step = !fired && stood ? waits.shift() : undefined;
    const pointless = step?._tag === "world" && view.heldWrites === 0;

    return step === undefined || pointless ? quiet(view) : step;
  };

  const source: Source = (view) => {
    const prefixed = queue.shift();

    if (prefixed !== undefined) return prefixed;

    if (!given) return give(view);

    return fault === "storage refusal" && !fired ? wait(view) : quiet(view);
  };

  return { generated: runSource(samples, id, source), fired };
};

// RETURN_TYPE: the exported Cell contract, which the two outcomes' literals would widen.
const cellOf = (
  samples: Samples,
  phase: string,
  fault: Fault,
  reach: Reach,
  properties: ReadonlyArray<Property>,
): Cell => {
  const id = `${samples.id}/${phase}-${fault.replaceAll(" ", "-")}`;

  const nudges = samples.steps
    .filter((s) => s._tag === "send" && actorKey(s.actor) === actorKey(reach.actor))
    .map(Option.some);

  const tries =
    fault === "storage refusal" ? [Option.none<Step>(), ...nudges] : [Option.none<Step>()];

  const first = tryCell(samples, id, phase, fault, reach, Option.none());

  const { generated, fired } = first.fired
    ? first
    : (tries
        .slice(1)
        .map((nudge) => tryCell(samples, id, phase, fault, reach, nudge))
        .find((t) => t.fired) ?? first);

  return fired
    ? {
        phase,
        fault,
        outcome: {
          _tag: "Reached",
          breaches: properties.flatMap((p) => p.breaches(generated.run)),
          story: print(samples, id, generated.steps),
        },
      }
    : {
        phase,
        fault,
        outcome: {
          _tag: "Unreached",
          why: "the fault did not fire",
          story: print(samples, id, generated.steps),
        },
      };
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
 * turn until every phase is found, so a phase that only a loss or a held write opens is reached.
 * The fault is given at the first step boundary where a write of a sampled actor stands in the
 * phase; a lost answer needs a call open then, and a storage refusal counts only when the write it
 * refuses is issued in a step that began with the write still in the phase. Every cell is returned:
 * reached with its breaches, or unreached with why.
 */
export const pairSweep = (
  samples: Samples,
  options: { readonly properties: ReadonlyArray<Property>; readonly seeds: ReadonlyArray<number> },
) => {
  const found = new Map<string, Reach>();

  for (const seed of options.seeds) if (found.size < PHASES.length) reachOf(samples, seed, found);

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
