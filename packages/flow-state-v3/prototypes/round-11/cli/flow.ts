// bun round-9/cli/flow.ts check <name...> [--json]   |   explain <name> [--state S --event E] [--json]
// Machines by name, from this prototype's fixture list, since config discovery (CommandLine O6) is not built; so this file reaches fixtures directly, not a project. Exit codes: CommandLine O3. Outputs: cli-outputs.md.
import type { Api } from "../../conformance/fake-world.ts";
import { cartFixture, miniCartFixture } from "../../conformance/fixtures/cart.compiled.ts";
import type { Compiled } from "../../conformance/fixtures/compiled.ts";
import { deskFixture, deskListenFixture } from "../../conformance/fixtures/desk.compiled.ts";
import { payFullFixture } from "../../conformance/fixtures/pay-full.compiled.ts";
import { payFixture } from "../../conformance/fixtures/pay.compiled.ts";
import { addressFixture, attachFixture, panelsFixture, ticketFixture } from "../../conformance/fixtures/real.compiled.ts";
import { refundsFixture } from "../../conformance/fixtures/refunds.compiled.ts";
import type { Fixture } from "../../conformance/harness.ts";
import { loopFixture } from "../../conformance/fixtures/round8.compiled.ts";
import { bulkFixture } from "../../conformance/fixtures/round9.compiled.ts";
import { formFixtures } from "../../conformance/typed/form.ts";
import { typedPayFixture } from "../../conformance/typed/pay.ts";
import { check, type Finding } from "./check.ts";
import { bigintKeyFixture, brokenFixture, dupSessionFixture, keylessFixture, noNotSentFixture, noOwnerFixture, readBadFixture, unknownEventFixture } from "./broken.ts";
import { explain, explainText, overview } from "./explain.ts";

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
  "unknown-event": unknownEventFixture,
  "bigint-key": bigintKeyFixture,
  "asks-forever": loopFixture,
  queue: bulkFixture,
  ...formFixtures,
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
const [cmd, ...rest] = process.argv.slice(2).filter((a, i, all) => !a.startsWith("--") && !all[i - 1]?.startsWith("--state") && !all[i - 1]?.startsWith("--event"));
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
  if (state && event) {
    if (!m.nodes[state]) fail("UnknownSelector", state);
    if (!Object.values(m.nodes).some((n) => n.on[event])) fail("UnknownSelector", event);
    const r = explain(m, state, event);
    console.log(json ? JSON.stringify(r) : explainText(r));
  } else {
    const lines = overview(m);
    console.log(json ? JSON.stringify({ command: "explain", machine: m.id, lines }) : lines.join("\n"));
  }
} else fail("UnknownCommand", cmd ?? "");
