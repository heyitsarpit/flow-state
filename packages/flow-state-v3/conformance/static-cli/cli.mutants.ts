import type { Mutant } from "../dsl/oracle.ts";

const FLOW = "cli/flow.ts";

const CHECK = "cli/check.ts";

const cliMutant = (
  name: string,
  says: string,
  expects: Mutant["expects"],
  cases: ReadonlyArray<string>,
  edits: Mutant["edits"],
) => ({ name, says, expects, runtime: "prototype", cases, edits }) satisfies Mutant;

/**
 * Wrong CLIs the StaticCli cases must catch, each by a failed expectation citing the Invariant
 * it breaks.
 *
 * **Details**
 *
 * The edits apply to the round-14 CLI: its entry (`cli/flow.ts`), `check` (`cli/check.ts`) and
 * the graph it prints (`prototypes/conformance/graph.ts`).
 */
export const cliMutants: ReadonlyArray<Mutant> = [
  cliMutant(
    "cli.check-runs-callbacks",
    "check calls every closure of the Compiled it reads",
    "StaticCli I1",
    ["CLI-01"],
    [
      {
        file: CHECK,
        find: "  const c = poison(raw, count);",
        replace:
          '  const c = poison(raw, count);\n  JSON.stringify(c, (_k, v) => { if (typeof v === "function") { try { v(); } catch {} } return v; });',
      },
    ],
  ),
  cliMutant(
    "cli.text-miscounts",
    "the text form counts every finding as an error",
    "StaticCli I4",
    ["CLI-02"],
    [{ file: FLOW, find: '${n("error")} errors,', replace: "${findings.length} errors," }],
  ),
  cliMutant(
    "cli.loader-on-stdout",
    "check prints a loading line on stdout before its result",
    "StaticCli I5",
    ["CLI-03"],
    [
      {
        file: FLOW,
        find: 'if (cmd === "check") {',
        replace: 'if (cmd === "check") {\n  console.log("flow: loading fixtures");',
      },
    ],
  ),
  cliMutant(
    "cli.loader-on-stderr",
    "check writes a loading line to stderr on success",
    "StaticCli I5",
    ["CLI-03"],
    [
      {
        file: FLOW,
        find: 'if (cmd === "check") {',
        replace: 'if (cmd === "check") {\n  process.stderr.write("flow: loading fixtures\\n");',
      },
    ],
  ),
  cliMutant(
    "cli.usage-exits-1",
    "an invocation failure exits 1, as a check with errors does",
    "StaticCli I6",
    ["CLI-04"],
    [{ file: FLOW, find: "  process.exit(2);", replace: "  process.exit(1);" }],
  ),
  cliMutant(
    "cli.complete-always",
    "check says complete even when type facts were missing",
    "StaticCli I7",
    ["CLI-05"],
    [
      {
        file: FLOW,
        find: "callbacksRun, complete: incomplete.length === 0, incomplete",
        replace: "callbacksRun, complete: true, incomplete",
      },
    ],
  ),
  cliMutant(
    "cli.notsent-off",
    "check never reports NotSent unmapped",
    "StaticCli I8",
    ["CLI-06"],
    [
      {
        file: CHECK,
        find: '&& !op.outcomes.failure["NotSent"])',
        replace: "&& false)",
      },
    ],
  ),
  cliMutant(
    "cli.warnings-fail",
    "a check with any finding, a warning included, exits 1",
    "StaticCli I6",
    ["CLI-07"],
    [
      {
        file: FLOW,
        find: 'process.exit(n("error") > 0 ? 1 : 0);',
        replace: "process.exit(findings.length > 0 ? 1 : 0);",
      },
    ],
  ),
  cliMutant(
    "cli.unknown-falls-back",
    "an unknown project is resolved to the first known one",
    "StaticCli I12",
    ["CLI-08"],
    [
      {
        file: FLOW,
        find: 'TARGETS[name]?.make(api) ?? fail("UnknownSelector", name)',
        replace:
          '(TARGETS[name] ?? TARGETS["typed-pay"])?.make(api) ?? fail("UnknownSelector", name)',
      },
    ],
  ),
  cliMutant(
    "cli.late-handler-unreported",
    "check never reports a late handler with no alternative that stays put",
    "StaticCli I8",
    ["CLI-06"],
    [
      {
        file: CHECK,
        find: '            push({ severity: "error", rule: "Rule20Late",',
        replace: '            void ({ severity: "error", rule: "Rule20Late",',
      },
    ],
  ),
  cliMutant(
    "cli.graph-renames-untaken-edge",
    "flow graph names one edge no case takes by a place the Compiled does not have",
    "StaticCli I2",
    ["CLI-09"],
    [
      {
        file: "../conformance/graph.ts",
        find: "            at: a.at.path,",
        replace:
          '            at: a.at.path === "states.STUCK.on.CheckAgain[0]" ? "states.STUCK.on.Again[0]" : a.at.path,',
      },
    ],
  ),
];
