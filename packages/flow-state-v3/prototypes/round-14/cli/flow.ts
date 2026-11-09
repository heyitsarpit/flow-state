// bun round-9/cli/flow.ts check <name...> [--json]   |   explain <name> [--state S --event E] [--json]
// Machines by name, from this prototype's fixture list, since config discovery (CommandLine O6) is not built; so this file reaches fixtures directly, not a project. Exit codes: CommandLine O3. Outputs: cli-outputs.md.
import type { Api } from "../../conformance/fake-world.ts";
// Round 11: the machines from their typed definitions (D195), as the suite boots them. `pay` stays the pinned hand Pay, beside `typed-pay`.
import { cartFixture, miniCartFixture } from "../../conformance/typed/cart.ts";
import type { Compiled } from "../../conformance/fixtures/compiled.ts";
import { deskFixture, deskListenFixture } from "../../conformance/typed/desk.ts";
import { payFullFixture } from "../../conformance/typed/pay-full.ts";
import { payFixture } from "../../conformance/fixtures/pay.compiled.ts";
import { addressFixture, attachFixture, panelsFixture, ticketFixture } from "../../conformance/typed/real.ts";
import { refundsFixture } from "../../conformance/typed/stores.ts";
import type { Fixture } from "../../conformance/harness.ts";
import { loopFixture } from "../../conformance/typed/round8.ts";
import { bulkFixture } from "../../conformance/typed/round9.ts";
import { formFixtures } from "../../conformance/typed/form.ts";
import { typedPayFixture } from "../../conformance/typed/pay.ts";
import { p1QueueCoversFixture } from "../../conformance/typed/phase1e.ts";
import { check, type Finding } from "./check.ts";
import { bigintKeyFixture, brokenFixture, dupSessionFixture, keylessFixture, noNotSentFixture, noOwnerFixture, unencodableNoNotSentFixture, readBadFixture, unknownEventFixture } from "./broken.ts";
import { explain, explainText, overview, resets, resetsText } from "./explain.ts";
import { memoFixture } from "../../conformance/typed/phase1m.ts";
import { editorFixture } from "../../conformance/typed/identity.ts";
import { graphCommand, graphText } from "./graph.ts";

