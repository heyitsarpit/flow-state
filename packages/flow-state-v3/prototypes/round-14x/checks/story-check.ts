// Round 13: the Stories' tests (machine-design 2.10.18's `*.test.ts`), with this file's `eq` standing in for the runner's `expect` (rule 63: the checks are
// the test's, read from checkpoints after the run). Then the Story errors the design names, each made to happen. Gated by mutate-one.ts, as every
// `checks/*.ts`. bun round-13/checks/story-check.ts. Exits 1 on any failure.
import { Schema } from "effect";
import { paidFirstTime, pressedTwice, busyThenPaid, reloadMidCharge, Shop, start, pay } from "../story/pay.story.ts";
import { helpAndBack, timedOut } from "../story/threeds.story.ts";
import { archiveTwice, renameLatest, Tickets } from "../story/desk.story.ts";
import { stories } from "../story/index.ts";
import { Fake } from "../story/fake.ts";
import { Story } from "../story/story.ts";
import { payFixture } from "../../conformance/typed/pay.ts";

const fails: string[] = [];
let n = 0;
const eq = (what: string, got: unknown, want: unknown) => {
  n++;
  if (JSON.stringify(got) !== JSON.stringify(want)) fails.push(`${what}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};
const throws = (what: string, f: () => unknown, code: string) => {
  n++;
  try {
    f();
    fails.push(`${what}: did not throw ${code}`);
  } catch (e) {
    if (!String(e).includes(code)) fails.push(`${what}: threw ${String(e).slice(0, 120)}, want ${code}`);
  }
};
type Req = { readonly phase: string; readonly via: { readonly attempts: readonly string[] } };
type Charges = { readonly charges: ReadonlyArray<{ readonly key: string }>; readonly orders: readonly unknown[] };

// ── Checkout (2.10.18.2).
{
  const { paid } = paidFirstTime.run().checkpoints;
  eq("paid: state", paid.state, "PAID");
  eq("paid: the lane is gone", paid.lane("pay"), undefined);
  eq("paid: the row reads settled", paid.operations["pay"], { pending: false, uncertain: false, waiting: false, retryCount: 0, outstanding: 0 });
  eq("paid: the wire key is the Attempt's id", (paid.read(Shop) as Charges).charges.map((c) => c.key), [paid.attempt("pay")]);
  eq("paid: one order", (paid.read(Shop) as Charges).orders.length, 1);
}
{
  const { paying, paid } = pressedTwice.run().checkpoints;
  eq("pressed twice: paying", paying.state, "PAYING");
  eq("pressed twice: the lane is in flight", paying.lane("pay")?.pending, true);
  eq("pressed twice: the request waits in transit", (paying.read(Shop.confirm) as Req[]).map((r) => r.phase), ["held"]);
  eq("pressed twice: the second press declines as a double click", paying.records("ending", { op: "pay" }).map((r) => [r["channel"], r["reason"]]), [["failure", "Rejected"]]);
  eq("pressed twice: three verdicts, all allowed", paying.records("verdict").map((r) => (r["result"] as { _tag: string })._tag), ["Allowed", "Allowed", "Allowed"]);
  eq("pressed twice: paid", paid.state, "PAID");
  eq("pressed twice: one charge", (paid.read(Shop) as Charges).charges.length, 1);
}
{
  const { waiting, paid } = busyThenPaid.run().checkpoints;
  eq("busy: waiting", waiting.state, "WAITING");
  eq("busy: the answer's retry is in memory", [waiting.memory.busyTries, waiting.memory.retryInMs], [1, 2000]);
  eq("busy: paid", paid.state, "PAID");
  eq("busy: Busy, then success, each its own Attempt", paid.records("ending", { op: "pay" }).map((r) => [r["channel"], r["reason"], r["attempt"]]), [
    ["failure", "Busy", paid.attempt("pay", { n: 0 })],
    ["success", "success", paid.attempt("pay", { n: 1 })],
  ]);
  throws("busy: two Attempts and no n is ambiguous", () => paid.attempt("pay"), "AmbiguousRead");
}
{
  const { sent, reopened, settled } = reloadMidCharge.run().checkpoints;
  eq("reload: sent and in transit", (sent.read(Shop.confirm) as Req[]).map((r) => r.phase), ["held"]);
  eq("reload: restored unknown, so UNSURE", reopened.state, "UNSURE");
  eq("reload: the hold is uncertain", reopened.lane("pay")?.uncertain, true);
  eq("reload: the server charged; the answer went nowhere", [(reopened.read(Shop) as Charges).charges.length, (reopened.read(Shop.confirm) as Req[]).map((r) => r.phase)], [1, ["orphan"]]);
  eq("reload: the restored ending", reopened.records("ending", { op: "pay" }).map((r) => [r["channel"], r["reason"]]), [["unknown", "Restored"]]);
  eq("reload: the check finds the charge and places the order", settled.state, "PAID");
  eq("reload: charged once (STF12)", (settled.read(Shop) as Charges).charges.map((c) => c.key), [settled.attempt("pay")]);
}
// ── 3-D Secure alone (2.10.12).
{
  const { shown, expired, left } = timedOut.run().checkpoints;
  eq("threeds: entered at the bank page", shown.state, "BANK");
  eq("threeds: the countdown's callback moves to EXPIRED", expired.state, "EXPIRED");
  eq("threeds: its callback ran", expired.records("turn").some((r) => (r["parts"] as Array<{ at: string }>).some((p) => p.at === "states.OPEN.traits.countdown.callbacks.onExpired[0]")), true);
  throws("threeds: after the exit the subject is absent", () => left.state, "SubjectAbsent");
  eq("threeds: and `read()` says so", left.read(), undefined);
  eq("threeds: it left by TimedOut", left.records("turn").at(-1)?.["parts"] !== undefined && (left.records("turn").at(-1)!["parts"] as Array<{ at: string }>).some((p) => p.at.endsWith("exits.TimedOut[0]")), true);
}
{
  const { helping, back, passed } = helpAndBack.run().checkpoints;
  eq("help: in HELP, counted", [helping.state, helping.memory.helpOpened], ["HELP", 1]);
  eq("help: back where the shopper was, by history", back.state, "BANK");
  throws("help: passed, and gone", () => passed.memory, "SubjectAbsent");
  eq("help: by Passed", (passed.records("turn").at(-1)!["parts"] as Array<{ at: string }>).some((p) => p.at.endsWith("exits.Passed[0]")), true);
}
// ── The desk (writes only; entity Stories are the entity round's).
{
  const { renaming, renamed } = renameLatest.run().checkpoints;
  eq("rename: one lane, in flight", renaming.lane("rename", { id: "t1" })?.pending, true);
  eq("rename: the first waits in transit, the second behind it", (renaming.read(Tickets.rename) as Req[]).map((r) => r.phase), ["held"]);
  eq("rename: both reach the server, in order", (renamed.read(Tickets.rename) as Req[]).map((r) => r.phase), ["answered", "answered"]);
  eq("rename: the last title wins", (renamed.read(Tickets) as { tickets: Record<string, { title: string }> }).tickets["t1"]!.title, "Leak in 4C");
  eq("rename: settled", renamed.lane("rename", { id: "t1" }), undefined);
}
{
  const { archiving, archived } = archiveTwice.run().checkpoints;
  eq("archive: the second press declines", archiving.records("ending", { op: "archive" }).map((r) => r["reason"]), ["Rejected"]);
  eq("archive: one request", (archived.read(Tickets.archive) as Req[]).length, 1);
  eq("archive: archived at the server", (archived.read(Tickets) as { tickets: Record<string, { archived: boolean }> }).tickets["t1"]!.archived, true);
}
// ── A Story is data (rule 63): every step has its data form, and a prefix never changes (rule 66).
eq("every step is JSON", stories.every((s) => JSON.parse(JSON.stringify(s.steps)).length === s.steps.length), true);
{
  const a = Story.machine(payFixture, { id: "x/prefix", fakes: [Shop] }).send(start);
  const b = a.send(pay);
  eq("a prefix never changes", [a.steps.length, b.steps.length], [1, 2]);
}
// ── The errors, each made to happen (2.10.2, 2.10.4).
throws("a payload that does not fit its Schema", () => paidFirstTime.E["PayRequested"]!({ paymentMethodId: 5 }), "StoryInvalidEvent");
throws("`end` is reserved", () => paidFirstTime.checkpoint("end" as never), "StoryInvalidCommand");
throws("a duplicate checkpoint", () => paidFirstTime.checkpoint("paid"), "StoryInvalidCommand");
throws("a release with nothing held", () => Story.machine(payFixture, { id: "x/nothing-held", fakes: [Shop] }).world(Shop.confirm.release()).run(), "NothingHeld");
throws("a server the plan names and is not given", () => Story.machine(payFixture, { id: "x/no-fake" }).world(Shop.busy({ times: 1 })).fakes, "StoryFakeError");
const Broken = Fake.server("Broken", {
  truth: { n: Schema.Number },
  initial: { n: 0 },
  endpoints: {
    confirm: Fake.call<{ n: number }>({
      route: "pay",
      request: {},
      handle: () => {
        throw new Error("the fake's own bug");
      },
    }),
  },
});
throws("a broken fake is a broken run", () => Story.machine(payFixture, { id: "x/broken", fakes: [Broken] }).send(start, pay).run(), "StoryFakeError");
throws("a request no fake serves", () => Story.machine(payFixture, { id: "x/unserved", fakes: [] }).send(start, pay).run(), "StoryFakeError");
throws("a reserved endpoint name", () => Fake.server("Bad", { truth: {}, initial: {}, endpoints: { hold: Fake.call({ request: {}, handle: () => ({ response: { ok: 1 } }) }) } }), "StoryFakeError");
throws("an internal event is not sendable from outside", () => (paidFirstTime.E as Record<string, unknown>)["Confirmed"] === undefined && (() => { throw new Error("StoryInvalidEvent: internal"); })(), "StoryInvalidEvent");

for (const f of fails) console.log(`FAIL  ${f}`);
console.log(fails.length ? "STORY FAIL" : `STORY PASS  ${stories.length} Stories, ${n} checks`);
process.exit(fails.length ? 1 : 0);
