# Command-line interface contract

Status: normative vNext contract

The installed `flow-state` binary is a host for compiled behavior discovery, registered story
execution, and bounded v2 artifacts. It consumes the same behavior registry, story executor,
TurnRecords, inspection projections, and Schema codecs as the library. It must not create another
runtime, runner, history, validator, matcher language, or artifact interpretation path.

## Command grammar

### CLI-001 — The leaf command set is exact

```text
flow-state behavior build --output <path> [--force] [--project-root <dir>] [--gateway <path>] [--format text|json]
flow-state behavior render <artifact|-> [--section contract|coverage] [--module <id>] [--format text|json]
flow-state behavior diff <left> <right> [--module <id>] [--format text|json]
flow-state behavior check <expected|-> [--project-root <dir>] [--gateway <path>] [--format text|json]

flow-state story list [--project-root <dir>] [--gateway <path>] [--machine <id>] [--tag <tag>] [--format text|json]
flow-state story describe <story-id> [--project-root <dir>] [--gateway <path>] [--format text|json]
flow-state story run <story-id> [--project-root <dir>] [--gateway <path>] [--trace-output <path>] [--force] [--format text|json]

flow-state trace summarize <artifact|-> [--format text|json]
flow-state trace proof <artifact|-> --selector <selector> [--format text|json]
flow-state trace diff <left> <right> [--section <section>] [--format text|json]
```

`behavior check` is the only new vNext leaf. It builds the live behavior in memory and compares
its canonical artifact with the supplied expected artifact through the same diff projection as
`behavior diff`.

The binary MUST NOT expose `story paths`, `--event`, story `--check`, `--pending-work`,
`trace summarize --contextualize`, live/live behavior-diff flags, `story run --all`, watch mode,
live inspection transport, cache mutation, arbitrary event sending, artifact migration, remote
gateway loading, a generic query language, or compressed-output flags. Pure model traversal stays
in `flow-state/testing`; host test runners own batch execution and assertions.

### CLI-002 — Trace selectors are data, not expressions

The selector grammar is exactly `issues`, `timeline`, `actor:<id>`, or `correlation:<id>`.
`actor:` and `correlation:` split at the first colon and preserve the remainder as the exact ID.
An empty ID, missing or repeated selector, unknown kind, or executable expression is a usage
failure. Selector parsing MUST NOT load a gateway or evaluate application code.

## Gateway loading

### CLI-003 — Gateway discovery supports trusted local TypeScript

`--project-root` defaults to the current working directory and is canonicalized before use.
`--gateway` defaults to `src/app/behavior.ts`, resolves relative to that root, and MUST remain
inside it after symlink resolution. The root MUST be an existing directory and its manifest is
exactly `<canonical-project-root>/package.json`; discovery never searches an ancestor. The gateway
MUST be an existing regular `.ts` or `.mts` file.

Loading a gateway executes trusted local application code. The loader MAY bundle project-local
TypeScript into an OS temporary directory, but it MUST:

- leave the project root read-only and write no cache or generated file there;
- resolve every relative static import through real paths inside the project root, and reject
  computed dynamic imports or non-literal `require` before evaluating any module;
- resolve bare imports only from the selected project's `dependencies`, `devDependencies`,
  `peerDependencies`, and `optionalDependencies`; reject undeclared transitive bare imports even
  when an ancestor `node_modules` can resolve them;
- resolve `flow-state`, its routes, and `effect` to the same real package instances used by the
  executing CLI;
- remove every temporary file through scoped cleanup after success, failure, or interruption;
- require the named `BehaviorGateway` export to carry the package-private brand produced by
  `behavior({ stories })`;
- reject structural lookalikes, mixed-app registrations, empty registered keys, path escape, and
  Flow or Effect package-identity mismatch before accessing the compiled registry.

Gateway discovery MUST NOT maintain a second shape validator, application compiler, or story
registry. It consumes the branded behavior value's already compiled app and external-ID record.
Only `behavior build`, `behavior check`, and the three `story` commands load gateway source.
Artifact-only commands never execute application code.
The read-only promise describes Flow's loader and bundler writes, not a security sandbox: trusted
gateway code may perform any operation available to the host process.

### CLI-004 — Discovery is inert; execution is shared

`behavior build`, `behavior check`, `story list`, and `story describe` MUST acquire no Layer,
runtime, fixture, actor, inspection sink, or story executor. Registration and discovery remain
pure.

`story run` MUST use the package-private executor that also implements the registered plan's
public `.run()`. It MUST produce the same checkpoints, final observation, execution error, primary
Cause projection, and cleanup truth. The CLI MUST NOT call the deleted Scenario runner or add a
public sink option to `StoryPlan.run()`.

## Artifacts and files

### CLI-005 — One bounded v2 codec path owns input

