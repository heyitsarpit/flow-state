// Pins for `flow check` and static `flow explain`, as a process: stdout, exit code, callbacks run. bun round-9/cli/main.ts

const run = (...a: string[]) => {
  const p = Bun.spawnSync(["bun", `${import.meta.dir}/flow.ts`, ...a]);
  return { code: p.exitCode, out: p.stdout.toString(), err: p.stderr.toString() };
};
let bad = 0;
const eq = (label: string, a: unknown, b: unknown) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (!ok) bad++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`}`);
};
const rules = (name: string) => {
  const r = run("check", name, "--json");
  const d = JSON.parse(r.out);
  return { code: r.code, rules: [...new Set(d.findings.map((f: any) => `${f.severity}:${f.rule}`))].sort(), callbacks: d.callbacksRun, complete: d.complete };
};
eq("broken", rules("broken"), { code: 1, rules: ["error:Rule20Late", "error:UnresolvedHold", "warn:Rule16"], callbacks: 0, complete: false });
eq("keyless", rules("keyless"), { code: 1, rules: ["error:KeyRequired", "warn:UnhandledSend"], callbacks: 0, complete: true });
eq("dup-session", rules("dup-session"), { code: 0, rules: ["warn:DuplicateSession"], callbacks: 0, complete: false });
eq("no-owner", rules("no-owner"), { code: 1, rules: ["error:UnresolvedHold"], callbacks: 0, complete: false });
eq("no-owner-unreachable", rules("no-owner-unreachable"), { code: 0, rules: ["warn:UnresolvedHold"], callbacks: 0, complete: false });
eq("no-notsent: a persisted write must map NotSent", rules("no-notsent").rules.includes("error:Rule20NotSent"), true);
eq("unknown-event: a handled event nothing declares", rules("unknown-event").rules.includes("error:UnknownEvent"), true);
const rb = rules("read-bad");
eq("read-bad", rb.rules.includes("error:Rule20Current") && rb.rules.includes("error:Rule20Read"), true);
// Review H4: `place` kept in STUCK has no owner once PlaceUnsure is spent.
eq("typed Pay: complete, runs nothing, rule 16's warnings and place's stranded hold", rules("typed-pay"), { code: 0, rules: ["warn:Rule16", "warn:UnresolvedHold"], callbacks: 0, complete: true });
const unknownState = run("explain", "typed-pay", "--state", "NOPE", "--event", "Leave");
eq("unknown selector exits 2 on stderr", [unknownState.code, JSON.parse(unknownState.err).reason, unknownState.out], [2, "UnknownSelector", ""]);
const ex = JSON.parse(run("explain", "typed-pay", "--state", "UNSURE", "--event", "IntentRead", "--json").out);
eq("explain does not decide past an opaque guard", ex.decided, false);
eq("explain names where it stopped", ex.alternatives[0].guards[0], { kind: "opaque", path: "states.UNSURE.on.IntentRead[0].guard[0]", decided: false });
eq("explain ran nothing", ex.callbacksRun, 0);
const ex2 = JSON.parse(run("explain", "typed-pay", "--state", "CARD", "--event", "IntentRead", "--json").out);
eq("a table with no guard is decided", ex2.decided, true);
// D122: a loop with no way out, from tables. A queue has one.
eq("asks-forever", rules("asks-forever").rules.includes("warn:AsksForever"), true);
eq("a queue with a way out says nothing", rules("queue").rules.includes("warn:AsksForever"), false);
eq("typed Pay says nothing", rules("typed-pay").rules.includes("warn:AsksForever"), false);
// D124, M7: from a Schema, through the real front end, to a finding. Each field the door would refuse, and none it would take.
const notes = (name: string) => JSON.parse(run("check", name, "--json").out).findings.filter((f: any) => f.rule === "InputFieldForm").map((f: any) => f.message.match(/field `([^`]+)`/)[1]);
eq("bigint-key: read from tables alone", rules("bigint-key").rules.includes("warn:InputFieldForm"), true);
eq("nothing ran", rules("bigint-key").callbacks, 0);
eq("typed Pay has no such field", rules("typed-pay").rules.includes("warn:InputFieldForm"), false);
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
  eq(`${name}: ${paths.join(", ") || "nothing to say"}`, notes(name), paths);
const txt = run("check", "broken");
eq("text and JSON agree on the count", /3 errors, 1 warnings/.test(txt.out), true);

// ── Round 13 (mid review M3): a fragment's operations are checked against the fragment's own declarations.
eq("attach: nothing to say", rules("attach").rules.filter((r) => r.startsWith("error")), []);
eq("panels: nothing to say", rules("panels").rules.filter((r) => r.startsWith("error")), []);
eq("frag-typo: an undeclared fragment ending is UnknownEvent", rules("frag-typo").rules.includes("error:UnknownEvent"), true);
// ── Round 13: `flow story`, `flow trace`, `flow graph`.
const j = (...a: string[]) => {
  const r = run(...a, "--json");
  return { code: r.code, doc: r.out ? JSON.parse(r.out) : undefined, err: r.err };
};
const list = j("story", "list");
eq("story list: every Story, nothing run", [list.code, list.doc.stories.length, list.doc.callbacksRun, list.doc.stories.map((s: { kind: string }) => s.kind).filter((k: string) => k === "fragment").length], [0, 8, 0, 2]);
const desc = j("story", "describe", "checkout/busy-then-paid");
eq("story describe: from the plan alone", [desc.code, desc.doc.callbacksRun, desc.doc.steps.length, desc.doc.checkpoints, desc.doc.fakes.map((f: { server: string; endpoints: unknown[]; controls: unknown[] }) => [f.server, f.endpoints.length, f.controls.length])], [0, 0, 6, ["waiting", "paid"], [["Shop", 5, 1]]]);
eq("story describe: a step in its data form", desc.doc.steps[0].step, { world: [{ control: { server: "Shop", name: "busy", params: { times: 1 } } }] });
const unknownStory = run("story", "run", "nope/nope");
eq("story run: an unknown id exits 2 on stderr", [unknownStory.code, JSON.parse(unknownStory.err).reason], [2, "UnknownStory"]);
const ran = j("story", "run", "checkout/reload-mid-charge");
eq("story run: what ran, no verdict", [ran.code, ran.doc.checkpoints.map((c: { state: string }) => c.state), ran.doc.requests["Shop.confirm"], "pass" in ran.doc], [0, ["PAYING", "UNSURE", "PAID"], { orphan: 1 }, false]);
const tr = j("trace", "threeds/timed-out");
eq("trace: the exit is on the timeline", tr.doc.lines.some((l: string) => l.includes("exits.TimedOut[0]")), true);
eq("trace: the callback, at its instance", tr.doc.lines.some((l: string) => l.includes("[IN/countdown] on.Expired[0]")), true);
const trAt = j("trace", "threeds/timed-out", "--at", "expired");
eq("trace --at stops at the checkpoint", [trAt.doc.lines.some((l: string) => l.includes("GiveUp")), trAt.doc.lines.at(-1)], [false, "      checkpoint expired  seq 5"]);
const trWire = j("trace", "checkout/reload-mid-charge");
eq("trace: the wire as it stood", trWire.doc.lines.filter((l: string) => l.trim().startsWith("wire  Shop.confirm")).map((l: string) => l.trim()),["wire  Shop.confirm  held  att-1-1", "wire  Shop.confirm  held -> orphan  att-1-1"]);
const g = j("graph", "typed-pay");
eq("graph: from Compiled, nothing run", [g.code, g.doc.callbacksRun, g.doc.machine], [0, 0, "Checkout/Pay"]);
eq("graph: an edge names its alternative", g.doc.edges.find((e: { at: string }) => e.at === "states.IDLE.on.Start[0]"), { definition: "Checkout/Pay", at: "states.IDLE.on.Start[0]", kind: "on", from: "IDLE", event: "Start", target: "CARD", guarded: [], members: [], raises: [], notifies: [], status: "takeable" });
eq("graph: a guarded edge says what decides it", g.doc.edges.find((e: { at: string }) => e.at === "states.WAITING.on.RetryNow[0]").guarded, ["idle:pay(k)"]);
eq("graph: Pay's CartLoaded has no source", g.doc.edges.filter((e: { status: string }) => e.status === "unsourced").map((e: { event: string }) => e.event), ["CartLoaded"]);
const gf = j("graph", "pay-full");
eq("graph: a fragment's table and its exits", [gf.doc.edges.some((e: { definition: string; at: string }) => e.definition === "ThreeDS" && e.at === "states.OPEN.states.EXPIRED.on.GiveUp[0]"), gf.doc.edges.filter((e: { kind: string }) => e.kind === "exit").map((e: { event: string }) => e.event).sort()], [true, ["Declined", "Passed", "TimedOut"]]);
const gp = j("graph", "panels");
eq("graph: a resumable trait's whenAbandoned callback fires from anywhere", gp.doc.edges.filter((e: { onAbandon?: string }) => e.onAbandon !== undefined).map((e: { event: string; onAbandon: string }) => `${e.event}:${e.onAbandon}`), ["onGone:frozen"]);
console.log(`\nCLI pins: ${bad === 0 ? "all pass" : `${bad} failed`}`);
process.exit(bad ? 1 : 0);
