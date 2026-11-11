import { Option, Result, Schema } from "effect";
import { coveredBy, type Remainder } from "../coverage.ts";
import type { StaticCase } from "../dsl/static-case.ts";
import type { CliRun, Surface } from "../surface.ts";
import { graphIn } from "./graph.ts";

const TRIGGER = "trigger:";

const Severity = Schema.Literals(["error", "warn", "info"]);

const CheckJson = Schema.fromJsonString(
  Schema.Struct({
    command: Schema.Literal("check"),
    summary: Schema.Struct({ errors: Schema.Number, warnings: Schema.Number, info: Schema.Number }),
    findings: Schema.Array(
      Schema.Struct({ severity: Severity, rule: Schema.String, path: Schema.String }),
    ),
    callbacksRun: Schema.Number,
    complete: Schema.Boolean,
  }),
);

type CheckJson = typeof CheckJson.Type;

const Counted = Schema.fromJsonString(Schema.Struct({ callbacksRun: Schema.Number }));

const decoded = <A>(schema: Schema.Codec<A, string>, text: string) =>
  Result.getSuccess(Schema.decodeUnknownResult(schema)(text.trimEnd()));

const checkOf = (run: CliRun) => decoded(CheckJson, run.stdout);

const check = (surface: Surface, project: string) => {
  const run = surface.cli(["check", project, "--json"]);

  return { code: run.code, result: checkOf(run) };
};

const errorsOf = (result: Option.Option<CheckJson>) =>
  Option.map(result, (r) => r.findings.filter((f) => f.severity === "error"));

const errorRules = (result: Option.Option<CheckJson>) =>
  Option.map(errorsOf(result), (errors) => [...new Set(errors.map((f) => f.rule))]);

/**
 * Whether a stream holds exactly one newline-terminated document (StaticCli R7).
 */
const oneDocument = (text: string) =>
  text.endsWith("\n") &&
  text.slice(0, -1).split("\n").length === 1 &&
  Result.isSuccess(Schema.decodeUnknownResult(Schema.fromJsonString(Schema.Json))(text));

const counts = (r: CheckJson) => ({
  errors: r.findings.filter((f) => f.severity === "error").length,
  warnings: r.findings.filter((f) => f.severity === "warn").length,
  info: r.findings.filter((f) => f.severity === "info").length,
});

const TEXT_COUNTS = /(\d+) errors, (\d+) warnings, (\d+) info/u;

const textCounts = (stdout: string) =>
  Option.map(Option.fromNullOr(TEXT_COUNTS.exec(stdout)), (m) => ({
    errors: Number(m[1]),
    warnings: Number(m[2]),
    info: Number(m[3]),
  }));

/**
 * Reference apps (StaticCli R10's "no reference app"): fixtures with no declaration error.
 */
const REFERENCE_APPS = [
  "pay",
  "pay-full",
  "cart",
  "ticket",
  "attach",
  "panels",
  "address",
  "refunds",
];

type Finding = CheckJson["findings"][number];

/**
 * Projects that break one R10 rule each, and the error that rule gives: by its name where the
 * Spec names it, else by its path (R11), the operation's failure mapping (Compile's Slot paths).
 */
const BREAKING: ReadonlyArray<{
  project: string;
  breaks: string;
  reports: (f: Finding) => boolean;
}> = [
  { project: "keyless", breaks: "a key-less retry", reports: (f) => f.rule === "KeyRequired" },
  {
    project: "shared-contract",
    breaks: "two write operations on one contract",
    reports: (f) => f.rule === "SharedContract",
  },
  {
    project: "no-owner",
    breaks: "a hold no state owns",
    reports: (f) => f.rule === "UnresolvedHold",
  },
  {
    project: "broken",
    breaks: "a late handler with no alternative that stays put",
    reports: (f) => f.rule === "Rule20Late",
  },
  {
    project: "no-notsent",
    breaks: "NotSent unmapped where it can occur",
    reports: (f) => f.path.startsWith("operations.") && f.path.endsWith(".failure"),
  },
];

const UNKNOWN = "no-such-project";

/**
 * Static cases for the CLI's `check`, `explain` and `graph` (StaticCli): inert, one result in two
 * forms, one document per stream, exit codes by status, never complete without type facts, every
 * listed rule an error, warnings never failing, and unknown operands never resolved.
 *
 * **Details**
 *
 * Projects are named by catalog name; the round-14 CLI has no config discovery, so `--project-root`
 * and `--app` are not used (StaticCli R3, R12).
 */
