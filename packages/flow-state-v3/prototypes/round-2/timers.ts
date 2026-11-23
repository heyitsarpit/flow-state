// Timers in the world: { dueAt, gen, cause }. The host's handle is the driver's. A firing carries its generation.
import type { Compiled, ScheduleSpec, Slot } from "../conformance/fixtures/compiled.ts";
import { nextGen, without, type Timer, type Tx } from "./world.ts";

type Spec = Timer extends infer T ? (T extends Timer ? Omit<T, "gen"> : never) : never;
export const armTimer = (tx: Tx, t: Spec): string => {
  const gen = nextGen(tx);
  tx.w = { ...tx.w, timers: { ...tx.w.timers, [t.key]: { ...t, gen } as Timer } };
  tx.commands.push({ k: "arm", timer: t.key, gen, at: t.dueAt });
  return t.key;
};
export const disarmTimer = (tx: Tx, key: string) => {
  if (!tx.w.timers[key]) return;
  tx.w = { ...tx.w, timers: without(tx.w.timers, key) };
  tx.commands.push({ k: "disarm", timer: key });
};
export const timerKeyOf = (actor: string, activation: string, id: string) =>
  `sched/${actor}/${activation}/${id}`;
export const pathOf = (m: Compiled, leaf: string): readonly string[] => {
  const out: string[] = [];
  for (let n: string | undefined = leaf; n; n = m.nodes[n]!.parent) out.push(n);
  return out;
};
export type Arming = {
  readonly spec: ScheduleSpec;
  readonly activation: string;
  readonly ms: number;
};
type Run = <A, B>(slot: Slot<(a: A) => B>, a: A) => B;

// Rule 23 and 2.5 step 6: entry schedules of what was entered, and armOn on an accepted event anywhere on the path.
// P7: these are the last closures of a turn. A throw refuses it, with nothing armed.
export const armingsFor = (
  m: Compiled,
  leaf: string,
  entered: string | undefined,
  tag: string,
  activationOf: (node: string) => string,
  after: { memory: unknown; event: unknown },
  run: Run,
) => {
  const arm: Arming[] = [];
  const disarm: Array<{ spec: ScheduleSpec; activation: string }> = [];
  for (const n of pathOf(m, leaf)) {
    for (const spec of m.nodes[n]!.schedules) {
      const onEntry = spec.armOn.length === 0 || spec.armOn.includes("entry");
      if ((n === entered && onEntry) || spec.armOn.includes(tag)) {
        const ms = "ms" in spec.schedule ? spec.schedule.ms : run(spec.schedule, after);
        arm.push({ spec, activation: activationOf(n), ms });
      }
      if (spec.disarmOn.includes(tag)) disarm.push({ spec, activation: activationOf(n) });
    }
  }
  return { arm, disarm };
};
export const commitSchedules = (
  tx: Tx,
  actor: string,
  { arm, disarm }: ReturnType<typeof armingsFor>,
) => {
  for (const d of disarm) disarmTimer(tx, timerKeyOf(actor, d.activation, d.spec.id));
  for (const x of arm)
    armTimer(tx, {
      key: timerKeyOf(actor, x.activation, x.spec.id),
      kind: "schedule",
      actor,
      activation: x.activation,
      send: x.spec.send,
      dueAt: tx.env.now + x.ms,
    });
};
