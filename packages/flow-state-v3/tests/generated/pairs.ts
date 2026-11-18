import { expect, it } from "vite-plus/test";
import { manifests, type Reach } from "../../fixtures/index.ts";
import { FAULTS, generate, PHASES, pairSweep, type Samples } from "../../src/host/testing/index.ts";
import { rules } from "../rules/rules.ts";

const ON_WIRE = new Set(["OnWire", "Cancelling"]);

const PERSISTED_PHASES = new Set(["Acknowledging", "Recapturing", "Withdrawing"]);

type Cell = { readonly r: Reach; readonly phase: string; readonly fault: string };

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
    ({ r, fault }) => fault === "storage refusal" && !r.persisted,
    "a local identity writes nothing (WriteAhead R15)",
  ],
];

// Why a cell cannot be reached, from the lifecycle rules, or none when it can.
const whyUnreachable = (r: Reach, phase: string, fault: string) =>
  FORBIDDEN.find(([forbids]) => forbids({ r, phase, fault }))?.[1] ?? "";

// The seeds a drive may take; in the usual tier also the cap past which a phase the fixture can
// reach and the drive has not found fails the sweep.
const DRIVE_SEEDS = Array.from({ length: 1000 }, (_, n) => n + 1);

// The phases a write of the fixture can stand in: those some fault is not forbidden in.
const reachablePhases = (reachable: Reach) =>
  PHASES.filter((phase) => FAULTS.some((fault) => whyUnreachable(reachable, phase, fault) === ""));

/**
 * The pair sweep's test for one fixture: every reached cell keeps every run rule, and the cells
 * left unreached are exactly those the lifecycle rules forbid, each named with why. The usual tier
 * drives seeds until every reachable phase is found; the stress tier drives all of them, so a
 * forbidden phase a late seed would open is probed too.
 */
const sweeps = (samples: Samples, reachable: Reach, tier: "usual" | "stress") =>
  it(`${samples.id}: every reachable (phase, fault) cell keeps every run rule, and the unreachable ones are named`, () => {
    const cells = pairSweep(samples, {
      properties: rules,
      seeds: DRIVE_SEEDS,
      stopAt: tier === "usual" ? reachablePhases(reachable) : PHASES,
    });

    const expected = PHASES.flatMap((phase) =>
      FAULTS.flatMap((fault) => {
        const why = whyUnreachable(reachable, phase, fault);

        return why === "" ? [] : [`${phase} × ${fault}: ${why}`];
      }),
    );

    const unreached = cells.flatMap((c) =>
      c.outcome._tag === "Unreached"
        ? [
            `${c.phase} × ${c.fault}: ${whyUnreachable(reachable, c.phase, c.fault) || c.outcome.why}`,
          ]
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
  }, 120_000);

/**
 * The pair sweeps of every manifest, split into `of` shards by position so each shard's file runs
 * beside the others; declares the sweeps of shard `shard` in a tier.
 */
export const sweepShard = (tier: "usual" | "stress", shard: number, of: number) => {
  for (const [n, { samples, reach }] of manifests.flatMap((m) => m.pairs).entries())
    if (n % of === shard) sweeps(samples, reach, tier);
};
