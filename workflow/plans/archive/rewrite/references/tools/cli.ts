/**
 * CLI cookbook. Strings document commands; importing this file executes nothing.
 * Commands and expected results are proposed examples, not captured transcripts.
 * The CLI finds flow.config.ts at the project root (D37); there is no --gateway option.
 * Nothing is generated or stored unless output is redirected (D6, D38).
 */
export const cliExamples = [
  // Stories
  {
    command: "flow-state story list --tag tickets",
    expected: "ticket-save, ticket-autosave, … with no execution",
    exit: 0,
  },
  {
    command: "flow-state story describe ticket-save --format json",
    expected: "the Story's actors, steps and checkpoints; no execution",
    exit: 0,
  },
  {
    command: "flow-state story run ticket-save --trace-output artifacts/ticket-save.trace.json",
    expected: "completed, end captured, cleanup complete; raw trace published atomically",
    exit: 0,
  },

  // Structure, rendered on demand from the live app
  {
    command: "flow-state graph DispatchDesk/Editor --format mermaid",
    expected: "stateDiagram-v2 with guards' deny codes and outcome edges",
    exit: 0,
  },
  {
    command: "flow-state graph --format json",
    expected: "the internal representation of every machine, operation and read edge",
    exit: 0,
  },
  {
    command: "flow-state diff --base main",
    expected: "behaviour changes vs main: transitions, operations, outcomes, schedules",
    exit: 1,
  },
  {
    command: "flow-state check",
    expected: "errors and warnings (D42): stuck states, unhandled events, key-input gaps …",
    exit: 0,
  },

  // Why does (or doesn't) an event do something?
  {
    command: "flow-state explain DispatchDesk/Editor OPEN.EDITING SaveRequested",
    expected:
      "static: one candidate → OPEN.SAVING; may deny NoPermission | EmptyTitle | TitleTooLong",
    exit: 0,
  },
  {
    command:
      "flow-state explain --story ticket-empty-title --checkpoint declined --actor editor --event SaveRequested",
    expected: "evidence: denied EmptyTitle on the captured snapshot",
    exit: 0,
  },

  // Trace artifacts
  {
    command: "flow-state trace summarize artifacts/ticket-save.trace.json",
    expected: "retained counts and timeline",
    exit: 0,
  },
  {
    command: "flow-state trace proof artifacts/ticket-save.trace.json --selector issues",
    expected: "complete issue evidence",
    exit: 0,
  },
  {
    command:
      "flow-state trace diff artifacts/a.trace.json artifacts/b.trace.json --section transitions",
    expected: "equal when both traces are complete and match",
    exit: 0,
  },
];

/**
 * Exit 0: completed, complete equal, or an incomplete retained-window summary.
 * Exit 1: a difference (diff, trace diff), or a check with errors.
 * Exit 2: usage, config, artifact, Story, cleanup, I/O or internal failure.
 * Exit 130 / 143: first SIGINT / SIGTERM after cleanup and a truthful partial trace.
 * Success writes one document to stdout; failure writes one document to stderr.
 * --format defaults to text; JSON contains no ANSI. '-' reads one operand from stdin.
 *
 * Authority: ../../CommandLine.plan and ../../SurfaceSimplification.plan (D37–D42).
 */