Behavior artifacts use `kind: "behavior-contract"` and version
`"flow-state/behavior-contract.v2"`. Trace artifacts use `kind: "trace-artifact"` and version
`"flow-state/trace-artifact.v2"`. All command input MUST pass through the shared bounded Schema
codecs and WIRE-016 structural limits before projection.

Input may be canonical UTF-8 JSON or gzip-compressed JSON, detected by content rather than file
extension. Malformed UTF-8 and duplicate JSON object keys are rejected before Schema decoding;
negative zero is rejected by WIRE-001. Compressed input has an independent 2,097,152-byte input
limit in addition to the decompressed and canonical bounds. V1, wrong-kind, malformed JSON,
decompression, bound, and identity failures remain distinct. Artifact-only commands do not load an
application or run a boot-domain decoder. Scenario envelopes and local-proof bundles are not accepted
artifact formats.

`-` means stdin only for an artifact input. Every named artifact operand MUST be an existing
regular file; FIFOs and devices are accepted only through stdin. A command with two artifact
operands may use `-` at most once. Parent directories for output MUST already exist. The CLI never writes an artifact to
stdout; stdout is reserved for the one command result.

### CLI-006 — Artifact output is explicit and atomic

`behavior build --output` is required. `story run --trace-output` accepts a filesystem path only.
An existing destination, including a symlink, is rejected unless `--force` is present. Under
`--force`, a symlink entry itself is replaced; its referent is never opened or overwritten.

Before changing a destination, the CLI MUST drain every accepted sink record, encode and
bound-check stable-key UTF-8 JSON with exactly one trailing newline, create a sibling temporary at
mode `0600`, write it, flush and close it, then commit it. Without `--force`, commit uses an atomic
same-directory hard link from the temporary to the absent destination and then unlinks the
temporary; a destination created after preflight makes the link fail without clobbering it. With
`--force`, commit uses atomic same-directory rename and may replace the destination entry. Failure
or interruption before the link/rename commit point leaves the prior destination unchanged and
removes the temporary file; after commit, cleanup may only remove the sibling temporary. VNext's
guarantee is POSIX same-filesystem link/rename semantics, never truncate-in-place writing;
unsupported filesystems fail with a named local-I/O diagnostic rather than weakening the
guarantee.

A story run without `--trace-output` installs no inspection sink and retains no history. A traced
run installs exactly one `createInspectionBufferSink()` at its default capacity of 256. The
artifact preserves retained TurnRecords, `truncatedBeforeSequence`, completed checkpoints,
partial failure evidence, primary Cause, and cleanup truth. Execution failure MUST NOT suppress
requested trace output. If execution and artifact writing both fail, the diagnostic retains both
failures without replacing the execution Cause.
Execution remains the primary Cause when execution, sink drain, artifact write, and cleanup fail
together; every secondary Cause is retained in deterministic operation order.
Destination and parent-directory preflight MUST finish before story runtime or fixture acquisition,
so a known no-force conflict has no application side effect. A race discovered at hard-link commit
is a later local-I/O failure and leaves the newly created destination untouched.

## Results and diagnostics

### CLI-007 — One immutable result owns text and JSON

Help and version output are conventional unversioned text. Every executed leaf command otherwise
creates one immutable package-private result and derives both formats from it. The CLI MUST NOT
export another public `FlowCli*` result or diagnostic hierarchy.

JSON success has this private structural shape:

```ts
type CliResultEnvelope = Readonly<{
  version: "flow-state/cli-result.v1";
  kind: "flow-state-cli-result";
  command:
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
  outcome: "completed" | "different" | "incomplete";
  data: unknown;
}>;
```

`data` is not an open extension point. Its exact member follows `command`: build returns
`{ output, appId, fingerprint }`; render returns `{ section, lines }`; diff/check returns
`{ equal, sections }`; list returns `{ stories }`; describe returns `{ story }`; run returns
`{ storyId, checkpoints, final, traceOutput }`; summarize returns
`{ complete, truncatedBeforeSequence, counts, timeline }`; proof returns
`{ selector, complete, evidence }`; and trace diff returns `{ equal, complete, sections }`.
Every collection uses the ordering of its artifact projection, optional file outputs use `null`,
and reviewed Phase 0 private Schemas fix every nested field before handler implementation.

JSON failure has this private structural shape:

```ts
type CliErrorEnvelope = Readonly<{
  version: "flow-state/cli-result.v1";
  kind: "flow-state-cli-error";
  command: string;
  diagnostic: Readonly<{
    category:
      | "usage"
      | "gateway"
      | "artifact"
      | "story-execution"
      | "cleanup"
      | "io"
      | "interruption"
      | "internal";
    code: string;
    message: string;
    cause?: unknown;
    details?: unknown;
  }>;
}>;
```

`cause` and `details` reuse Cause-bearing inspection and `FlowStoryExecutionError` projections.
A story diagnostic retains its phase, command index, completed checkpoints, mutually exclusive
`atFailure` or `final`, primary Cause, and cleanup status. The CLI MUST NOT reconstruct Scenario,
expected-state, matcher, pending-work-wrapper, or PASS/FAIL vocabulary.

