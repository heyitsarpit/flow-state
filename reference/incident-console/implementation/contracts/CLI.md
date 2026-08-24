# Command-line interface contract

Status: normative target vNext contract; not shipped

The CLI is a process host over the compiled behavior, shared Story executor, bounded artifact codecs,
inspection/trace projections, and file/stream I/O. It owns grammar, gateway selection, formatting,
files, signals, and exit status. It does not own machine semantics, actors, schedulers, stores,
transition evaluation, runtime history, artifact schemas, or a competing Story/runtime model.
`PERSISTENCE_AND_ARTIFACTS.md` is the sole semantic and schema authority for the WIRE-020A/B/C artifact
boundary. `ARTIFACT_WIRE.md` is its package-private notation mirror for Story, CLI, and the share encoder;
`REV-MIG-005` is provenance only. Executable gates still prove the implementation.

## Grammar and gateway

~~~text
flow-state behavior build --output <path> [--overwrite] [--project-root <dir>] --gateway <path> [--format text|json]
flow-state behavior render <artifact|-> [--section contract|coverage] [--module <id>] [--format text|json]
flow-state behavior diff <left> <right> [--module <id>] [--format text|json]
flow-state behavior check <expected|-> [--project-root <dir>] --gateway <path> [--format text|json]

flow-state story list [--project-root <dir>] --gateway <path> [--machine <id>] [--tag <tag>] [--format text|json]
flow-state story describe <story-id> [--project-root <dir>] --gateway <path> [--format text|json]
flow-state story run <story-id> [--project-root <dir>] --gateway <path> [--trace-output <path>] [--overwrite] [--format text|json]

flow-state trace summarize <artifact|-> [--format text|json]
flow-state trace proof <artifact|-> --selector <selector> [--format text|json]
flow-state trace diff <left> <right> [--section <section>] [--format text|json]
~~~

~~~ts
const BehaviorGateway = behavior({
  app: IncidentApp,
  stories: {
    smoke: incidentAppStory,
    "machine-model": incidentMachineStory,
  },
});
~~~

`behavior check` is the only new vNext leaf. It builds the live behavior in memory and compares
its canonical artifact with the supplied expected artifact through the same diff projection as
`behavior diff`.

`--project-root` defaults to the canonicalized current working directory. `--gateway` is required for
every gateway-loading command and resolves only relative to that root; no ancestor search or implicit
gateway filename is permitted. `--format` defaults to `text`; `behavior render --section` defaults to
`contract`, and `trace diff --section` defaults to the complete ordered section set. `--overwrite` is
valid only with an output-producing `behavior build --output` or `story run --trace-output` command.
An option may occur once only; unknown options, missing option values, conflicting repeated operands,
and `--overwrite` without its output target are usage failures.

The selector grammar is exactly `issues`, `timeline`, `actor:<id>`, or `correlation:<id>`.
`actor:` and `correlation:` split at the first colon and preserve the remainder as the exact ID.
An empty ID, missing or repeated selector, unknown kind, or executable expression is a usage failure.
Selector parsing MUST NOT load a gateway or evaluate application code.

### Rule card — CLI-001, CLI-002

- Surface: Leaf grammar and selectors.
- Rule: The ten leaves above are exact. behavior.check is the only new vNext leaf and compares a
  live in-memory behavior artifact through the same projection as behavior.diff. project-root defaults
  to canonicalized cwd; gateway is required for gateway-loading commands and resolves only below that
  root; format defaults text; behavior.render section defaults contract; trace.diff section defaults
  the complete ordered section set. behavior.check and behavior.diff produce only equal or different,
  never trace-only incomplete. Each option occurs once.
- Accepts: Selector data exactly issues, timeline, actor:<id>, or correlation:<id>; actor/correlation
  split at the first colon and preserve the remainder. --overwrite only with behavior build --output
  or story run --trace-output.
- Rejects: unknown options, missing values, repeated/conflicting operands, overwrite without an output,
  empty/repeated/unknown selectors, executable selector expressions, ancestor gateway search, implicit
  gateway filenames, deleted Story/scenario surfaces, and legacy final/children behavior.
- Observable guarantee: Selector parsing loads no gateway and evaluates no application. Pure model
  traversal remains in flow-state/testing and host runners own assertions.
- Proof: Exact grammar and selector-as-data parser vectors, including rejected legacy flags.
- Trace: CLI-001, CLI-002; REV-TEST-001–010; DEL-009/DEL-010; REV-MIG-004.

### Rule card — CLI-003