export const cliCases: ReadonlyArray<StaticCase> = [
  {
    id: "CLI-01",
    cites: ["StaticCli R9", "StaticCli I1"],
    run: (surface, expect) => {
      const ran = (args: ReadonlyArray<string>) =>
        Option.map(
          decoded(Counted, surface.cli([...args, "--json"]).stdout),
          (r) => r.callbacksRun,
        );

      expect("StaticCli I1", "check runs no callback", ran(["check", "pay"]), Option.some(0));
      expect(
        "StaticCli I1",
        "check of a broken project runs none",
        ran(["check", "broken"]),
        Option.some(0),
      );
      expect("StaticCli I1", "graph runs no callback", ran(["graph", "pay"]), Option.some(0));
      expect(
        "StaticCli I1",
        "static explain runs no callback",
        ran(["explain", "pay", "--state", "UNSURE", "--event", "IntentRead"]),
        Option.some(0),
      );
    },
  },
  {
    id: "CLI-02",
    cites: ["StaticCli R7", "StaticCli I4"],
    run: (surface, expect) => {
      const json = checkOf(surface.cli(["check", "broken", "--json"]));
      const text = textCounts(surface.cli(["check", "broken"]).stdout);

      expect("StaticCli I4", "check gives a JSON result", Option.isSome(json), true);
      expect(
        "StaticCli I4",
        "the JSON summary counts its own findings",
        Option.map(json, (r) => r.summary),
        Option.map(json, counts),
      );
      expect(
        "StaticCli I4",
        "the text counts equal the JSON's",
        text,
        Option.map(json, (r) => r.summary),
      );
    },
  },
  {
    id: "CLI-03",
    cites: ["StaticCli R7", "StaticCli I5"],
    run: (surface, expect) => {
      const clean = surface.cli(["check", "pay", "--json"]);
      const findings = surface.cli(["check", "broken", "--json"]);
      const graph = surface.cli(["graph", "pay", "--json"]);
      const failed = surface.cli(["graph", UNKNOWN, "--json"]);

      expect(
        "StaticCli I5",
        "a completed check: one document on stdout",
        oneDocument(clean.stdout),
        true,
      );
      expect("StaticCli I5", "a completed check: nothing on stderr", clean.stderr, "");
      expect(
        "StaticCli I5",
        "a check with findings: one document on stdout",
        oneDocument(findings.stdout),
        true,
      );
      expect("StaticCli I5", "a check with findings: nothing on stderr", findings.stderr, "");
      expect("StaticCli I5", "graph: one document on stdout", oneDocument(graph.stdout), true);
      expect("StaticCli I5", "an invocation failure: nothing on stdout", failed.stdout, "");
      expect(
        "StaticCli I5",
        "an invocation failure: one document on stderr",
        oneDocument(failed.stderr),
        true,
      );
    },
  },
  {
    id: "CLI-04",
    cites: ["StaticCli R8", "StaticCli I6"],
    run: (surface, expect) => {
      expect("StaticCli I6", "a check with errors exits 1", check(surface, "broken").code, 1);
      expect(
        "StaticCli I6",
        "a completed graph exits 0",
        surface.cli(["graph", "pay", "--json"]).code,
        0,
      );
      expect(
        "StaticCli I6",
        "an unknown operand exits 2",
        surface.cli(["check", UNKNOWN, "--json"]).code,
        2,
      );
      expect(
        "StaticCli I6",
        "an unknown state for explain exits 2",
        surface.cli(["explain", "pay", "--state", "NOPE", "--event", "Leave"]).code,
        2,
      );
    },
  },
  {
    id: "CLI-05",
    cites: ["StaticCli R9", "StaticCli I7"],
    run: (surface, expect) => {
      expect(
        "StaticCli R9",
        "a project with every type fact is complete",
        Option.map(check(surface, "pay").result, (r) => r.complete),
        Option.some(true),
      );

      for (const project of ["broken", "dup-session"])
        expect(
          "StaticCli I7",
          `${project}, a hand project with no events table, is not complete`,
          Option.map(check(surface, project).result, (r) => r.complete),
          Option.some(false),
        );
    },
  },
  {
    id: "CLI-06",
    cites: ["StaticCli R10", "StaticCli I8"],
    run: (surface, expect) => {
      for (const { project, breaks, reports } of BREAKING) {
        const found = check(surface, project);

        expect("StaticCli I8", `${breaks} exits 1`, found.code, 1);
        expect(
          "StaticCli I8",
          `${breaks} is reported as an error`,
          Option.map(errorsOf(found.result), (errors) => errors.some(reports)),
          Option.some(true),
        );
      }

      for (const project of REFERENCE_APPS)
        expect(
          "StaticCli I8",
          `reference app ${project} has no error`,
          errorRules(check(surface, project).result),
          Option.some([]),
        );
    },
  },
  {
    id: "CLI-07",
    cites: ["StaticCli R11", "StaticCli I6"],
    run: (surface, expect) => {
      for (const project of ["pay", "dup-session"]) {
        const found = check(surface, project);

        expect(
          "StaticCli R11",
          `${project} has warnings and no error`,
          Option.map(found.result, (r) => r.summary.errors === 0 && r.summary.warnings > 0),
          Option.some(true),
        );
        expect("StaticCli I6", `${project}'s warnings leave the exit code 0`, found.code, 0);
      }
    },
  },
  {
    id: "CLI-08",
    cites: ["StaticCli R3", "StaticCli I6", "StaticCli I12"],
    run: (surface, expect) => {
      for (const command of ["check", "graph", "explain"]) {
        const run = surface.cli([command, UNKNOWN, "--json"]);

        expect(
          "StaticCli I12",
          `${command} of an unknown project inspects nothing`,
          run.stdout,
          "",
        );
        expect("StaticCli I6", `${command} of an unknown project fails`, run.code, 2);
      }

      expect(
        "StaticCli I12",
        "graph of a known project names its own machine",
        Option.map(graphIn(surface.cli(["graph", "pay", "--json"])), (g) => g.machine),
        Option.some("Checkout/Pay"),
      );
    },
  },
  {
    id: "CLI-09",
    cites: ["StaticCli R5", "StaticCli I2"],
    run: (surface, expect) => {
      const names = (edges: ReadonlyArray<{ readonly definition: string; readonly at: string }>) =>
        edges.map((e) => `${e.definition} ${e.at}`).toSorted();

      const graphed = Option.map(graphIn(surface.cli(["graph", "pay", "--json"])), (g) =>
        names(g.edges.filter((e) => !e.at.startsWith(TRIGGER))),
      );

      expect(
        "StaticCli I2",
        "graph's edges are pay's alternatives, each by its place, none missing or extra",
        graphed,
        Option.some(names(surface.places("pay"))),
      );
    },
  },
];

