// Timers in the world: { dueAt, gen, cause }. The host's handle is the driver's. A firing carries its generation.
import { nextGen, without, type Timer, type Tx } from "./world.ts";

type Spec = Timer extends infer T ? (T extends Timer ? Omit<T, "gen"> : never) : never;
// Round 14 (rule 73, C124): a deadline that waits for a use is this key's arming too, so arming or disarming the key removes it: only the latest waits.
const dropWaiting = (tx: Tx, key: string) => {
  if (tx.w.waiting[key]) tx.w = { ...tx.w, waiting: without(tx.w.waiting, key) };
};
export const armTimer = (tx: Tx, t: Spec): string => {
  dropWaiting(tx, t.key);
  const gen = nextGen(tx);
  tx.w = { ...tx.w, timers: { ...tx.w.timers, [t.key]: { ...t, gen } as Timer } };
  tx.commands.push({ k: "arm", timer: t.key, gen, at: t.dueAt });
  if (t.kind === "schedule") tx.armedDeadline = true;
  return t.key;
};
export const disarmTimer = (tx: Tx, key: string) => {
  dropWaiting(tx, key);
  if (!tx.w.timers[key]) return;
  tx.w = { ...tx.w, timers: without(tx.w.timers, key) };
  tx.commands.push({ k: "disarm", timer: key });
};
export const scheduleKey = (actor: string, inc: string, activation: string, id: string) =>
  `sched/${actor}/${inc}/${activation}/${id}`;