- Surface: Trusted local TypeScript gateway discovery.
- Rule: project-root must be an existing directory, canonicalized, with the exact manifest at
  canonical-root/package.json. gateway must be an existing regular .ts or .mts file remaining inside
  root after symlink resolution. Loading is trusted local code; it may bundle into an OS temp directory
  but never writes project files. Gateway discovery MUST reject computed dynamic imports and non-literal
  require before evaluating any module, undeclared transitive bare imports even when an ancestor
  `node_modules` can resolve them, and Flow or Effect package-identity mismatch before accessing the
  compiled registry.
- Accepts: Relative static imports resolving through real paths inside root; bare imports declared by
  dependencies, devDependencies, peerDependencies, or optionalDependencies; the executing CLI's exact
  flow-state routes and effect package instances; a branded BehaviorGateway from behavior({ app, stories }).
- Rejects: computed dynamic imports, non-literal require, path escape, undeclared transitive bare imports,
  package-identity mismatch, structural lookalikes, empty keys, mixed apps, missing app, empty stories,
  foreign machines/Stories, and any second app identity or registry.
- Observable guarantee: Temporary files are scoped and removed after success, failure, or interruption.
  Only behavior.build, behavior.check, story.list, story.describe, and story.run load gateway code;
  artifact-only commands never execute application code. Read-only means Flow's loader/bundler writes
  only; trusted gateway code is not sandboxed.
- Proof: Root containment, manifest, import policy, package identity, brand, mixed-app, temp cleanup,
  and inert discovery tests.
- Trace: CLI-003.

Gateway discovery MUST NOT maintain a second shape validator, application compiler, or Story registry.
It consumes the branded behavior value's explicitly supplied compiled `app` and external-ID record.
Only `behavior build`, `behavior check`, and the three `story` commands load gateway source; artifact-only
commands never execute application code. The read-only promise describes Flow's loader and bundler writes,
not a security sandbox: trusted gateway code may perform any operation available to the host process.

Record keys are the external Story IDs. App Stories MUST use the supplied app's RuntimeSetup. Machine Stories
MUST target machines admitted by the supplied app and may execute through a package-private focused AppPlan
derived from that admitted machine; the gateway still exposes one supplied App identity and MUST reject any
foreign machine or Story. No focused plan creates a second public app identity.

### Rule card — CLI-004

- Surface: Discovery/execution ownership and Story/CLI parity.
- Rule: behavior.build/check and story.list/describe acquire no Implementation, Runtime, fixture,
  actor, sink, or executor. story.run uses the same package-private executor as StoryPlan.run().
  It produces the same checkpoints, run.end, failure, ordered CauseProjection, cleanup truth, and
  package-private decoded evidence model.
- Accepts: One supplied App identity; machine Stories admitted by that app, executed through a focused
  package-private AppPlan without a second public identity; app Stories use the supplied app's
  RuntimeSetup.
- Rejects: Scenario runner, public StoryPlan sink option, CLI-only decoder/result/evidence model, or
  incomplete successful Story result.
- Observable guarantee: Successful story.run has outcome completed, non-null end, failure null.
  Execution, cancellation, cleanup, or trace-write failure is CliError command story.run with partial
  Story failure primary and ordered secondary diagnostics.
- Proof: Direct-vs-CLI Story parity, inert discovery, shared decoded model, failure, and cleanup tests.
- Trace: CLI-004; `REV-MIG-005`; WIRE-020A/020B; WIRE-021/022/023.

The Story runner and CLI MUST consume the same package-private decoded evidence model for checkpoints,
end evidence, failure evidence, cleanup truth, and retained trace records. Neither surface may add a
second decoded model or expose that internal model as a public package type.

## Artifacts and publication

### Rule card — CLI-005

- Surface: Artifact input.
- Rule: Behavior/trace inputs use the one bounded WIRE-016/WIRE-020B path. Artifact-only commands do
  not load an app or run a boot decoder. - means stdin only; named operands must be existing regular
  files; FIFOs/devices are stdin-only; at most one operand may be -.
- Accepts: Stable-key UTF-8 JSON or exactly one gzip member; existing parent directories for outputs.
- Rejects: deleted Scenario/local-proof formats, competing envelopes/codecs, WIRE-020C share-only output,
  legacy final/children, concatenated gzip members, trailing bytes, unsupported compression, and all
  bound/identity/schema violations.
- Observable guarantee: Files are uncompressed canonical JSON with exactly one trailing newline;
  stdout carries only the command result.