/**
 * The StaticCli Invariants these cases judge, each with the cases whose expectations cite it.
 *
 * **Details**
 *
 * StaticCli I2 is left out: the `graph-names` oracle checks it, and CLI-09's mutant is proved by
 * falsify as a case-expectation catch beside it.
 */
export const cliCovered = coveredBy(cliCases).filter((row) => row.invariant !== "StaticCli I2");

/**
 * The part of each checked StaticCli Invariant no case or oracle judges yet, by the Task that
 * owes it.
 */
export const cliRemainders: ReadonlyArray<Remainder> = [
  {
    invariant: "StaticCli I1",
    owner: "@task.V3.T22",
    owed: "spies on the closures (T1); the cases read the CLI's own callbacksRun count",
  },
  {
    invariant: "StaticCli I2",
    owner: "@task.V3.T22",
    owed: "schedule-trigger edges, which no Compiled place names (graph's trigger: edges are left out); only pay is graphed",
  },
  {
    invariant: "StaticCli I4",
    owner: "@task.V3.T22",
    owed: "explain and graph in both forms, and R7's envelope (version, status, data); only check's counts are compared",
  },
  {
    invariant: "StaticCli I6",
    owner: "@task.V3.T22",
    owed: "exit codes 130 and 143 (R8, T6), exit 2 for loading, artifact and I/O failures (R8), and info findings (only warnings are judged)",
  },
  {
    invariant: "StaticCli I7",
    owner: "@task.V3.T22",
    owed: "R9's failure in place of a complete claim; only complete false on two hand projects is judged",
  },
  {
    invariant: "StaticCli I8",
    owner: "@task.V3.T22",
    owed: "R10's other rules, and reference apps chosen from the Spec rather than from fixtures with no error (desk and desk-listen report UnresolvedHold); 5 of R10's 11 rules are checked",
  },
  {
    invariant: "StaticCli I12",
    owner: "@task.V3.T22",
    owed: "the --app operand (R3)",
  },
];
