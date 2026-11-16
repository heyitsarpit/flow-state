import { expect, it } from "vite-plus/test";
import { FAULTS, generate, PHASES, pairSweep, type Samples } from "../../src/host/testing/index.ts";
import { rules } from "../rules/rules.ts";

/**
 * What a fixture's Specs and machine let its writes reach: whether it has write operations, whether
 * its identities persist, whether a cancel can meet a head still Acknowledging, and whether an
 * unknown ending keeps a Held lane.
 */
export type Reachable = {
  readonly writes: boolean;
  readonly persisted: boolean;
  readonly cancelsAcknowledging: boolean;
  readonly retainsUnknown: boolean;
};

/**
 * What a persisted fixture reaches, short of whether a cancel meets a head still Acknowledging.
 */
export const persisted = { writes: true, persisted: true, retainsUnknown: true };

/**
 * What a local fixture reaches, short of whether an unknown ending keeps a Held lane.
 */
export const local = { writes: true, persisted: false, cancelsAcknowledging: false };

const ON_WIRE = new Set(["OnWire", "Cancelling"]);

const PERSISTED_PHASES = new Set(["Acknowledging", "Recapturing", "Withdrawing"]);

type Cell = { readonly r: Reachable; readonly phase: string; readonly fault: string };

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
const whyUnreachable = (r: Reachable, phase: string, fault: string) =>
  FORBIDDEN.find(([forbids]) => forbids({ r, phase, fault }))?.[1] ?? "";

const DRIVE_SEEDS = Array.from({ length: 1000 }, (_, n) => n + 1);

/**
 * The pair sweep's test for one fixture: every reached cell keeps every run rule, and the cells
 * left unreached are exactly those the lifecycle rules forbid, each named with why.
 */
export const sweeps = (name: string, samples: Samples, reachable: Reachable) =>
  it(`${name}: every reachable (phase, fault) cell keeps every run rule, and the unreachable ones are named`, () => {
    const cells = pairSweep(samples, { properties: rules, seeds: DRIVE_SEEDS });

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
