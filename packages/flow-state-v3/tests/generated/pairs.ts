import { expect, it } from "vite-plus/test";
import { manifests, type Reach } from "../../fixtures/index.ts";
import { FAULTS, generate, PHASES, pairSweep, type Samples } from "../../src/host/testing/index.ts";
import { rules } from "../rules/rules.ts";
import { LIMITS } from "../limits.ts";

type PhaseTag = (typeof PHASES)[number];

const ON_WIRE = new Set<PhaseTag>(["OnWire", "Cancelling"]);

const PERSISTED_PHASES = new Set<PhaseTag>(["Acknowledging", "Recapturing", "Withdrawing"]);

type Cell = { readonly r: Reach; readonly phase: PhaseTag; readonly fault: string };

// The lifecycle rules that forbid a cell, each with why, in the order they are read.
const FORBIDDEN: ReadonlyArray<readonly [(c: Cell) => boolean, string]> = [
  [({ r }) => !r.writes, "the fixture has no write operation"],
  [
    ({ phase }) => phase === "Unsent" || phase === "Resending",
    "the turn's end invokes the head in the step that enters the phase (WriteLanes model, invoked)",
  ],
  [
    ({ phase }) => phase === "Cancelling",
    "a cancel's ending is queued when the call's fiber exits (WriteLanes R14), and a fake's interrupted call exits at once, before the cancelling Story step ends",
  ],
  [
    ({ r, phase }) => !r.persisted && PERSISTED_PHASES.has(phase),
    "a local identity is never acknowledged and has no lane record (WriteAhead R13, R15)",
  ],
  [
    ({ r, phase }) => phase === "Withdrawing" && !r.cancelsAcknowledging,
    "no cancel reaches a head while it is Acknowledging (the fixture's machine)",
  ],
  [
    ({ r, phase }) => phase === "Held" && !r.retainsUnknown,
    "an unknown ending keeps no Held lane (WriteLanes I5)",
  ],
  [
    ({ phase, fault }) => fault === "lost answer" && !ON_WIRE.has(phase),
    "no call is on the wire in this phase",
  ],
  [
    ({ r, fault }) => fault === "storage refusal" && !r.persisted && !r.storesBeside,
    "a local identity writes nothing (WriteAhead R15)",
  ],
];

// Whether only the drive's seed decides if a cell's fault fires: a storage refusal meets a local
// write only when another identity happens to save while it is out. Such a cell may stay unreached;
// reached, the rules judge it like any other.
const seedDecides = (r: Reach, fault: string) =>
  fault === "storage refusal" && !r.persisted && r.storesBeside;

// Why a cell cannot be reached, from the lifecycle rules, or none when it can.
const whyUnreachable = (r: Reach, phase: PhaseTag, fault: string) =>
  FORBIDDEN.find(([forbids]) => forbids({ r, phase, fault }))?.[1] ?? "";

// The seeds a drive takes. The usual tier stops once every reachable phase is found, and a
// reachable phase still unfound at its cap fails the sweep. The stress tier drives every one of its
// seeds, past the reachable phases, to probe for a forbidden one: 200, which find every fixture's
// reachable phases (by seed 82 at most), but for the three that need more and keep 1,000: shop-store
// first reaches Recapturing at seed 362, shop-checkout-sends past seed 200, and auth-session Held
// and Recapturing at 955.
const seedsUpTo = (count: number) => Array.from({ length: count }, (_, n) => n + 1);

const USUAL_SEEDS = seedsUpTo(1000);

const STRESS_SEEDS = seedsUpTo(200);

const STRESS_SEEDS_OF = new Map([
  ["shop-store", USUAL_SEEDS],
  ["shop-checkout-sends", USUAL_SEEDS],
  ["auth-session", USUAL_SEEDS],
]);

// The phases a write of the fixture can stand in: those some fault is not forbidden in.
const reachablePhases = (reachable: Reach) =>
  PHASES.filter((phase) => FAULTS.some((fault) => whyUnreachable(reachable, phase, fault) === ""));

/**
 * The pair sweep's check for one samples set: every reached cell keeps every run rule, and the
 * cells left unreached are exactly those the lifecycle rules forbid, each named with why. The usual
 * tier drives seeds until every reachable phase is found; the stress tier drives all of its seeds,
 * so a forbidden phase a late seed would open is probed too.
 */
export const sweepChecks = (samples: Samples, reachable: Reach, tier: "usual" | "stress") => () => {
  const cells = pairSweep(samples, {
    properties: rules,
    seeds: tier === "usual" ? USUAL_SEEDS : (STRESS_SEEDS_OF.get(samples.id) ?? STRESS_SEEDS),
    stopAt: tier === "usual" ? reachablePhases(reachable) : PHASES,
  });

  const expected = PHASES.flatMap((phase) =>
    FAULTS.flatMap((fault) => {
      const why = whyUnreachable(reachable, phase, fault);

      return why === "" ? [] : [`${phase} × ${fault}: ${why}`];
    }),
  );

  const unreached = cells.flatMap((c) =>
    c.outcome._tag === "Unreached" &&
    !(seedDecides(reachable, c.fault) && whyUnreachable(reachable, c.phase, c.fault) === "")
      ? [`${c.phase} × ${c.fault}: ${whyUnreachable(reachable, c.phase, c.fault) || c.outcome.why}`]
      : [],
  );

  const broken = cells.flatMap((c) =>
    c.outcome._tag === "Reached" && c.outcome.breaches.length > 0
      ? [`${c.phase} × ${c.fault}:\n${c.outcome.breaches.join("\n")}\n${c.outcome.story}`]
      : [],
  );

  const drive = generate(samples, { drawing: "drive", seed: 1 });

  expect(drive.run.evidence.some((e) => e._tag === "Turn")).toBe(true);
  expect(cells).toHaveLength(PHASES.length * FAULTS.length);
  expect(broken).toEqual([]);
  expect(unreached).toEqual(expected);
};

const sweeps = (samples: Samples, reachable: Reach, tier: "usual" | "stress") =>
  it(
    `${samples.id}: every reachable (phase, fault) cell keeps every run rule, and the unreachable ones are named`,
    sweepChecks(samples, reachable, tier),
    LIMITS.pairSweep,
  );

/**
 * The pair sweeps of every manifest, split into `of` shards by position so each shard's file runs
 * beside the others; declares the sweeps of shard `shard` in a tier.
 */
export const sweepShard = (tier: "usual" | "stress", shard: number, of: number) => {
  for (const [n, { samples, reach }] of manifests.flatMap((m) => m.pairs).entries())
    if (n % of === shard) sweeps(samples, reach, tier);
};
