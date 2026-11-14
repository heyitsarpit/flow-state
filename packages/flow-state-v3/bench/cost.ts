/// <reference types="node" />
import { Console, Effect, Option } from "effect";
import { transfers } from "../fixtures/transfers.ts";
import { CallResult, Input, step } from "../src/core/step.ts";
import type { Values } from "../src/core/compiled.ts";
import { type Command, emptyWorld, type World } from "../src/core/world.ts";

const compiled = transfers.machine.compiled;
const machines = new Map([[compiled.id, compiled]]);
const actor = { machine: compiled.id, name: "bench" };
const env = { now: 0, seed: "1".padStart(32, "0") };

type Run = { world: World; readonly store: Map<string, Values>; readonly ms: Array<number> };

// One step, timed, its writes landed in `store` and its commands returned.
const drive = (run: Run, input: Input) => {
  const at = performance.now();
  const out = step(machines, run.world, input, env);
  run.ms.push(performance.now() - at);
  run.world = out.world;

  for (const c of out.commands)
    if (c._tag === "Persist")
      for (const w of c.writes)
        Option.match(w.record, {
          onNone: () => run.store.delete(w.key),
          onSome: (record) => run.store.set(w.key, record),
        });

  return out.commands;
};

const tickets = (commands: ReadonlyArray<Command>) =>
  commands.flatMap((c) =>
    c._tag === "Persist" && c.due._tag === "Awaited" ? [c.due.ticket.id] : [],
  );

const calls = (commands: ReadonlyArray<Command>) =>
  commands.flatMap((c) => (c._tag === "Invoke" ? [c.call] : []));

const sendOnWire = (run: Run, n: number) => {
  const sent = drive(
    run,
    Input.Send({ actor, tag: "Send", payload: { transferId: `t${n}`, iban: "DE00", cents: 100 } }),
  );

  return tickets(sent).flatMap((ticket) => calls(drive(run, Input.Stored({ ticket }))));
};

// RETURN_TYPE: a Run, whose world each driven step replaces.
const fresh = (): Run => ({ world: emptyWorld(true), store: new Map(), ms: [] });

const quantile = (ms: ReadonlyArray<number>, q: number) => {
  const sorted = ms.toSorted((a, b) => a - b);

  return (sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0).toFixed(3);
};

const line = (name: string, ms: ReadonlyArray<number>) =>
  `${name}: ${ms.length} steps, median ${quantile(ms, 0.5)} ms, p99 ${quantile(ms, 0.99)} ms`;

// The turn cost with few lanes: each Send commits on a fresh key, then its acknowledgement lands.
const turnCost = () => {
  const run = fresh();
  drive(run, Input.Ensure({ actor, use: Option.some("host"), existing: false }));
  run.ms.length = 0;

  for (let n = 0; n < 200; n += 1) {
    const [call] = sendOnWire(run, n);

    if (call !== undefined)
      drive(run, Input.Settled({ call, result: CallResult.Success({ value: { id: `t${n}` } }) }));
  }

  return line("turn cost (S16, one lane at a time)", run.ms);
};

// 500 keyed lanes on the wire, then the cost of each further Send.
const manyLanes = () => {
  const run = fresh();
  drive(run, Input.Ensure({ actor, use: Option.some("host"), existing: false }));

  for (let n = 0; n < 500; n += 1) sendOnWire(run, n);
  run.ms.length = 0;

  for (let n = 500; n < 600; n += 1)
    drive(
      run,
      Input.Send({ actor, tag: "Send", payload: { transferId: `t${n}`, iban: "DE00", cents: 1 } }),
    );

  return `${line("a Send beside 500 keyed lanes on the wire (S16)", run.ms)}; ${run.world.lanes.size} lanes`;
};

// 64 Held heads saved for one identity, then a boot and an ensure that owes each its unknown
// { Restored }: today's nearest form of `ready()` with 64 owed rows (64 queued declines cannot
// wait across a disposal on today's core; T54 A-2).
const owedAtReady = () => {
  const run = fresh();
  drive(run, Input.Ensure({ actor, use: Option.some("host"), existing: false }));

  for (let n = 0; n < 64; n += 1)
    for (const call of sendOnWire(run, n))
      drive(
        run,
        Input.Settled({ call, result: CallResult.Unknown({ reason: "Lost", error: {} }) }),
      );

  const boots: Array<number> = [];
  let restored = 0;

  for (let round = 0; round < 50; round += 1) {
    const next: Run = { world: emptyWorld(true), store: new Map(run.store), ms: [] };
    const booted = step(machines, next.world, Input.Boot({ stored: new Map(run.store) }), env);
    next.world = booted.world;
    const at = performance.now();

    const ensured = step(
      machines,
      next.world,
      Input.Ensure({ actor, use: Option.some("host"), existing: true }),
      env,
    );

    boots.push(performance.now() - at);
    restored = [...booted.evidence, ...ensured.evidence].filter(
      (e) => e._tag === "Ended" && e.reason === "Restored",
    ).length;
  }

  return `${line("ensure after a boot with 64 owed unknown { Restored } (S16)", boots)}; ${restored} Restored`;
};

// oxlint-disable-next-line lint-bomb/no-effect-runner-in-domain -- the cost bench's process entry, run alone by hand (T54 X-2)
Effect.runFork(
  Effect.forEach([turnCost, manyLanes, owedAtReady], (f) => Console.log(f()), { concurrency: 1 }),
);
