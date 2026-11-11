// D140: the mailbox's own contract, as a unit. Not in the suite: it never touches a runtime through the port, so it passed on the null runtime there (falsify.ts).
// An old world is a value. A rollback (a refused turn's `tx.w = kept.w`) then a push must not write into the newer world's window.
// Gated by mutate-one.ts, as every `checks/*.ts` of a round. bun round-10/checks/mailq-check.ts
import { MailQ } from "../mailq.ts";

const bad: string[] = [];
const eq = (label: string, a: unknown, b: unknown) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) bad.push(`${label}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
};
type M = { actor: string; n: number; restored?: boolean };
const ns = (q: Iterable<M>) => [...q].map((x) => x.n);
const q1 = MailQ.empty<M>().push({ actor: "a", n: 1 });
const q2 = q1.push({ actor: "a", n: 2 });
const q3 = q1.push({ actor: "a", n: 3 });
eq("the first branch", ns(q2), [1, 2]);
eq("the second branch", ns(q3), [1, 3]);
eq("taking from one leaves the other", ns(q2.takeFirst()!.rest), [2]);
eq("q3 unchanged", ns(q3), [1, 3]);
// Order: oldest first within an actor, and an actor's mail taken from wherever its run sits.
const mixed = MailQ.of<M>([
  { actor: "a", n: 1 },
  { actor: "b", n: 2 },
  { actor: "a", n: 3 },
]);
const tb = mixed.take("b")!;
eq("b's", tb.item.n, 2);
eq("the rest in order", ns(tb.rest), [1, 3]);
eq("a's oldest", mixed.take("a")!.item.n, 1);
eq("length", tb.rest.length, 2);
eq("has", [mixed.has("a"), mixed.has("c")], [true, false]);
// The restored count is what lets durable.ts skip the walk: it must be exact.
const r = MailQ.of<M>([
  { actor: "a", n: 1, restored: true },
  { actor: "a", n: 2 },
]);
eq("restored counted", r.restored, 1);
eq("restored taken", r.takeFirst()!.rest.restored, 0);
eq("restored filtered", r.filter((x) => x.n === 1).restored, 1);
console.log(bad.length ? `FAIL\n${bad.join("\n")}` : "PASS mailq");
process.exit(bad.length ? 1 : 0);