Diagnostic `code` is a closed private union grouped by the eight categories, not an arbitrary
string. Phase 0 MUST check in the union and a golden envelope for every code before Phase 7; adding
or renaming a code is an artifact-contract change. At minimum it distinguishes invalid grammar,
selector, project root, manifest, gateway type/escape/import/package identity, artifact kind,
version, UTF-8, JSON, duplicate key, compression, compressed/decompressed/canonical bound,
identity, noncanonical Cause, incompatibility, evidence unavailable, destination exists,
unsupported atomic publication, read/write/flush/close, broken pipe, story execution, cleanup,
interruption, and internal invariant.

### CLI-008 — Stdout, stderr, and formatting are exact

Completed and comparison results write exactly one newline-terminated text rendering or JSON
document to stdout and nothing to stderr. Failures write exactly one rendering or JSON document
to stderr and nothing to stdout. JSON and non-TTY text contain no ANSI escapes. Repeated commands
over identical inputs MUST produce byte-stable JSON and deterministic text order.
An `EPIPE` from stdout or stderr selects exit 2 and MUST NOT recurse into a second write. Flow
constructs each stream's output as one complete buffer and attempts one write, but cannot promise
an envelope or zero accepted bytes on the stream whose write failed.

A completed story always has `outcome: "completed"`, including typed product failures, contained
primitive defects, or interruptions represented in its product evidence. Machine state is product
truth; the CLI does not decide whether that state passes a test.

### CLI-009 — One process owner selects exit status

Exit status is exactly:

- `0` for a completed non-comparison command or a complete equal comparison;
- `1` when `behavior check`, `behavior diff`, or `trace diff` is `different` or `incomplete`;
- `2` for usage, gateway, artifact, story execution, cleanup, local I/O, or internal failure;
- `130` after first `SIGINT` cleanup;
- `143` after first `SIGTERM` cleanup.

Leaf handlers MUST NOT mutate `process.exitCode` or call `process.exit`. One main owner maps the
immutable result only after the CLI Effect runtime and every owned resource dispose.

### CLI-010 — Signals interrupt work but not cleanup

The first `SIGINT` or `SIGTERM` interrupts current work. A story run stops later commands,
captures `atFailure`, awaits non-abortable cleanup, writes a requested partial trace atomically,
then emits the interruption diagnostic. Cleanup or trace-write failure remains attached, but the
signal exit code remains 130 or 143. Discovery and artifact commands finalize temporary gateway
or output files before returning. A second signal may terminate immediately; `SIGKILL` and host
loss provide no cleanup or output guarantee.

The link/rename is the exact artifact commit boundary for signal handling. A first signal observed
before it prevents publication, removes the sibling temporary, and preserves the prior or absent
destination. A first signal observed after it never rolls back or deletes the committed artifact;
Flow completes cleanup and emits the interruption result with the signal exit code. Deterministic
tests MUST gate both sides of the filesystem call rather than infer the boundary from wall-clock
timing.

## Truncation and proof

### CLI-011 — Truncated evidence cannot prove completeness

`trace summarize` succeeds with exit 0 but labels its counts and timeline as retained-window
evidence and exposes `truncatedBeforeSequence`.

`trace proof` MUST NOT report an absent actor or correlation as unknown when the artifact is
truncated. It fails with an `EvidenceUnavailable` artifact diagnostic carrying the truncation
marker. The same absence in a complete artifact is an ordinary unknown-selector diagnostic.

`trace diff` returns `completed` only when both inputs are complete and every selected section is
equal, `different` when any retained compared fact differs, and `incomplete` when retained facts
match but either input is truncated. It MUST NOT print “equal” or “no changes” for incomplete
evidence.

The `--section` domain is exactly `event-sequence`, `transitions`, `state-changes`, `issues`,
`resource-patches`, `resource-freshness`, `transaction-outcomes`, `stream-outcomes`,
`child-outcomes`, or `timer-behavior`. Comparing artifacts with different app identity or AppPlan
fingerprint is an incompatibility diagnostic with exit 2, never an ordinary difference.

### CLI-012 — Binary proof is fresh and installed

Source handler/parser/codec tests and a newly built packed binary MUST run the same success and
failure vectors. Bin tests build first and invoke the installed consumer shim from a read-only
project; no checked-in or previously generated `dist` may satisfy acceptance.

Proof MUST cover the exact grammar and rejected legacy flags, gateway containment and inertness,
temporary cleanup, undeclared imports, package identity, text/JSON parity, stdout/stderr, every
exit status, stdin, gzip, all WIRE-016 bounds, hostile identity, atomic replacement, direct/CLI
story parity, zero-history and one-sink runs, partial traces, real signals, and complete,
different, and truncated comparisons.
