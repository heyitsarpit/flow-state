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
console.log(`\nCLI pins: ${bad === 0 ? "all pass" : `${bad} failed`}`);
process.exit(bad ? 1 : 0);
