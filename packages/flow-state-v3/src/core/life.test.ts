import { makeFreezer } from "./frozen.ts";
import { Option } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { admit, Life, Verdict } from "./life.ts";
import { CallResult, Input } from "./step.ts";
import { emptyWorld, Timer } from "./world.ts";
import { makeTx } from "./tx.ts";

const actor = { machine: "m", name: "a" };

// Ids as the world's mint makes them: the table reads none of them.
const tx = makeTx(new Map(), emptyWorld(false), {
  now: 0,
  seed: "0",
  admit: makeFreezer(),
  step: () => Option.none(),
});

const call = tx.mint("call");
const timer = tx.armTimer(Timer.Bound(), 0);
const ticket = tx.mint("ticket");

// One input of each kind, as the host and its timers give them.
const inputs = {
  Start: Input.Start(),
  Boot: Input.Boot({ stored: Option.some(new Map()) }),
  BootFailed: Input.BootFailed(),
  Ensure: Input.Ensure({ actor, use: Option.none(), start: "create", wiring: Option.none() }),
  Create: Input.Create({ actor, input: {} }),
  Serve: Input.Serve(),
  Send: Input.Send({ actor, tag: "E", payload: {} }),
  Forget: Input.Forget({ actor }),
  DisposeActor: Input.DisposeActor({ actor }),
  Release: Input.Release({ actor, use: "host" }),
  DisposeRuntime: Input.DisposeRuntime(),
  Settled: Input.Settled({ call, result: CallResult.Interrupted() }),
  Fired: Input.Fired({ timer }),
  Stored: Input.Stored({ ticket }),
  Refused: Input.Refused({ ticket }),
  Capture: Input.Capture({ tickets: [], again: new Map() }),
  Run: Input.Run(),
  CleanupFailed: Input.CleanupFailed(),
} as const;

const lives = {
  Inert: Life.Inert(),
  Booting: Life.Booting(),
  Open: Life.Open(),
  Failed: Life.Failed(),
  Disposing: Life.Disposing({ awaiting: Option.none() }),
  Disposed: Life.Disposed(),
  Stopped: Life.Stopped(),
} as const;

type Cell = "run" | "drop" | "not ready" | "disposed";

// Actors `algorithm`, admit, written out cell by cell: Inert, Booting, Open, Failed, Disposing,
// Disposed, Stopped. Stopped rejects the public calls RuntimeDisposed and drops every other input,
// dispose() included (it fails with the defect, R25).
const spec: Record<keyof typeof inputs, ReadonlyArray<Cell>> = {
  Start: ["run", "drop", "drop", "drop", "disposed", "disposed", "disposed"],
  Boot: ["drop", "run", "drop", "drop", "disposed", "disposed", "drop"],
  BootFailed: ["drop", "run", "drop", "drop", "drop", "drop", "drop"],
  Ensure: ["not ready", "not ready", "run", "not ready", "disposed", "disposed", "disposed"],
  Create: ["not ready", "not ready", "run", "not ready", "disposed", "disposed", "disposed"],
  Send: ["not ready", "not ready", "run", "not ready", "disposed", "disposed", "disposed"],
  Forget: ["not ready", "not ready", "run", "not ready", "disposed", "disposed", "disposed"],
  DisposeActor: ["not ready", "not ready", "run", "not ready", "drop", "drop", "disposed"],
  Release: ["drop", "drop", "run", "drop", "drop", "drop", "drop"],
  Serve: ["drop", "drop", "run", "drop", "drop", "drop", "drop"],
  DisposeRuntime: ["run", "run", "run", "run", "drop", "drop", "drop"],
  Settled: ["drop", "drop", "run", "drop", "run", "drop", "drop"],
  Fired: ["drop", "drop", "run", "drop", "run", "drop", "drop"],
  Stored: ["drop", "drop", "run", "drop", "run", "drop", "drop"],
  Refused: ["drop", "drop", "run", "drop", "run", "drop", "drop"],
  Capture: ["drop", "drop", "run", "drop", "run", "drop", "drop"],
  Run: ["not ready", "not ready", "run", "not ready", "disposed", "disposed", "disposed"],
  CleanupFailed: ["drop", "drop", "run", "drop", "run", "run", "drop"],
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
