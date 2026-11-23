// Timers in the world: { dueAt, gen, cause }. The host's handle is the driver's. A firing carries its generation.
import type { Compiled, ScheduleSpec } from "../conformance/fixtures/compiled.ts";
import { nextGen, type Timer, type Tx } from "./world.ts";

export const armTimer = (tx: Tx, t: Omit<Timer, "gen">): string => {
  const gen = nextGen(tx);
  tx.w = { ...tx.w, timers: { ...tx.w.timers, [t.key]: { ...t, gen } } };
  tx.commands.push({ k: "arm", timer: t.key, gen, at: t.dueAt });
  return t.key;
};
export const disarmTimer = (tx: Tx, key: string) => {
  if (!tx.w.timers[key]) return;
  const { [key]: _gone, ...timers } = tx.w.timers;
  tx.w = { ...tx.w, timers };
  tx.commands.push({ k: "disarm", timer: key });
};

// P5 reads these from the after memory; a throw refuses the turn, so nothing below may run before P7 is done.
export const durationOf = (
  s: ScheduleSpec,
  after: { memory: unknown; event: unknown },
  run: <A, B>(slot: { run: (a: A) => B; at: { definition: string; path: string } }, a: A) => B,
): number => ("ms" in s.schedule ? s.schedule.ms : run(s.schedule, after));

export type Arming = {
  readonly spec: ScheduleSpec;
  readonly activation: string;
  readonly ms: number;
};

const pathOf = (m: Compiled, leaf: string): readonly string[] => {
  const out: string[] = [];
  for (let n: string | undefined = leaf; n; n = m.nodes[n]!.parent) out.push(n);
  return out;
};
export { pathOf };

// Rule 23 and 2.5 step 6: entry schedules of what was entered, and armOn on an accepted event anywhere on the path.
export const armingsFor = (
  m: Compiled,
  leaf: string,
  entered: string | undefined,
  tag: string,
  activationOf: (node: string) => string,
  after: { memory: unknown; event: unknown },
  run: <A, B>(slot: { run: (a: A) => B; at: { definition: string; path: string } }, a: A) => B,
): { arm: Arming[]; disarm: Array<{ spec: ScheduleSpec; activation: string }> } => {
  const arm: Arming[] = [];
  const disarm: Array<{ spec: ScheduleSpec; activation: string }> = [];
  for (const n of pathOf(m, leaf)) {
    for (const spec of m.nodes[n]!.schedules) {
      const onEntry = spec.armOn.length === 0 || spec.armOn.includes("entry");
      if ((n === entered && onEntry) || spec.armOn.includes(tag))
        arm.push({ spec, activation: activationOf(n), ms: durationOf(spec, after, run) });
      if (spec.disarmOn.includes(tag)) disarm.push({ spec, activation: activationOf(n) });
    }
  }
  return { arm, disarm };
};

export const timerKeyOf = (actor: string, activation: string, id: string) =>
  `sched/${actor}/${activation}/${id}`;