- Proof: Bounded input, stdin, compression, schema, and artifact-only no-execution tests.
- Trace: CLI-005; WIRE-014/015/016/020B.

Behavior and trace input MUST pass through the retained bounded artifact-validation path and WIRE-016
structural limits before projection. Artifact-only commands MUST NOT load an application or run a boot-domain
decoder. The accepted artifact kinds, versions, compression representation, and exact nested schemas are
defined by WIRE-020B; this contract MUST NOT invent a competing envelope, codec, format migration, public
field, or diagnostic shape, and deleted Scenario/local-proof formats MUST NOT be accepted. The target decoded
model has no legacy `final` or `children` members. Inputs are either stable-key UTF-8 JSON or exactly one
gzip member; concatenated gzip members, trailing bytes, unsupported compression, and decompression-bound
violations are `DecompressionFailed` or the applicable bounded-input diagnostic.
WIRE-020C is deliberately export-only and MUST reject as an unknown/wrong artifact kind before any trace CLI
projection; CLI does not sanitize, summarize, diff, prove, compress, or otherwise consume share output.

### Rule card — CLI-006

- Surface: behavior build and story trace output.
- Rule: behavior build requires --output; story.run accepts a filesystem --trace-output. Existing
  destinations, including symlinks, reject without --overwrite. With overwrite, replace the symlink
  entry, never its referent. Before creating a temp file, the command drains all accepted sink records,
  canonical-encodes and bound-checks the final artifact, then publishes with sibling-temp mode 0600,
  write, flush, close, and commit.
  Without overwrite use same-directory hard-link-to-absent-destination then unlink temp; with overwrite
  use same-directory atomic rename. Never truncate in place.
- Accepts: POSIX same-filesystem link/rename semantics and already-existing parent directories.
- Rejects: destination conflict without `--overwrite`, unsupported atomic publication, and any pre-commit failure
  that changes the old destination. Failed temp removal is a named cleanup diagnostic only.
- Observable guarantee: Destination/parent preflight completes before Runtime or Fixture acquisition.
  A race at hard-link commit leaves the newly created destination untouched. A signal before commit
  preserves the old/absent destination; after commit the artifact is not rolled back. A story run
  without trace output installs no sink; a traced run installs exactly one default-capacity-256 sink.
  Requested trace output is attempted even on execution failure; execution remains primary if both fail.
  Secondary diagnostics are ordered after execution for sink-drain, artifact-encode/bound, write,
  and cleanup failures.
- Proof: Symlink, conflict/race, temp mode, flush/close/commit, interruption boundary, sink drain, and
  partial-trace tests.
- Trace: CLI-006; WIRE-018/019/020B.

## Results, streams, exit status, and signals

### Rule card — CLI-007, CLI-008

- Surface: Result model, text/JSON projection, stdout/stderr.
- Rule: Every executed leaf creates one immutable package-private flow-state/cli-result.v2 result;
  both text and JSON derive from it. The command is exactly behavior.build, behavior.render,
  behavior.diff, behavior.check, story.list, story.describe, story.run, trace.summarize, trace.proof,
  or trace.diff. Help/version are unversioned conventional text.
- Accepts: Canonical JSON or deterministic UTF-8 text where each line is path = scalar, paths use dot
  and zero-based [index] segments, strings use JSON escaping, and field/collection order follows
  WIRE-020B.
- Rejects: a public FlowCli result/diagnostic hierarchy, Scenario vocabulary, expected-state/matcher
  output, ANSI in JSON/non-TTY text, nondeterministic order, or duplicate nested schema authorities.
- Observable guarantee: Success/comparison writes exactly one newline-terminated document to stdout and
  nothing to stderr. Failure writes one document to stderr and nothing to stdout. EPIPE selects exit 2
  without recursive writes. Typed product failures and contained defects remain product evidence;
  execution/cancellation/cleanup/trace-write failures are CliError. Each stream is constructed as one
  complete buffer and attempted with one write.
- Proof: Byte-stable repeated runs, text/JSON parity, stream ownership, EPIPE, and WIRE-020B projection
  tests.
- Trace: CLI-007, CLI-008; WIRE-020B.

The private JSON result retains the exact leaf-command discriminant:

~~~ts
type CliCommand =
  | "behavior.build"
  | "behavior.render"
  | "behavior.diff"
  | "behavior.check"
  | "story.list"
  | "story.describe"
  | "story.run"
  | "trace.summarize"
  | "trace.proof"
  | "trace.diff";
~~~

