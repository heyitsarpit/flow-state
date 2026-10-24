/**
 * CLI cookbook. Strings document commands; importing this file executes nothing.
 * Commands and expected results are proposed examples, not captured transcripts.
 * Human output prose can evolve. These expectation objects are application documentation,
 * not a public Flow CLI result schema. Nested JSON layouts remain under Spec design.
 *
 * Consumer layout:
 * features/Tickets -> app/app.ts -> app/setup.ts -> editor.story.ts -> app/behaviour.ts
 * package.json and the gateway live under the canonical project root; artifacts/ already exists.
 * The installed CLI and app must resolve the same flow-state and Effect package instances.
 * app/behaviour.ts supplies the branded gateway and all four external Story IDs.
 * Gateway module export selection is not specified by either current or archived CLI Plans.
 * Named `gateway` is this reference's export; adapt to the actual loader convention when settled.
 *
 * All ten supported leaves are below. No install/build of the proposed package is implied.
 */
export const cliExamples = [
  {
    command: "flow-state story list --project-root . --gateway app/behaviour.ts --format text",
    expected:
      "stdout lists ticket-save, ticket-close, ticket-reminder, editor-focused; no acquisition",
    exit: 0,
  },
  {
    command: "flow-state story describe ticket-save --gateway app/behaviour.ts --format json",
    expected: "stdout: one JSON document describing ticket-save metadata/commands; no execution",
    exit: 0,
  },
  {
    command:
      "flow-state behavior build --gateway app/behaviour.ts --output artifacts/desk.behavior.json",
    expected: "atomically write behavior artifact; stdout reports completed build; no Runtime",
    exit: 0,
  },
  {
    command:
      "flow-state behavior render artifacts/desk.behavior.json --section contract --module tickets",
    expected: "stdout: tickets declarations, states/events and operation requirements",
    exit: 0,
  },
  {
    command:
      "flow-state behavior check artifacts/desk.behavior.json --gateway app/behaviour.ts --format json",
    expected: "stdout: equal when current authored behavior matches this saved baseline",
    exit: 0,
  },
  {
    // First build desk.next.behavior.json after adding a registered Story with unchanged app declarations.
    // Story metadata/coverage can differ without changing the app fingerprint.
    command:
      "flow-state behavior diff artifacts/desk.behavior.json artifacts/desk.next.behavior.json --module tickets",
    expected: "stdout: different, including changed Story metadata/coverage in the tickets module",
    exit: 1,
  },
  {
    command:
      "flow-state story run ticket-save --gateway app/behaviour.ts --trace-output artifacts/ticket-save.trace.json --format json",
    expected:
      "stdout: completed, non-null end, null failure, complete cleanup; raw trace published",
    exit: 0,
  },
  {
    command: "flow-state trace summarize artifacts/ticket-save.trace.json --format text",
    expected: "stdout: retained counts/timeline and truncatedBeforeSequence (null if complete)",
    exit: 0,
  },
  {
    command:
      "flow-state trace proof artifacts/ticket-save.trace.json --selector issues --format json",
    expected:
      "stdout: complete issue evidence, empty for this successful demo; requires complete trace",
    exit: 0,
  },
  {
    command:
      "flow-state trace diff artifacts/ticket-save.trace.json artifacts/ticket-save.trace.json --section transitions",
    expected: "stdout: equal transitions when the trace is complete",
    exit: 0,
  },
];

export const additionalExamples = [
  "flow-state story list --gateway app/behaviour.ts --machine DispatchDesk/Editor --tag smoke",
  "flow-state behavior render artifacts/desk.behavior.json --section coverage",
  "flow-state story run editor-focused --gateway app/behaviour.ts --trace-output artifacts/editor-focused.trace.json",
  "flow-state trace proof artifacts/ticket-save.trace.json --selector timeline",
  "flow-state trace summarize - --format json < artifacts/ticket-save.trace.json",
  "flow-state behavior check - --gateway app/behaviour.ts < artifacts/desk.behavior.json",
  "flow-state story run ticket-save --gateway app/behaviour.ts --trace-output artifacts/ticket-save.trace.json --overwrite",
];

/**
 * Expected app evidence from ticket-save (readSavedEvidence in features/Tickets/editor/editor.story.ts):
 * initialTitle: "Replace lobby light"
 * finalTitle: "Replace foyer light"
 * canonicalTicket.title: "Replace foyer light"
 * The old checkpoint stays unchanged. These values are expectations, not a recorded CLI JSON shape.
 *
 * Selectors: issues, timeline, actor:<id>, correlation:<id>.
 * Use exact artifact IDs, not recipe variable names. Split at first colon; preserve the remaining ID.
 * No executable expressions. Missing selector on complete evidence: InvalidArtifactOperand,
 * details.reason UnknownSelector, stderr only, exit 2.
 * Truncated proof: same code, reason EvidenceUnavailable + marker, stderr only, exit 2.
 *
 * Trace diff sections: event-sequence, transitions, state-changes, issues, resource-patches,
 * resource-freshness, transaction-outcomes, stream-outcomes, timer-behavior.
 * Default selects every section. Behavior render defaults to contract; --module names tooling ID.
 *
 * Exit 0: completed, complete equal, or incomplete retained-window summarize.
 * Exit 1: different comparison or matching-but-incomplete trace diff.
 * Exit 2: usage/gateway/artifact/Story/cleanup/I/O/EPIPE/internal failure, incompatible identities.
 * Exit 130: first SIGINT after cleanup/partial trace; exit 143: equivalent first SIGTERM.
 * Different retained facts are different even under truncation. Equality requires both complete.
 * Behavior comparison is equal/different, never trace-only incomplete. Coverage is not passing tests.
 *
 * Success/comparison: one newline-terminated document to stdout, empty stderr.
 * Failure: one document to stderr, empty stdout. --format defaults text; JSON contains no ANSI.
 * Artifact-only commands load no gateway. Discovery loads trusted local TS but acquires no services.
 * --project-root defaults canonical cwd; gateway must resolve to a regular .ts/.mts beneath it.
 * No implicit gateway discovery, ancestor search, duplicate options, or unknown flags.
 *
 * '-' is stdin, at most one operand. Inputs: strict UTF-8 JSON or one gzip member.
 * Reject shares/concatenated gzip/trailing junk/unsupported envelopes or bounds violations.
 * File output is canonical uncompressed JSON with one trailing newline.
 * Output parents exist. Existing destinations require --overwrite; symlink referents stay untouched.
 * --overwrite only applies with build --output or run --trace-output. Publication is atomic.
 * A pre-commit failure preserves the old/absent destination; committed files are not rolled back.
 *
 * No trace output => no sink; traced run => one default capacity-256 sink. Truncation remains possible.
 * First signal stops later commands, awaits finalizers, attempts requested truthful partial trace,
 * then emits interruption. Trace write/cleanup failures remain secondary; end is never fabricated.
 * A second signal may terminate immediately; SIGKILL/host loss has no cleanup guarantee.
 *
 * Authority: ../../CommandLine.plan, ../../InspectionAndArtifacts.plan, ../../../archive/CLI.plan.
 */
