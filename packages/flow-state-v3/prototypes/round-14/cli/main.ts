// Pins for `flow check` and static `flow explain`, as a process: stdout, exit code, callbacks run. bun round-9/cli/main.ts
// `flow` is a program under test: each run goes through the runner as `program`, read only by `programOutput`; a run that did not end by
// itself is unknown, and then no pin is scored.
import { stated } from "../../conformance/verdicts/state.ts";

class ProgramUnknown extends Error {}

await stated("cli", async (scope) => {
const { job } = await import("../../conformance/verdicts/runner.ts");
const { programOutput } = await import("../../conformance/verdicts/spawn.ts");
const { PROGRAM } = await import("../../conformance/limits.ts");
type Item = import("../../conformance/verdicts/verdict.ts").Item;
const runner = scope.runner({ slots: 1, mb: PROGRAM.size.peakMb, budgetS: null });
const run = async (...a: string[]) => {
  const r = await runner.program(job(`flow ${a.join(" ")}`, { gate: "flow", cmd: ["bun", `${import.meta.dir}/flow.ts`, ...a], cwd: import.meta.dir, env: {}, limits: PROGRAM.limits, contract: "program" }, PROGRAM.size));
  const p = r.kind === "ended" && !r.killed && r.signal === null ? programOutput(r) : null;
  if (p === null) throw new ProgramUnknown(`flow ${a.join(" ")} did not end by itself: ${r.kind === "ended" ? (r.decided ?? r.signal) : r.message}`);
  return { code: p.exit, out: p.stdout, err: p.stderr };
};
let bad = 0;
const items: Item[] = [];
const eq = (label: string, a: unknown, b: unknown) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (!ok) bad++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`}`);
  items.push({ kind: "pin", name: label, outcome: ok ? "pass" : "fail", why: ok ? "" : `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`.slice(0, 400) });
};
const rules = async (name: string) => {
  const r = await run("check", name, "--json");
  const d = JSON.parse(r.out);
  return { code: r.code, rules: [...new Set(d.findings.map((f: any) => `${f.severity}:${f.rule}`))].sort(), callbacks: d.callbacksRun, complete: d.complete };
};
try {
eq("broken", await rules("broken"), { code: 1, rules: ["error:Rule20Late", "error:UnresolvedHold", "warn:Rule16"], callbacks: 0, complete: false });
eq("keyless", await rules("keyless"), { code: 1, rules: ["error:KeyRequired", "warn:UnhandledSend"], callbacks: 0, complete: true });
eq("dup-session", await rules("dup-session"), { code: 0, rules: ["warn:DuplicateSession"], callbacks: 0, complete: false });
eq("no-owner", await rules("no-owner"), { code: 1, rules: ["error:UnresolvedHold"], callbacks: 0, complete: false });
eq("no-owner-unreachable", await rules("no-owner-unreachable"), { code: 0, rules: ["warn:UnresolvedHold"], callbacks: 0, complete: false });
eq("no-notsent: a persisted write must map NotSent", (await rules("no-notsent")).rules.includes("error:Rule20NotSent"), true);
eq("unencodable-no-notsent: a write whose input admits a value with no form must map NotSent (rule 20, U6)", (await rules("unencodable-no-notsent")).rules.includes("error:Rule20NotSent"), true);
eq("unknown-event: a handled event nothing declares", (await rules("unknown-event")).rules.includes("error:UnknownEvent"), true);
// Design 2.7 (F2): two write operations on one contract. Rule 37: a `.gone` on a read with no `.byKey`.
eq("shared-contract: two write ops over one contract (SharedContract, F2)", (await rules("shared-contract")).rules.includes("error:SharedContract"), true);
eq("gone-without-key: a .gone with no .byKey (GoneWithoutKey, rule 37)", (await rules("gone-without-key")).rules.includes("error:GoneWithoutKey"), true);
eq("typed-pay: no SharedContract or GoneWithoutKey", (await rules("typed-pay")).rules.some((r) => r === "error:SharedContract" || r === "error:GoneWithoutKey"), false);
eq("desk-listen: no SharedContract or GoneWithoutKey", (await rules("desk-listen")).rules.some((r) => r === "error:SharedContract" || r === "error:GoneWithoutKey"), false);
eq("p1-queue: a .gone with a .byKey ref is not GoneWithoutKey", (await rules("p1-queue")).rules.includes("error:GoneWithoutKey"), false);
const rb = await rules("read-bad");
eq("read-bad", rb.rules.includes("error:Rule20Current") && rb.rules.includes("error:Rule20Read"), true);
// Review H4: `place` kept in STUCK has no owner once PlaceUnsure is spent.
eq("typed Pay: complete, runs nothing, rule 16's warnings and place's stranded hold", await rules("typed-pay"), { code: 0, rules: ["warn:Rule16", "warn:UnresolvedHold"], callbacks: 0, complete: true });
const unknownState = await run("explain", "typed-pay", "--state", "NOPE", "--event", "Leave");
eq("unknown selector exits 2 on stderr", [unknownState.code, JSON.parse(unknownState.err).reason, unknownState.out], [2, "UnknownSelector", ""]);
const ex = JSON.parse((await run("explain", "typed-pay", "--state", "UNSURE", "--event", "IntentRead", "--json")).out);
eq("explain does not decide past an opaque guard", ex.decided, false);
eq("explain names where it stopped", ex.alternatives[0].guards[0], { kind: "opaque", path: "states.UNSURE.on.IntentRead[0].guard[0]", decided: false });
eq("explain ran nothing", ex.callbacksRun, 0);
const ex2 = JSON.parse((await run("explain", "typed-pay", "--state", "CARD", "--event", "IntentRead", "--json")).out);
eq("a table with no guard is decided", ex2.decided, true);
// D122: a loop with no way out, from tables. A queue has one.
eq("asks-forever", (await rules("asks-forever")).rules.includes("warn:AsksForever"), true);
eq("a queue with a way out says nothing", (await rules("queue")).rules.includes("warn:AsksForever"), false);
eq("typed Pay says nothing", (await rules("typed-pay")).rules.includes("warn:AsksForever"), false);
// D124, M7: from a Schema, through the real front end, to a finding. Each field the door would refuse, and none it would take.
const notes = async (name: string) => JSON.parse((await run("check", name, "--json")).out).findings.filter((f: any) => f.rule === "InputFieldForm").map((f: any) => f.message.match(/field `([^`]+)`/)[1]);
eq("bigint-key: read from tables alone", (await rules("bigint-key")).rules.includes("warn:InputFieldForm"), true);
eq("nothing ran", (await rules("bigint-key")).callbacks, 0);
eq("typed Pay has no such field", (await rules("typed-pay")).rules.includes("warn:InputFieldForm"), false);
for (const [name, paths] of [
  ["form-amount-bigint", ["amount"]],
  ["form-key-bigint", ["orderId"]],
  ["form-struct-bigint", ["line.total"]],
  ["form-array-bigint", ["totals[]"]],
  ["form-record-bigint", ["byLine[]"]],
  ["form-nullable-bigint", ["tip"]],
  ["form-set", ["tags"]],
  ["form-map", ["tags"]],
  ["form-date-key", []],
  ["form-template", []],
  ["form-unknown", []],
  ["form-plain", []],
] as const)
  eq(`${name}: ${paths.join(", ") || "nothing to say"}`, await notes(name), paths);
const txt = await run("check", "broken");
eq("text and JSON agree on the count", /3 errors, 1 warnings/.test(txt.out), true);

// ── Round 13 (mid review M3): a fragment's operations are checked against the fragment's own declarations.
eq("attach: nothing to say", (await rules("attach")).rules.filter((r) => r.startsWith("error")), []);
eq("panels: nothing to say", (await rules("panels")).rules.filter((r) => r.startsWith("error")), []);
eq("frag-typo: an undeclared fragment ending is UnknownEvent", (await rules("frag-typo")).rules.includes("error:UnknownEvent"), true);
// ── Round 13: `flow story`, `flow trace`, `flow graph`.
const j = async (...a: string[]) => {
  const r = await run(...a, "--json");
  return { code: r.code, doc: r.out ? JSON.parse(r.out) : undefined, err: r.err };
};
// Migration (the user's decision, Q1 A): `flow explain <release> --since <release>` lists what the release resets of the definition's saved state.
const reset = async (now: string, was: string) => {
  const d = (await j("explain", now, "--since", was)).doc;
  return [d.resets, d.fields, d.statesGone];
};
eq("explain --since: a field both keep under another Schema resets every record", await reset("memo-2", "memo-1"), ["always", ["title"], []]);
eq("explain --since: a state removed resets the records saved in it", await reset("memo-3", "memo-1"), ["if-saved-in-a-state-gone", [], ["SENT"]]);
eq("explain --since: a field dropped resets nothing", await reset("memo-5", "memo-1"), ["no", [], []]);
eq("explain --since: the same release resets nothing", await reset("memo-1", "memo-1"), ["no", [], []]);
eq("explain --since: an identity field added is rule 74's old-version record, not a reset (as the boot)", await reset("editor-2", "editor-1"), ["old-version-record", [], []]);
const list = await j("story", "list");
eq("story list: every Story, nothing run", [list.code, list.doc.stories.length, list.doc.callbacksRun, list.doc.stories.map((s: { kind: string }) => s.kind).filter((k: string) => k === "fragment").length], [0, 8, 0, 2]);
const desc = await j("story", "describe", "checkout/busy-then-paid");
eq("story describe: from the plan alone", [desc.code, desc.doc.callbacksRun, desc.doc.steps.length, desc.doc.checkpoints, desc.doc.fakes.map((f: { server: string; endpoints: unknown[]; controls: unknown[] }) => [f.server, f.endpoints.length, f.controls.length])], [0, 0, 6, ["waiting", "paid"], [["Shop", 5, 1]]]);
eq("story describe: a step in its data form", desc.doc.steps[0].step, { world: [{ control: { server: "Shop", name: "busy", params: { times: 1 } } }] });
const unknownStory = await run("story", "run", "nope/nope");
eq("story run: an unknown id exits 2 on stderr", [unknownStory.code, JSON.parse(unknownStory.err).reason], [2, "UnknownStory"]);
const ran = await j("story", "run", "checkout/reload-mid-charge");
eq("story run: what ran, no verdict", [ran.code, ran.doc.checkpoints.map((c: { state: string }) => c.state), ran.doc.requests["Shop.confirm"], "pass" in ran.doc], [0, ["PAYING", "UNSURE", "PAID"], { orphan: 1 }, false]);
const tr = await j("trace", "threeds/timed-out");
eq("trace: the exit is on the timeline", tr.doc.lines.some((l: string) => l.includes("exits.TimedOut[0]")), true);
eq("trace: the callback, at its instance", tr.doc.lines.some((l: string) => l.includes("[IN/countdown] on.Expired[0]")), true);
const trAt = await j("trace", "threeds/timed-out", "--at", "expired");
eq("trace --at stops at the checkpoint", [trAt.doc.lines.some((l: string) => l.includes("GiveUp")), trAt.doc.lines.at(-1)], [false, "      checkpoint expired  seq 5"]);
const trWire = await j("trace", "checkout/reload-mid-charge");
eq("trace: the wire as it stood", trWire.doc.lines.filter((l: string) => l.trim().startsWith("wire  Shop.confirm")).map((l: string) => l.trim()),["wire  Shop.confirm  held  att-1-1", "wire  Shop.confirm  held -> orphan  att-1-1"]);
const qx = await j("explain", "p1-queue");
eq("explain: a listen's `.covers` prints as its `eq` terms (Q3 A)", qx.doc.lines.filter((l: string) => l.includes(" covers ")), ["changes covers QTicket where queueId = input.queueId"]);
const g = await j("graph", "typed-pay");
eq("graph: from Compiled, nothing run", [g.code, g.doc.callbacksRun, g.doc.machine], [0, 0, "Checkout/Pay"]);
eq("graph: an edge names its alternative", g.doc.edges.find((e: { at: string }) => e.at === "states.IDLE.on.Start[0]"), { definition: "Checkout/Pay", at: "states.IDLE.on.Start[0]", kind: "on", from: "IDLE", event: "Start", target: "CARD", guarded: [], members: [], raises: [], notifies: [], status: "takeable" });
eq("graph: a guarded edge says what decides it", g.doc.edges.find((e: { at: string }) => e.at === "states.WAITING.on.RetryNow[0]").guarded, ["idle:pay(k)"]);
eq("graph: Pay's CartLoaded has no source", g.doc.edges.filter((e: { status: string }) => e.status === "unsourced").map((e: { event: string }) => e.event), ["CartLoaded"]);
const gf = await j("graph", "pay-full");
eq("graph: a fragment's table and its exits", [gf.doc.edges.some((e: { definition: string; at: string }) => e.definition === "ThreeDS" && e.at === "states.OPEN.states.EXPIRED.on.GiveUp[0]"), gf.doc.edges.filter((e: { kind: string }) => e.kind === "exit").map((e: { event: string }) => e.event).sort()], [true, ["Declined", "Passed", "TimedOut"]]);
const gp = await j("graph", "panels");
eq("graph: a resumable trait's whenAbandoned callback fires from anywhere", gp.doc.edges.filter((e: { onAbandon?: string }) => e.onAbandon !== undefined).map((e: { event: string; onAbandon: string }) => `${e.event}:${e.onAbandon}`), ["onGone:frozen"]);
} catch (e) {
  if (e instanceof ProgramUnknown) {
    console.log(`UNKNOWN  ${e.message}`);
    return [{ kind: "pin", name: "flow", outcome: "unknown", why: e.message }];
  }
  throw e;
}
// Round 14 (OD28, rule 45): an ignored unknown counts as mapped, so it never reaches UnresolvedHold; it is listed as IgnoredUnknown info.
{
  const { check } = await import("./check.ts");
  const { ignoreFixture } = await import("../../conformance/typed/ignore.ts");
  const { Effect, Schema } = await import("effect");
  const { definition, Flow, machine, transaction } = await import("../../conformance/compile/index.ts");
  const api = new Proxy({}, { get: () => () => Effect.void }) as never;
  const rulesOf = (c: Parameters<typeof check>[0]) => [...new Set(check(c).findings.map((f) => `${f.severity}:${f.rule}${f.op ? `:${f.op}` : ""}`))].sort();
  const ig = rulesOf(ignoreFixture().make(api));
  eq("check: ignore.ts's send and put, ignored unknowns, no UnresolvedHold for them", [ig.includes("info:IgnoredUnknown:send"), ig.includes("info:IgnoredUnknown:put"), ig.some((r) => r.startsWith("error:UnresolvedHold:send") || r.startsWith("error:UnresolvedHold:put") || r.startsWith("warn:UnresolvedHold:send") || r.startsWith("warn:UnresolvedHold:put"))], [true, true, false]);
  // 2.7.18's removeFile, as the design writes it.
  const remove = transaction({ id: "a/remove", input: { fileId: Schema.String }, key: ["fileId"], concurrency: "reject", commit: () => Effect.void as never as Effect.Effect<void, { readonly _tag: "RemoveRefused"; readonly uploadedBy: string }> });
  const d = definition({ id: "T/Attachments", states: ["A"], events: { Remove: { fileId: Schema.String } }, internalEvents: { FileKept: { uploadedBy: Schema.String } }, memory: {}, operations: ({ E }) => ({ removeFile: remove.outcomes({ success: Flow.ignore, failure: { RemoveRefused: E.FileKept.from((e) => ({ uploadedBy: e.uploadedBy })), NotSent: Flow.ignore }, unknown: Flow.ignore }) }) });
  const m = machine(d, ({ S, O }) => ({ default: S.A, on: { Remove: { actions: [O.removeFile.commit(({ event }) => ({ fileId: event.fileId }))] }, FileKept: {} } }));
  // Round 15b (Q4 A, rule 15): on a `serialize` op owned below the root, a late handler needs an alternative that stays put. R15Late's late Ok, No
  // and Unsure all leave; R15Stay's late Unsure stays put (it cancels the lane there), its Ok and No leave.
  const { r15LateFixture, r15StayFixture } = await import("../../conformance/typed/round15.ts");
  const leaves = (f: { make: (a: never) => unknown }) => check(f.make(api) as never).findings.filter((x) => x.rule === "Rule15LateLeaves").map((x) => `${x.severity}:${x.event}`).sort();
  eq("check: rule 15, every late alternative of R15Late leaves", leaves(r15LateFixture()), ["error:No", "error:Ok", "error:Unsure"]);
  eq("check: rule 15, R15Stay's late Unsure stays put", leaves(r15StayFixture()), ["error:No", "error:Ok"]);
  // The runner (after phase 1 H): a stay-put alternative at the owner state itself counts, since a late arrival in the re-entered owner picks it.
  const { p1OwnerStayFixture } = await import("../../conformance/typed/phase1e.ts");
  eq("check: rule 15, a stay-put Unsure at the owner state counts", leaves(p1OwnerStayFixture()), ["error:No", "error:Ok"]);
  // Q1 A, the convergence's check: `guarded` needs a per-record version and a target.
  const { p1GuardFixture } = await import("../../conformance/typed/phase1e.ts");
  const guarded = (edit: (c: any) => any) => rulesOf(edit(p1GuardFixture().make(api)) as never).filter((r) => r.includes("Guarded"));
  eq("check: guarded, with a version and targets, is clean", guarded((c) => c), []);
  eq("check: guarded on an entity with no version is an error", guarded((c) => ({ ...c, domain: { ...c.domain, version: undefined } })), ["error:GuardedWithoutVersion:close", "error:GuardedWithoutVersion:move", "error:GuardedWithoutVersion:save"]);
  eq("check: guarded with no target is an error", guarded((c) => ({ ...c, domain: { ...c.domain, writes: { ...c.domain.writes, save: { ...c.domain.writes.save, targets: undefined } } } })), ["error:GuardedWithoutTarget:save"]);
  const rf = rulesOf(m.compiled as never);
  eq("check: 2.7.18's removeFile, IgnoredUnknown info, no UnresolvedHold", [rf.includes("info:IgnoredUnknown:removeFile"), rf.some((r) => r.includes("UnresolvedHold"))], [true, false]);
}
console.log(`\nCLI pins: ${bad === 0 ? "all pass" : `${bad} failed`}`);
return items;
});
