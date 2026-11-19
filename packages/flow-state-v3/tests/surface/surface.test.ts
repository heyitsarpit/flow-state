import { Effect, Option, Predicate, Schema } from "effect";
import { defineConfig } from "../../src/host/testing/index.ts";
import { definition, Flow, FlowError, runtimeSetup, transaction } from "../../src/index.ts";
import { describe, expect, it } from "vite-plus/test";
import {
  apps,
  booted,
  hostile,
  misuseOf,
  type Reached,
  rootsOf,
  sharedRoots,
  surfaceOf,
  usual,
} from "./surface.ts";
import { loose } from "../../src/test/loose.ts";

// A Runtime's own calls run last, its dispose last of all, so every other call meets a live one.
const rank = (reached: Reached) => {
  if (reached.path.endsWith(".dispose")) return 2;

  return reached.path.includes(".runtime.") || reached.path.includes(".actor.") ? 1 : 0;
};

// Every call of the hostile table on one function: each hostile value at each argument position it
// declares (and one past them), the other positions taking each usual value.
const misusesOf = (reached: Reached) =>
  Effect.gen(function* () {
    const found: Array<string> = [];
    const positions = Math.max(reached.registered.arity, 1) + 1;

    for (let at = 0; at < positions; at += 1)
      for (const [bad, make] of hostile)
        for (const [base, other] of usual) {
          const args = Array.from({ length: positions }, (_, i) => (i === at ? make() : other()));
          const misuse = yield* misuseOf(reached, args);

          if (Option.isSome(misuse))
            found.push(`${reached.path}: ${bad} at ${at}, others ${base}: ${misuse.value}`);
        }

    return found;
  });

describe("the public surface (Diagnostics R1, R3; boundaries)", () => {
  for (const app of apps)
    it(`Diagnostics R1: every function ${app.name} hands out is a registered entry or builder`, async () => {
      const live = await Effect.runPromise(booted(app));
      const surface = surfaceOf([...sharedRoots, ...rootsOf(app, live)]);

      expect(surface.stray).toEqual([]);
      expect(surface.entries.length).toBeGreaterThan(0);
      await Effect.runPromiseExit(live.runtime.dispose());
    });

  it("Diagnostics R1, R5: runtimeSetup refuses a setup its Schema refuses, naming each field", () => {
    const refusal = (config: unknown) => {
      try {
        runtimeSetup(loose(config));

        return [];
      } catch (error) {
        return error instanceof FlowError
          ? error.diagnostics.map((d) => d.path.join("."))
          : ["raw"];
      }
    };

    const [probe] = apps.slice(-1);

    expect(refusal(null)).toEqual([""]);
    expect(refusal({ app: probe?.app, scope: 7, persistence: { captureMs: Number.NaN } })).toEqual([
      "scope",
      "persistence.captureMs",
    ]);
    expect(refusal({ app: probe?.app, extra: true })).toEqual(["extra"]);
    expect(refusal({ app: { id: "x", machines: {} }, services: "none" })).toEqual(["services"]);
    expect(Predicate.isFunction(runtimeSetup(loose({ app: probe?.app })).construct)).toBe(true);
  });

  it("Diagnostics R1, R5: runtimeSetup refuses a negative captureMs, naming the field", () => {
    const [probe] = apps.slice(-1);

    const refused = () => {
      try {
        runtimeSetup(loose({ app: probe?.app, scope: "s", persistence: { captureMs: -5 } }));

        return [];
      } catch (error) {
        return error instanceof FlowError
          ? error.diagnostics.map((d) => d.path.join("."))
          : ["raw"];
      }
    };

    expect(refused()).toEqual(["persistence.captureMs"]);
  });

  it("Diagnostics R1, R3: every hostile value at every position of a shared entry gives a FlowError or a return, within a second", async () => {
    const { entries, builders } = surfaceOf(sharedRoots);

    const found = await Effect.runPromise(
      Effect.forEach([...entries, ...builders], misusesOf, { concurrency: 1 }),
    );

    expect(found.flat()).toEqual([]);
  });

  for (const app of apps)
    it(`Diagnostics R1, R3: every hostile value at every position of every entry ${app.name} hands out gives a FlowError or a return, within a second`, async () => {
      const shared = surfaceOf(sharedRoots);
      const known = new Set([...shared.entries, ...shared.builders].map((r) => r.call));
      const live = await Effect.runPromise(booted(app));
      const surface = surfaceOf(rootsOf(app, live));

      const reached = [...surface.entries, ...surface.builders]
        .filter((r) => !known.has(r.call))
        .toSorted((a, b) => rank(a) - rank(b));

      const found = await Effect.runPromise(Effect.forEach(reached, misusesOf, { concurrency: 1 }));
      await Effect.runPromiseExit(live.runtime.dispose());

      expect(found.flat()).toEqual([]);
    });
});

const keep = transaction({
  id: "Surface/keep",
  input: { id: Schema.String },
  key: ["id"],
  concurrency: "reject",
  services: [],
  commit: () => Effect.succeed({}),
});

const Keeper = definition({
  id: "Surface/Keeper",
  states: ["A"],
  events: {},
  internalEvents: { Kept: {}, Unsure: Flow.uncertain({}) },
  operations: ({ E }) => ({
    keep: keep.outcomes({ success: E.Kept, failure: {}, unknown: E.Unsure }),
  }),
});

// How a call ended: it returned, it threw a FlowError, or it threw anything else.
const endingOf = (call: () => unknown) => {
  try {
    call();

    return "returned";
  } catch (error) {
    return error instanceof FlowError ? "FlowError" : "raw";
  }
};

const hostileValue = (name: string) => hostile.find(([named]) => named === name)?.[1]();

describe("known gaps: functions handed out inside inert data and the testing route (Diagnostics R1)", () => {
  it.fails("Diagnostics R1: a bound contract's textOfKey given null refuses with a FlowError, never a raw TypeError", () => {
    expect(endingOf(() => Keeper.operations.keep.textOfKey(loose(null)))).not.toBe("raw");
  });

  it.fails("Diagnostics R1: an O.x.commit token's make given a trapped Proxy refuses with a FlowError, never what the trap threw", () => {
    const token = Keeper.O.keep.commit(() => ({ id: "x" }));

    expect(endingOf(() => token.make(loose(hostileValue("a trapped Proxy"))))).not.toBe("raw");
  });

  it.fails("Diagnostics R1: an O.x.retryable token's make, its times a throwing getter, refuses with a FlowError, never what the getter threw", () => {
    const times = Object.defineProperty({}, "times", {
      enumerable: true,
      get: () => {
        // oxlint-disable-next-line lint-bomb/no-throw-in-core -- the hostile value: reading times throws
        throw new Error("getter times");
      },
    });

    const token = Keeper.O.keep.retryable(loose(times));

    expect(endingOf(() => token.make("at"))).not.toBe("raw");
  });

  it.fails("Diagnostics R1: the testing route's defineConfig(null) refuses with a FlowError, never a raw TypeError", () => {
    expect(endingOf(() => defineConfig(loose(null)))).not.toBe("raw");
  });
});
