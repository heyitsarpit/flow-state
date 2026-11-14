import { Formatter, Option } from "effect";
import { parts } from "../fixtures/index.ts";
import { captureMsOf } from "../conformance/actors/lifetime.scenarios.ts";
import { productionPort } from "../conformance/adapters/production.ts";
import { openCase } from "../conformance/dsl/case.ts";
import { rules } from "../conformance/dsl/lifecycle-rules.ts";
import { type Script, scenarioOf } from "../conformance/dsl/script.ts";
import { type Fingerprint, fingerprintOf, sameWork } from "../conformance/parts/fingerprint.ts";
import { worldSeedOf } from "../conformance/parts/play.ts";
import { partFixture } from "../conformance/parts/reference.ts";
import type { Port, Runtime } from "../conformance/port.ts";

/**
 * One bench replay: the work it did and each turn's cost in milliseconds.
 */
export type Benched = { readonly fingerprint: Fingerprint; readonly turnMs: ReadonlyArray<number> };

/**
 * How a bench boots: with the store as a real page has it, or with persistence off, the planted
 * bench the fingerprint check must refuse.
 */
export type BenchOptions = { readonly persistence: boolean };

const fixtures = parts.map(partFixture);

// RETURN_TYPE: a Port, so `boot` and its callbacks take the Port contract's parameter types.
const timed = (port: Port, persistence: boolean, turnMs: Array<number>): Port => ({
  boot: (boot) => {
    const mark = { at: performance.now() };

    const runtime = port.boot({
      ...boot,
      hosts: persistence
        ? boot.hosts
        : {
            ...boot.hosts,
            storage: {
              ...boot.hosts.storage,
              write: (_writes, _purpose, answer) => boot.hosts.page.later(() => answer(true)),
            },
          },
      observe: (observation) => {
        if (observation._tag === "Turn") turnMs.push(performance.now() - mark.at);

        mark.at = performance.now();
        boot.observe(observation);
      },
    });

    const tick = () => {
      mark.at = performance.now();
    };

    const wrapped: Runtime = {
      ...runtime,
      ensure: (actor, input, use) => {
        tick();
        runtime.ensure(actor, input, use);
      },
      ensureExisting: (actor, use) => {
        tick();
        runtime.ensureExisting(actor, use);
      },
      release: (actor, use) => {
        tick();
        runtime.release(actor, use);
      },
      send: (actor, event, payload, part) => {
        tick();
        runtime.send(actor, event, payload, part);
      },
      dispose: (actor) => {
        tick();
        runtime.dispose(actor);
      },
      forget: (actor) => {
        tick();
        runtime.forget(actor);
      },
      disposeRuntime: () => {
        tick();
        runtime.disposeRuntime();
      },
    };

    return wrapped;
  },
});

/**
 * Replays a script on production with no oracles, no Spec model and no Observation decoding
 * (Conformance R23, I67).
 *
 * **Details**
 *
 * - The world and the script's steps are the conformance run's; only the judging is off, so the
 *   work fingerprint of a bench and of the run the suite judged must be equal.
 * - A turn's cost is the time from the last call into the runtime, or its last report, to the
 *   turn's report: a measurement, never gated.
 */
export const benchReplay = (script: Script, options: BenchOptions = { persistence: true }) => {
  const turnMs: Array<number> = [];
  const scenario = scenarioOf(script, fixtures);

  const opened = openCase({
    port: timed(productionPort, options.persistence, turnMs),
    fixtures: scenario.fixtures,
    oracles: [],
    seed: worldSeedOf(script.id),
    graphs: [],
    overdue: () => false,
    crashAt: Option.none(),
    replay: Option.none(),
    captureMs: captureMsOf(scenario.id),
    rules,
    judge: false,
  });

  scenario.run(opened.driven);
  opened.end();

  return { fingerprint: fingerprintOf({ facts: opened.facts() }), turnMs } satisfies Benched;
};

/**
 * The bench gate's faults for one part: a bench whose work differs from the judged run's, or a
 * judged run that did no turn, which proves nothing (Conformance I67).
 */
export const benchFaults = (name: string, benched: Fingerprint, judged: Fingerprint) => {
  if (judged.turns === 0) return [`BAD  ${name}: the judged run did no turn`];

  return sameWork(benched, judged)
    ? []
    : [`BAD  ${name}: bench ${Formatter.format(benched)}, judged ${Formatter.format(judged)}`];
};