The private result data remains closed by command and follows the WIRE-020B model. The CLI MUST NOT export
another public `FlowCli*` result or diagnostic hierarchy, reconstruct Scenario or matcher vocabulary, or
define a second result/data/outcome/diagnostic schema.

### Rule card — CLI-009, CLI-010

- Surface: Process exit and signals.
- Rule: One process owner maps the immutable result after the CLI Effect runtime and owned resources
  dispose. Handlers do not mutate process.exitCode or call process.exit. Exit status is:
  0 for completed non-comparison, incomplete trace summarize, or complete equal comparison;
  1 for different behavior comparisons, different trace comparisons, or incomplete trace diff;
  2 for usage, gateway, artifact, Story execution, cleanup, local-I/O, or internal failure;
  130 after first SIGINT cleanup; 143 after first SIGTERM cleanup.
- Accepts: First SIGINT/SIGTERM interrupting current work, stopping later Story commands, retaining
  failure-boundary evidence, awaiting non-abortable cleanup, atomically writing requested partial trace,
  and emitting signal-specific interruption CliError. A second signal may terminate immediately.
- Rejects: signal cleanup skipped, output publication inferred from wall-clock timing, SIGKILL/host-loss
  cleanup guarantees, first-signal rollback after commit, or cleanup changing the signal exit code.
- Observable guarantee: Cleanup/trace-write failures are ordered secondary diagnostics while signal
  exit remains 130/143. Discovery/artifact temp files are finalized before return.
- Proof: Real signal tests gate both sides of link/rename and verify cleanup, output, diagnostics, and
  exact status.
- Trace: CLI-009, CLI-010.

### Rule card — CLI-011

- Surface: Truncated trace summaries, proofs, and diffs.
- Rule: trace.summarize exposes counts/timeline as retained-window evidence and includes
  truncatedBeforeSequence. trace.proof requires complete evidence. trace.diff is equal only when both
  inputs are complete and all selected sections equal; retained facts that differ are different even
  when truncated; matching retained facts with truncation is incomplete.
- Accepts: Selectors and sections event-sequence, transitions, state-changes, issues, resource-patches,
  resource-freshness, transaction-outcomes, stream-outcomes, or timer-behavior.
- Rejects: complete proof from truncated evidence, absent actor/correlation reported as ordinary unknown
  while truncated, equal/no changes for incomplete evidence, or app/AppPlan incompatibility treated as
  ordinary difference.
- Observable guarantee: trace.summarize incomplete remains exit 0; trace.proof emits EvidenceUnavailable
  with the marker; complete-artifact absence is UnknownSelector; incompatible identity is exit-2.
- Proof: Complete/truncated/changed/unchanged section and selector tests.
- Trace: CLI-011.

## Review and package proof

### CLI-012 — Binary proof is fresh and installed

Source handler/parser/codec tests and a newly built packed binary MUST run the same success and failure
vectors. Bin tests build first and invoke the installed consumer shim from a read-only project; no checked-in
or previously generated `dist` may satisfy acceptance.

Proof MUST cover the exact grammar and rejected legacy flags, gateway containment and inertness, temporary
cleanup, undeclared imports, package identity, text/JSON parity, stdout/stderr, every exit status, stdin, all
WIRE-016 bounds, hostile identity, atomic replacement, direct/CLI Story parity, zero-history and one-sink
runs, partial traces, exact actor evidence lookup, `run.end`, module tooling ownership, compound states,
context requirements, lifecycle records, operation identities, real signals, and complete, different, and
truncated comparisons.

### CLI-P01 — Source and runtime behavior proof

Prove the closed command grammar, selector-as-data parsing, gateway containment and inertness, shared
Story/CLI decoded evidence model, text/JSON parity, stdout/stderr ownership, exit-status mapping, signal
cleanup, bounded artifact input, exact actor lookup, `run.end`, lifecycle and operation evidence, and
complete/different/incomplete trace comparisons through the production CLI owner. The proof MUST cover
rejected legacy Story/scenario flags and MUST NOT use a CLI-only artifact decoder or result hierarchy.

### CLI-P02 — Fresh packaged cutover proof

Prove a newly built and installed binary against a read-only consumer, including package identity,
declaration/export absence for deleted surfaces, source/packed parity, temporary-file cleanup, and the
current examples and root gate. A checked-in or stale `dist` artifact MUST NOT satisfy this proof. Exact
artifact envelope, version, nested field, Cause, and diagnostic choices are fixed by WIRE-020B; this proof
verifies the fresh implementation against that model.
