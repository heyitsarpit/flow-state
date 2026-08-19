# Command-line interface contract

Status: normative target vNext contract; not shipped

The installed `flow-state` binary is a host for compiled behavior discovery, Story execution,
and bounded artifacts. It consumes the same Story executor, TurnRecords, inspection projections,
and production artifact-validation paths as the library. It must not create another
runtime, runner, history, validator, matcher language, or artifact interpretation path.

Artifact and trace schema authority belongs to [`PERSISTENCE_AND_ARTIFACTS.md`](./PERSISTENCE_AND_ARTIFACTS.md).
This contract owns CLI grammar, gateway loading, file/stream I/O, formatting, exit status, and proof
obligations. The CLI consumes the one Flow-owned package-private decoded v2 model shared with the
Story runner; it MUST NOT define a CLI-only artifact decoder, Story-evidence model, result schema, or
legacy `final`/`children` compatibility shape. This target contract does not claim that the package,
Phase 0 fixtures, phase receipts, or installed binary already ship the target schema; `REV-MIG-005` and
WIRE-020B are the current schema authority, while executable gates still prove the implementation.

The CLI is a process host over compiled behavior inspection, runtime inspection and trace projections,
static source analysis, the shared Story executor, bounded artifact codecs, and process/file I/O. It owns
arguments, gateway selection, formatting, files, signals, and exit status; it MUST NOT own machine
semantics, actors, schedulers, stores, transition evaluation, runtime evidence history, or a competing
Story/runtime model. `story run` remains a host entry point into the shared production Story executor;
artifact-only commands remain execution-free as defined below.

## Command grammar

### CLI-001 — The leaf command set is exact

```text
flow-state behavior build --output <path> [--force] [--project-root <dir>] --gateway <path> [--format text|json]
flow-state behavior render <artifact|-> [--section contract|coverage] [--module <id>] [--format text|json]
flow-state behavior diff <left> <right> [--module <id>] [--format text|json]
flow-state behavior check <expected|-> [--project-root <dir>] --gateway <path> [--format text|json]

flow-state story list [--project-root <dir>] --gateway <path> [--machine <id>] [--tag <tag>] [--format text|json]
flow-state story describe <story-id> [--project-root <dir>] --gateway <path> [--format text|json]
flow-state story run <story-id> [--project-root <dir>] --gateway <path> [--trace-output <path>] [--force] [--format text|json]

flow-state trace summarize <artifact|-> [--format text|json]
flow-state trace proof <artifact|-> --selector <selector> [--format text|json]
flow-state trace diff <left> <right> [--section <section>] [--format text|json]
```

`behavior check` is the only new vNext leaf. It builds the live behavior in memory and compares
its canonical artifact with the supplied expected artifact through the same diff projection as
`behavior diff`.

`--project-root` defaults to the canonicalized current working directory. `--gateway` is required for
every gateway-loading command and resolves only relative to that root; no ancestor search or implicit
gateway filename is permitted. `--format` defaults to `text`; `behavior render --section` defaults to
`contract`, and `trace diff --section` defaults to the complete ordered section set. `--force` is valid only
with `--trace-output`. An option may occur once only; unknown options, missing option values, conflicting
repeated operands, and `--force` without its output target are usage failures.

The binary MUST NOT expose the deleted Story and scenario surfaces in `DEL-009` or the conflicting
server, persistence, artifact, inspect, and CLI surfaces in `DEL-010`; it stays within the accepted
`REV-TEST-001`–`010` and `REV-MIG-004` boundaries. Pure model traversal stays in
`flow-state/testing`; host test runners own batch execution and assertions.

### CLI-002 — Trace selectors are data, not expressions

The selector grammar is exactly `issues`, `timeline`, `actor:<id>`, or `correlation:<id>`.
`actor:` and `correlation:` split at the first colon and preserve the remainder as the exact ID.
An empty ID, missing or repeated selector, unknown kind, or executable expression is a usage
failure. Selector parsing MUST NOT load a gateway or evaluate application code.

## Gateway loading

### CLI-003 — Gateway discovery supports trusted local TypeScript

`--project-root` names the project root and is canonicalized before use. `--gateway` names the
gateway TypeScript file, resolves relative to that root, and MUST remain inside it after symlink
resolution. The root MUST be an existing directory and its manifest is exactly
`<canonical-project-root>/package.json`; discovery never searches an ancestor. The gateway MUST be
an existing regular `.ts` or `.mts` file.

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

`story run` MUST use the package-private executor that also implements the plan's public `.run()`.
It MUST produce the same checkpoints, `run.end` evidence, execution error, private ordered `CauseProjection`
projection, and cleanup truth. The CLI MUST NOT call the deleted Scenario runner or add a public
sink option to `StoryPlan.run()`.

