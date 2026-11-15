import { Option } from "effect";
import { type Call, type Cut, Story, type StoryRun } from "../../src/host/testing/index.ts";
import type { ActorRef } from "../../src/index.ts";

/**
 * Each ending in a run, as `operation channel reason`, in order.
 */
export const endings = (run: StoryRun) =>
  run.evidence.flatMap((e) =>
    e._tag === "Ended" ? [`${e.operation} ${e.channel} ${e.reason}`] : [],
  );

/**
 * Each accepted turn's event in a run, in order.
 */
export const turns = (run: StoryRun) =>
  run.evidence.flatMap((e) => (e._tag === "Turn" ? [e.event] : []));

/**
 * A named checkpoint; a missing one fails the test.
 */
export const at = (run: StoryRun, name: string) =>
  Option.getOrThrowWith(Option.fromUndefinedOr(run.checkpoints.get(name)), () => ({
    problem: `no checkpoint ${name}`,
  }));

/**
 * An actor's memory in a cut, none when it is not live there.
 */
export const memoryIn = (cut: Cut, ref: ActorRef) =>
  Option.map(Story.actorIn(cut, ref), (s) => s.memory);

/**
 * The calls that reached the server: landed, whether or not their answer came back.
 */
export const reached = (calls: ReadonlyArray<Call>) =>
  calls.filter((c) => c.status === "landed" || c.status === "responseDropped");

/**
 * Each call as `method status page`.
 */
export const callsOf = (calls: ReadonlyArray<Call>) =>
  calls.map((c) => `${c.method} ${c.status} ${c.page}`);

/**
 * Runs `body` while counting calls to the host's timer functions, then puts them back.
 */
export const countingHostTimers = async <A>(body: () => Promise<A>) => {
  const calls = { timeout: 0, interval: 0, immediate: 0 };

  /* oxlint-disable flow-state/no-timers -- the guard swaps the host's timers for counting wrappers that forward each call unchanged, and puts them back; it arms no timer itself */
  const host = {
    setTimeout: globalThis.setTimeout,
    setInterval: globalThis.setInterval,
    setImmediate: globalThis.setImmediate,
  };

  globalThis.setTimeout = Object.assign((...args: Parameters<typeof setTimeout>) => {
    calls.timeout += 1;

    return host.setTimeout(...args);
  }, host.setTimeout);
  globalThis.setInterval = Object.assign((...args: Parameters<typeof setInterval>) => {
    calls.interval += 1;

    return host.setInterval(...args);
  }, host.setInterval);
  globalThis.setImmediate = Object.assign((...args: Parameters<typeof setImmediate>) => {
    calls.immediate += 1;

    return host.setImmediate(...args);
  }, host.setImmediate);

  try {
    return { result: await body(), calls };
  } finally {
    Object.assign(globalThis, host);
  }
  /* oxlint-enable flow-state/no-timers */
};

/**
 * The store's keys of one kind (`actor`, `lane` or `owed`).
 */
export const keysOf = (cut: Cut, kind: string) =>
  [...cut.store.keys()].filter((k) => k.startsWith(`${kind}/`));