const api = new Proxy({}, { get: () => () => undefined }) as Api;
export const TARGETS: Readonly<Record<string, Fixture>> = {
  "typed-pay": typedPayFixture,
  pay: payFixture,
  "pay-full": payFullFixture,
  cart: cartFixture,
  "mini-cart": miniCartFixture,
  refunds: refundsFixture,
  desk: deskFixture,
  "desk-listen": deskListenFixture,
  ticket: ticketFixture,
  attach: attachFixture,
  address: addressFixture,
  panels: panelsFixture,
  broken: brokenFixture,
  keyless: keylessFixture,
  "dup-session": dupSessionFixture,
  "no-owner": noOwnerFixture(false),
  "no-owner-unreachable": noOwnerFixture(true),
  "read-bad": readBadFixture,
  "no-notsent": noNotSentFixture,
  "unencodable-no-notsent": unencodableNoNotSentFixture,
  "unknown-event": unknownEventFixture,
  "bigint-key": bigintKeyFixture,
  "asks-forever": loopFixture,
  "p1-queue": p1QueueCoversFixture(),
  queue: bulkFixture,
  ...formFixtures,
  // Migration Q1 A: Memo's releases, for `explain --since`.
  ...Object.fromEntries([1, 2, 3, 4, 5].map((v) => [`memo-${v}`, memoFixture({ v })])),
  // Audit M2's break 4: Editor's releases 1 and 2 (an identity field added), for `explain --since`.
  "editor-1": editorFixture({ v: 1 }),
  "editor-2": editorFixture({ v: 2 }),
  // Round 13 (mid review M3): Attach with its upload fragment's `Stored` taken out of the fragment's declarations, so its op maps an undeclared event.
  "frag-typo": {
    ...attachFixture,
    make: (a: Api) => {
      const c = attachFixture.make(a);
      const fragments = Object.fromEntries(Object.entries(c.fragments ?? {}).map(([k, f]) => [k, f.events ? { ...f, events: { ...f.events, internal: f.events.internal.filter((e) => e !== "Stored") } } : f]));
      return { ...c, fragments };
    },
  },
};
const fail = (reason: string, operand: string): never => {
  process.stderr.write(`${JSON.stringify({ error: "InvalidOperand", reason, operand })}\n`);
  process.exit(2);
};
const machineOf = (name: string): Compiled => TARGETS[name]?.make(api) ?? fail("UnknownSelector", name);
const arg = (k: string) => {
  const i = process.argv.indexOf(k);
  return i < 0 ? undefined : process.argv[i + 1];
};
const json = process.argv.includes("--json");
const [cmd, ...rest] = process.argv.slice(2).filter((a, i, all) => !a.startsWith("--") && !all[i - 1]?.startsWith("--state") && !all[i - 1]?.startsWith("--event") && !all[i - 1]?.startsWith("--since"));
if (cmd === "check") {
  const ms = rest.map(machineOf);
  const rs = ms.map(check);
  const findings: Finding[] = rs.flatMap((r) => r.findings);
  const n = (s: string) => findings.filter((f) => f.severity === s).length;
  const incomplete = rs.flatMap((r) => r.incomplete);
  const callbacksRun = rs.reduce((x, r) => x + r.callbacksRun, 0);
  if (json)
    console.log(JSON.stringify({ command: "check", machines: ms.map((m) => m.id), summary: { errors: n("error"), warnings: n("warn"), info: n("info") }, findings, callbacksRun, complete: incomplete.length === 0, incomplete }));
  else {
    console.log(`flow check: ${ms.length} machine${ms.length === 1 ? "" : "s"}, ${n("error")} errors, ${n("warn")} warnings, ${n("info")} info`);
    for (const f of findings) {
      console.log(`  ${f.severity.padEnd(5)}  ${f.rule}  ${f.machine}  ${f.path}`);
      console.log(`         ${f.message}`);
      console.log(`         help: ${f.help}`);
    }
    console.log(`callbacks run: ${callbacksRun}`);
    console.log(`complete: ${incomplete.length ? "no" : "yes"}`);
    for (const i of incomplete) console.log(`  ${i}`);
  }
  process.exit(n("error") > 0 ? 1 : 0);
} else if (cmd === "explain") {
  const m = machineOf(rest[0] ?? "");
  const state = arg("--state");
  const event = arg("--event");
  const since = arg("--since"); // migration Q1 A: what this release does to the saved state of `--since`'s release
  if (since) {
    const r = resets(machineOf(since), m);
    console.log(json ? JSON.stringify(r) : resetsText(r));
  } else if (state && event) {
    if (!m.nodes[state]) fail("UnknownSelector", state);
    if (!Object.values(m.nodes).some((n) => n.on[event])) fail("UnknownSelector", event);
    const r = explain(m, state, event);
    console.log(json ? JSON.stringify(r) : explainText(r));
  } else {
    const lines = overview(m);
    console.log(json ? JSON.stringify({ command: "explain", machine: m.id, lines }) : lines.join("\n"));
  }
} else if (cmd === "graph") {
  // Round 13: `flow graph`, from `Compiled` alone.
  const r = graphCommand(machineOf(rest[0] ?? ""));
  console.log(json ? JSON.stringify({ command: "graph", machine: r.graph.machine, nodes: r.graph.nodes, edges: r.graph.edges.map(({ key: _k, ...e }) => e), sources: r.graph.sources, unseen: r.graph.unseen, callbacksRun: r.callbacksRun }) : graphText(r));
} else if (cmd === "story" || cmd === "trace") {
  // Round 13: `flow story list | describe <id> | run <id>` and `flow trace <id>`, over the round's Stories (`../story/`).
  const { storyCommand } = await import("./story.ts");
  process.exit(await storyCommand(cmd, rest, json));
} else fail("UnknownCommand", cmd ?? "");