A successful `story run` emits the WIRE-020B `CliResult` with `outcome: "completed"`, a non-null `end`,
and `failure: null`. Execution, cancellation, cleanup, or trace-write failure emits `CliError` for
`command: "story.run"` with the partial Story failure in its primary diagnostic and ordered secondary
diagnostics; it never emits an incomplete successful Story result.

The Story runner and CLI MUST consume the same package-private decoded evidence model for checkpoints,
end evidence, failure evidence, cleanup truth, and retained trace records. Neither surface may add a
second decoded model or expose that internal model as a public package type.

## Artifacts and files

### CLI-005 — One bounded artifact path owns input

Behavior and trace input MUST pass through the retained bounded artifact-validation path and WIRE-016
structural limits before projection. Artifact-only commands MUST NOT load an application or run a boot-domain
decoder. The accepted artifact kinds, versions, compression representation, and exact nested schemas are
defined by WIRE-020B; this contract MUST NOT invent a competing envelope, codec, format migration, public
field, or diagnostic shape, and deleted Scenario/local-proof formats MUST NOT be accepted. The target decoded
model has no legacy `final` or `children` members. Inputs are either stable-key UTF-8 JSON or exactly one
gzip member; concatenated gzip members, trailing bytes, unsupported compression, and decompression-bound
violations are `DecompressionFailed` or the applicable bounded-input diagnostic. Artifact files are always
uncompressed stable-key UTF-8 JSON with exactly one trailing newline at the file boundary. Command output
uses the selected `--format`; text is the deterministic line document defined by CLI-008 and JSON is the
canonical WIRE-020B envelope.

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
attempts to remove the temporary file; a failed removal is a named cleanup diagnostic and MUST NOT alter the
destination guarantee. After commit, cleanup may only remove the sibling temporary. VNext's
guarantee is POSIX same-filesystem link/rename semantics, never truncate-in-place writing;
unsupported filesystems fail with a named local-I/O diagnostic rather than weakening the
guarantee.

A story run without `--trace-output` installs no inspection sink and retains no history. A traced
run installs exactly one `createInspectionBufferSink()` at its default capacity of 256. The
artifact preserves retained TurnRecords, `truncatedBeforeSequence`, completed checkpoints,
partial failure evidence, private `CauseProjection`, and cleanup truth. Execution failure MUST NOT suppress
requested trace output. If execution and artifact writing both fail, the primary diagnostic retains the
execution failure and `secondary` retains artifact-write, sink-drain, and cleanup diagnostics in deterministic
operation order.
Destination and parent-directory preflight MUST finish before story runtime or fixture acquisition,
so a known no-force conflict has no application side effect. A race discovered at hard-link commit
is a later local-I/O failure and leaves the newly created destination untouched.

## Results and diagnostics

### CLI-007 — One immutable result owns text and JSON

Help and version output are conventional unversioned text. Every executed leaf command otherwise
creates one immutable package-private result and derives both formats from it. The CLI MUST NOT
export another public `FlowCli*` result or diagnostic hierarchy.

The private JSON result retains the exact leaf-command discriminant:

```ts
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
```

The private result data remains closed by command. Build and render expose compiled app/module identity;
diff and check expose comparison sections; Story list and describe expose registered Story data; Story run
exposes exact actor-targeted checkpoints, `run.end`, and optional trace output; and trace commands expose
retained evidence and comparison sections. Every collection uses the ordering of its artifact projection,
optional file outputs use `null`, and the exact nested result and failure members are the WIRE-020B model.

Failure and diagnostic data MUST reuse the accepted package-owned Story error envelope and
`CauseProjection`-bearing
inspection/artifact projections. Cleanup aggregation and the Story failure boundary are closed by the Story
contracts; the artifact Cause projection and remaining artifact/CLI representation are fixed by WIRE-020B.
The CLI MUST NOT reconstruct
Scenario, expected-state, matcher, or the deleted Story/scenario vocabulary.

The Story vocabulary is `run.end`; it does not imply actor completion, and the CLI MUST NOT introduce a
legacy `final` alias in text, JSON, or decoded evidence.

The exact private result and diagnostic unions, including the WIRE-020B `flow-state/cli-result.v2` envelope,
Cause projection, checkpoint, actor-evidence, cleanup, timeline, and bound members, are owned by WIRE-020B.
This contract MUST NOT define a second result/data/outcome/diagnostic schema or invent diagnostic codes.

### CLI-008 — Stdout, stderr, and formatting are exact

Completed and comparison results write exactly one newline-terminated text rendering or JSON
document to stdout and nothing to stderr. Failures write exactly one rendering or JSON document
to stderr and nothing to stdout. JSON and non-TTY text contain no ANSI escapes. Repeated commands
over identical inputs MUST produce byte-stable JSON and deterministic text order.
An `EPIPE` from stdout or stderr selects exit 2 and MUST NOT recurse into a second write. Flow
constructs each stream's output as one complete buffer and attempts one write, but cannot promise
an envelope or zero accepted bytes on the stream whose write failed.

