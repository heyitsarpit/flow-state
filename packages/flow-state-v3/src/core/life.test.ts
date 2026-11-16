import { Option } from "effect";
import type { CallId, TicketId } from "./world.ts";
import { describe, expect, it } from "vite-plus/test";
import { admit, Life, Verdict } from "./life.ts";
import { CallResult, Input } from "./step.ts";
import { emptyWorld, Timer } from "./world.ts";
import { makeTx } from "./tx.ts";

const actor = { machine: "m", name: "a" };

// Ids as the world's mint makes them: the table reads none of them.
const tx = makeTx(new Map(), emptyWorld(false), { now: 0, seed: "0" });
const call = tx.mint<CallId>("call");
const timer = tx.armTimer(Timer.Bound(), 0);
const ticket = tx.mint<TicketId>("ticket");

// One input of each kind, as the host and its timers give them.
const inputs = {
  Start: Input.Start(),
  Boot: Input.Boot({ stored: new Map() }),
  BootFailed: Input.BootFailed(),
  Ensure: Input.Ensure({ actor, use: Option.none(), existing: false }),
  Send: Input.Send({ actor, tag: "E", payload: {} }),
  Forget: Input.Forget({ actor }),
  DisposeActor: Input.DisposeActor({ actor }),
  Release: Input.Release({ actor, use: "host" }),
  DisposeRuntime: Input.DisposeRuntime(),
  Settled: Input.Settled({ call, result: CallResult.Interrupted() }),
  Fired: Input.Fired({ timer }),
  Stored: Input.Stored({ ticket }),
  Refused: Input.Refused({ ticket }),
} as const;

const lives = {
  Inert: Life.Inert(),
  Booting: Life.Booting(),
  Open: Life.Open(),
  Failed: Life.Failed(),
  Disposing: Life.Disposing({ awaiting: Option.none() }),
  Disposed: Life.Disposed(),
} as const;

type Cell = "run" | "drop" | "not ready" | "disposed";

// Actors `algorithm`, admit, written out cell by cell: Inert, Booting, Open, Failed, Disposing,
// Disposed.
const spec: Record<keyof typeof inputs, ReadonlyArray<Cell>> = {
  Start: ["run", "drop", "drop", "drop", "disposed", "disposed"],
  Boot: ["drop", "run", "drop", "drop", "disposed", "disposed"],
  BootFailed: ["drop", "run", "drop", "drop", "drop", "drop"],
  Ensure: ["not ready", "not ready", "run", "not ready", "disposed", "disposed"],
  Send: ["not ready", "not ready", "run", "not ready", "disposed", "disposed"],
  Forget: ["not ready", "not ready", "run", "not ready", "disposed", "disposed"],
  DisposeActor: ["not ready", "not ready", "run", "not ready", "drop", "drop"],
  Release: ["drop", "drop", "run", "drop", "drop", "drop"],
  DisposeRuntime: ["run", "run", "run", "run", "drop", "drop"],
  Settled: ["drop", "drop", "run", "drop", "run", "drop"],
  Fired: ["drop", "drop", "run", "drop", "run", "drop"],
  Stored: ["drop", "drop", "run", "drop", "run", "drop"],
  Refused: ["drop", "drop", "run", "drop", "run", "drop"],
};

const RUN: Cell = "run";
const DROP: Cell = "drop";
const NOT_READY: Cell = "not ready";
const DISPOSED: Cell = "disposed";

const cellOf = (verdict: Verdict) =>
  Verdict.$match(verdict, {
    Run: () => RUN,
    Drop: () => DROP,
    Reject: ({ code }) => (code === "RuntimeNotReady" ? NOT_READY : DISPOSED),
  });

describe("admit (Actors algorithm, I42)", () => {
  it("Actors I42: every (Life, input) pair has the one verdict the Spec's table gives it", () => {
    const table = Object.fromEntries(
      Object.entries(inputs).map(([name, input]) => [
        name,
        Object.values(lives).map((life) => cellOf(admit(life, input))),
      ]),
    );

    expect(table).toEqual(spec);
  });
});
