import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { Effect, Option } from "effect";
import { attachInspector } from "../../src/host/inspect.ts";
import type { RuntimeSetup } from "../../src/index.ts";
import { bench } from "../declare.ts";

const fixtures = join(import.meta.dirname, "..", "..", "fixtures");

// Evaluates a machine's module again under a fresh URL: its definition and its compile to
// `Compiled` run once more, while the modules it imports stay loaded.
const compileSubject = async (file: string, exported: string) => {
  const url = pathToFileURL(join(fixtures, file)).href;
  const fresh = { n: 0 };

  const load = async () => {
    fresh.n += 1;
    // FLOW_STATE_ALLOW_UNKNOWN: a module's namespace holds whatever the file exports.
    const module: Readonly<Record<string, unknown>> = await import(`${url}?fresh=${fresh.n}`);

    return module[exported];
  };

  return {
    op: async () => {
      const start = performance.now();
      const machine = await load();
      const ms = performance.now() - start;

      return {
        units: 1,
        counters: { compiled: machine === undefined ? 0 : 1 },
        sample: Option.some(ms),
      };
    },
    proof: async () =>
      (await load()) === undefined ? Option.some(`${file} exports no ${exported}`) : Option.none(),
    shape: { machines: 1 },
  };
};

const compiles = [
  ["session", "session/machines/session.ts", "SessionMachine"],
  ["palette", "command-palette/machines/palette.ts", "PaletteMachine"],
  ["number-input", "number-input/machines/stepper.ts", "StepperMachine"],
] as const;

// FLOW_STATE_ALLOW_UNKNOWN: a fixture setup requires whatever services its app's contracts need.
type AnySetup = RuntimeSetup<unknown>;

// A Runtime built and booted with nothing saved; its first send timed apart from the boot.
const bootSubject = async (setup: () => Promise<AnySetup>) => {
  const given = await setup();

  const boot = () => {
    const start = performance.now();
    const runtime = given.construct();
    // oxlint-disable-next-line lint-bomb/no-effect-runner-in-domain -- the bench is a host boundary: it boots a Runtime synchronously to time it
    Effect.runSync(runtime.ready());

    return { runtime, ms: performance.now() - start };
  };

  return {
    op: async () => {
      const { runtime, ms } = boot();
      // oxlint-disable-next-line lint-bomb/no-effect-runner-in-domain -- as above: the bench disposes what it booted
      Effect.runSync(runtime.dispose());

      return { units: 1, counters: { boots: 1 }, sample: Option.some(ms) };
    },
    proof: async () => {
      const { runtime } = boot();
      const seen = { disposed: 0 };
      attachInspector(runtime, (e) => {
        if (e._tag === "RuntimeDisposed") seen.disposed += 1;
      });
      // oxlint-disable-next-line lint-bomb/no-effect-runner-in-domain -- as above
      Effect.runSync(runtime.dispose());

      return seen.disposed === 1 ? Option.none() : Option.some("a booted Runtime did not dispose");
    },
    shape: { saved: 0 },
  };
};

const boots = [
  ["number-input", async () => (await import("../../fixtures/number-input/app.ts")).numberSetup],
  ["palette", async () => (await import("../../fixtures/command-palette/app.ts")).paletteSetup],
  ["session", async () => (await import("../../fixtures/session/app.ts")).workspaceSetup],
] as const;

// A fresh Runtime's first send against the same send once warm: the first turn's own cost.
const firstSendSubject = async (first: boolean) => {
  const { numberSetup, quantity } = await import("../../fixtures/number-input/app.ts");

  const send = () => {
    const runtime = numberSetup.construct();
    // oxlint-disable-next-line lint-bomb/no-effect-runner-in-domain -- the bench is a host boundary: it boots a Runtime synchronously to time its sends
    Effect.runSync(runtime.ready());
    const field = runtime.ensureActor(quantity);
    const turns = { n: 0 };
    attachInspector(runtime, (e) => {
      if (e._tag === "Turn") turns.n += 1;
    });

    if (!first) field.send({ _tag: "Set", value: 0 });
    const start = performance.now();
    field.send({ _tag: "Set", value: 1 });
    const ms = performance.now() - start;
    // oxlint-disable-next-line lint-bomb/no-effect-runner-in-domain -- as above
    Effect.runSync(runtime.dispose());

    return { ms, turns: turns.n };
  };

  return {
    op: async () => {
      const done = send();

      return { units: 1, counters: { turns: done.turns }, sample: Option.some(done.ms) };
    },
    proof: async () => {
      const done = send();
      const want = first ? 1 : 2;

      return done.turns === want
        ? Option.none()
        : Option.some(`the timed send made ${done.turns} turns, not ${want}`);
    },
    shape: { actors: 1 },
  };
};

/**
 * Every `startup` bench: a machine's definition and compile, a Runtime's boot with nothing saved,
 * and a fresh Runtime's first send beside a warm one.
 */
export const startupBenches = [
  ...compiles.map(([app, file, exported]) =>
    bench({
      id: `startup.${app}.compile-ms`,
      concern: "startup",
      tags: ["compile", app],
      size: { n: 1, unit: "machine" },
      runs: 30,
      load: () => compileSubject(file, exported),
    }),
  ),
  ...boots.map(([app, setup]) =>
    bench({
      id: `startup.${app}.boot-empty-ms`,
      concern: "startup",
      tags: ["boot", app],
      size: { n: 0, unit: "saved" },
      runs: 30,
      load: () => bootSubject(setup),
    }),
  ),
  // The same in a cold process: one sample per fresh worker, before any warm-up or proof.
  bench({
    id: "startup.session.cold-boot-ms",
    concern: "startup",
    tags: ["boot", "cold", "session"],
    size: { n: 0, unit: "saved" },
    workers: 10,
    runs: 1,
    warm: false,
    load: () =>
      bootSubject(async () => (await import("../../fixtures/session/app.ts")).workspaceSetup),
  }),
  bench({
    id: "startup.number-input.cold-first-send-ms",
    concern: "startup",
    tags: ["first-turn", "cold"],
    size: { n: 1, unit: "send" },
    workers: 10,
    runs: 1,
    warm: false,
    load: () => firstSendSubject(true),
  }),
  ...([true, false] as const).map((first) =>
    bench({
      id: `startup.number-input.${first ? "first" : "second"}-send-ms`,
      concern: "startup",
      tags: ["first-turn"],
      size: { n: 1, unit: "send" },
      runs: 30,
      load: () => firstSendSubject(first),
    }),
  ),
];