Text output is a deterministic UTF-8 line document. Each line is `path = scalar`, where paths use dot
segments and zero-based `[index]` segments, scalar strings use JSON escaping, and null/boolean/number
values use canonical JSON tokens. Lines follow the WIRE-020B field and collection order, contain no blank
lines or ANSI escapes, and end with exactly one newline. JSON output is the exact canonical WIRE-020B
envelope with exactly one trailing newline.

A successful Story result always has `outcome: "completed"`; typed product failures and contained domain
defects remain product evidence rather than CLI assertion failures. Runtime execution, cancellation, cleanup,
or trace-write failure uses `CliError` instead. Machine state is product truth; the CLI does not decide
whether that state passes a test.

### CLI-009 — One process owner selects exit status

Exit status is exactly:

- `0` for a completed non-comparison command, an incomplete `trace summarize`, or a complete equal comparison;
- `1` when `behavior check` or `behavior diff` is `different`, or when `trace diff` is `different` or
  `incomplete`;
- `2` for usage, gateway, artifact, story execution, cleanup, local I/O, or internal failure;
- `130` after first `SIGINT` cleanup;
- `143` after first `SIGTERM` cleanup.

Behavior artifacts are complete declaration artifacts: `behavior check` and `behavior diff` produce only
`equal` or `different`. They never use the trace-only `incomplete` outcome; an invalid or incompatible
behavior artifact is an exit-2 artifact failure.

Leaf handlers MUST NOT mutate `process.exitCode` or call `process.exit`. One main owner maps the
immutable result only after the CLI Effect runtime and every owned resource dispose.

### CLI-010 — Signals interrupt work but not cleanup

The first `SIGINT` or `SIGTERM` interrupts current work. A story run stops later commands,
captures failure-boundary evidence, awaits non-abortable cleanup, writes a requested partial trace atomically,
then emits a `CliError` with `category: "interruption"` and the signal-specific diagnostic. Cleanup or
trace-write failure remains in ordered secondary diagnostics, but the
signal exit code remains 130 or 143. Discovery and artifact commands finalize temporary gateway
or output files before returning. A second signal may terminate immediately; `SIGKILL` and host
loss provide no cleanup or output guarantee.

The link/rename is the exact artifact commit boundary for signal handling. A first signal observed
before it prevents publication, removes the sibling temporary, and preserves the prior or absent
destination. A first signal observed after it never rolls back or deletes the committed artifact;
Flow completes cleanup and emits the interruption `CliError` with the signal exit code. Deterministic
tests MUST gate both sides of the filesystem call rather than infer the boundary from wall-clock
timing.

## Truncation and proof

### CLI-011 — Truncated evidence cannot prove completeness

`trace summarize` succeeds with exit 0 but labels its counts and timeline as retained-window
evidence and exposes `truncatedBeforeSequence`. This remains exit 0 for both complete and incomplete
summaries; incompleteness is evidence metadata, not a command failure.

`trace proof` MUST fail for every truncated artifact with an `EvidenceUnavailable` artifact diagnostic carrying
the non-null `truncatedBeforeSequence` marker. It MUST NOT report retained evidence as a complete proof and
MUST NOT report an absent actor or correlation as an ordinary unknown while the artifact is truncated. The
same absence in a complete artifact is an ordinary `UnknownSelector` diagnostic.

`trace diff` returns `equal` only when both inputs are complete and every selected section is equal. It returns
`different` when any retained compared fact differs, even when either input is truncated, and returns
`incomplete` only when retained facts match but either input is truncated. It MUST NOT print “equal” or “no
changes” for incomplete evidence.

The `--section` domain is exactly `event-sequence`, `transitions`, `state-changes`, `issues`,
`resource-patches`, `resource-freshness`, `transaction-outcomes`, `stream-outcomes`, or
`timer-behavior`. Comparing artifacts with different app identity or incompatible compiled AppPlan identity
is an incompatibility diagnostic with exit 2, never an ordinary difference.

### CLI-012 — Binary proof is fresh and installed

Source handler/parser/codec tests and a newly built packed binary MUST run the same success and
failure vectors. Bin tests build first and invoke the installed consumer shim from a read-only
project; no checked-in or previously generated `dist` may satisfy acceptance.

Proof MUST cover the exact grammar and rejected legacy flags, gateway containment and inertness,
temporary cleanup, undeclared imports, package identity, text/JSON parity, stdout/stderr, every
exit status, stdin, all WIRE-016 bounds, hostile identity, atomic replacement, direct/CLI
story parity, zero-history and one-sink runs, partial traces, exact actor evidence lookup,
`run.end`, module tooling ownership, compound states, context requirements, lifecycle records,
operation identities, real signals, and complete, different, and truncated comparisons.

## Local proof obligations

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
