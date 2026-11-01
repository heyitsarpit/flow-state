# Future expansions

Captured from the product discussion on 2026-09-05.

Status: exploratory ideas for later experiments. This is not a normative contract,
an implementation claim, an approved public API, or a task ledger. Active contracts
remain authoritative; implementation work belongs in Beads when an experiment is
selected. All API names, command flags, and output shapes below are illustrative.

## Product direction

Build a comprehensive state-management library for React whose business behavior
can be inspected, exercised, and explained without rendering React. Reuse the same
application runtime and Stories to make that behavior watchable in the real UI.

The useful breadth includes machines, cached resources, transactions, streams,
timers, cross-actor dependencies, persistence, and domain packages. Their value is
shared execution and evidence semantics, with approachable everyday authoring.

Distinguish three kinds of knowledge:

| Question | Evidence |
| --- | --- |
| What is declared? | Compiled machines, transitions, operations, dependencies |
| What happened? | Committed traces, checkpoints, operation outcomes |
| Why is it correct? | Explicit business rules, authored assertions, invariants |

A declaration diff cannot prove callback behavior unchanged. A trace covers its
observed execution, not every possible execution. Business logic hidden in React
callbacks or external services is outside Flow's direct knowledge. Tooling should
label declarations, observations, and inferences distinctly and retain evidence
completeness/truncation information.

## 1. Story-driven UI playback

### Intent and preferred shape

Run an existing Story against the actual application runtime while React renders
that runtime. A user can watch a complete flow without touching the application.
The preferred presentation is a floating overlay over the normal full application,
not an application enclosed inside a preview box.

Author business commands in the Story; keep captions, viewing delays, and capture
settings in a separate playback description. One Story can support headless tests,
CLI execution, demos, and visual review.

```ts
const autosaveDemo = playback(autosaveRecovery, {
  scenes: {
    unsaved: {
      caption: "Changes appear immediately.",
      hold: "1 second",
    },
    "save-failed": {
      caption: "Your draft survives a failed save.",
      hold: "2 seconds",
    },
    saved: {
      caption: "Retry saves the document.",
      hold: "1 second",
    },
  },
  capture: {
    viewport: { width: 1440, height: 900 },
    reducedMotion: true,
  },
});
```

Here `autosaveRecovery` is an ordinary Story with named checkpoints: edit, advance
the debounce clock, process a fixture-controlled failure, retry, process success.
Its event values must use the actual admitted event-token API; these sketches do
not change the current Result boundary.

```tsx
<PlaybackHost demo={autosaveDemo}>
  {({ runtime }) => (
    <FlowProvider runtime={runtime}>
      <EditorApp />
      <PlaybackOverlay position="bottom" />
    </FlowProvider>
  )}
</PlaybackHost>
```

Example overlay:

```text
Save failed · Scene 2 of 3
Your draft remains available while the connection is unavailable.

[Restart] [Back] [Play] [Next]                         [1×]
```

### Controls and execution boundaries

| Control | Proposed meaning |
| --- | --- |
| Play / pause | Continue or pause at defined command/scene boundaries |
| Next | Execute to the next defined boundary and render the result |
| Speed | Change presentation pacing, separately from application time |
| Restart | Fresh runtime with the same isolated fixtures |
| Back / scene navigation | Initially restart and re-execute to the chosen scene |

The playback host should reuse the production Story executor through a deliberately
designed stepping boundary, not create another interpreter. The current contracts
do not grant this stepping API; accepting it requires design and contract work.

Pausing command dispatch does not freeze in-flight operations. Stable scenes need
controlled clocks and fixture responses; presentation time and TestClock time are
separate. Cleanup and cancellation must still use production ownership.

Focus, scrolling, cursor position, and typing animation are browser presentation
state. Optional presentation instructions could control them later, but must not
silently introduce business events. Decide how manual user interaction during
playback affects determinism before promising interactive takeover.

Story-driven UI playback proves how the UI responds to business events. It does
not prove that a button or input sends the right event. Retain browser interaction
tests for wiring, accessibility, and host lifecycle behavior.

### Uses

- Living product demos and onboarding walkthroughs backed by executable Stories.
- Design review of empty, loading, failure, and recovery states.
- Visual regression captures at named scenes.
- Reproducible bug demonstrations with known fixtures and version identity.
- Guided explanations with captions and inspection evidence.

Arbitrary time travel, production replay, and recording-to-Story conversion are
later research topics. A trace alone is not necessarily an executable reproduction,
and restarting must not repeat uncontrolled external side effects.

## 2. Structured guard reasons through can

The user preferred enriching existing guards and `can`, rather than introducing
a separate `decision()` abstraction or `.explain()` method.

Allow boolean guards for simple cases and structured results for explanations:

```ts
guard: ({ memory, context }) =>
  memory.total <= context.creditLimit
    ? { allowed: true }
    : {
        allowed: false,
        reason: {
          code: "CreditLimitExceeded",
          total: memory.total,
          limit: context.creditLimit,
        },
      }
```

Preserve boolean `can`; explore an explicit detailed mode:

```ts
can(submitEvent); // false

can(submitEvent, { explain: true });
// {
//   allowed: false,
//   reason: { code: "CreditLimitExceeded", total: 1200, limit: 1000 },
// }
```

The detailed overload is a candidate, not a selected signature. Preserve precise
reason types and pure/passive query behavior. Reasons are structured domain data
that applications can localize, not mandatory library-authored UI strings.

Detailed results should distinguish no matching handler from guard rejection. For
ordered candidate transitions, identify the winner or rejected candidates without
evaluating callbacks that ordinary eligibility evaluation would skip.

Actual dispatch should retain its evaluated guard result in execution evidence.
An earlier `can` query cannot explain a later dispatch if state changed. Inspection
must separate recorded decisions from a fresh eligibility query.

```text
SubmitRequested was blocked.

Reason: CreditLimitExceeded
Total:  1,200
Limit:  1,000
Evidence: actor order-42, turn 18
```

Explore stable authored guard identities only if transition identity is insufficient;
do not require a new expression language for ordinary TypeScript calculations.

## 3. Playback-based behavioral and visual PR review

The user wants behavioral and visual diffs as outputs of playback, with review
artifacts that can be posted directly in a PR. Treat them as one feature.

Compare the same Story at the same named scene on the base and proposed revisions.
Build and run each revision in isolated browser sessions using controlled fixtures.

```sh
flow-state playback review \
  --gateway ./behavior.ts \
  --base origin/main \
  --output ./playback-review
```

This proposed command/registration mechanism extends the current closed CLI grammar;
the precise gateway integration remains to be designed.

| Artifact | Reviewer experience |
| --- | --- |
| Scene screenshots | Base, proposed revision, highlighted pixel differences |
| Behavioral comparison | State, memory, operations, and guard-reason changes |
| Recordings | Watch the complete flow before and after |
| HTML report | Synchronized comparison and named-scene navigation |
| Structured report | CI/agent consumption and explicit evidence gaps |

Example PR comment:

```text
Playback review: 1 of 3 scenarios changed

Autosave recovery → save-failed

Visual: error notice moved below the editor.
Behavior: draft retained in both versions; retry is now unavailable.
Guard: RetryBackoffActive; remaining application time: 2000 ms.

[Compare scene] [Watch base] [Watch PR]

Other scenarios: no differences in captured scenes or selected evidence.
```

Use screenshots to detect visual changes and recordings for human interpretation;
video-frame equality is too sensitive to incidental timing. Capture readiness needs
a Story checkpoint, committed React update, ready fonts/assets, and a bounded
application-specific readiness condition where necessary. Hide controls during
capture; make captions optional. Resolve animation and viewport settings explicitly.

Behavior comparisons should ignore incidental capture timestamps and compare
selected semantic facts. Report changed declarations, changed observed behavior,
visual changes, and coverage gaps separately. Missing/renamed Stories or scenes and
incompatible artifacts need explicit results, not silent omission or false equality.

An unchanged set of scenes is not proof that all behavior is unchanged. Structured
guard evidence helps identify changes hidden inside otherwise identical graphs.

Local execution produces files. A CI integration uploads artifacts and publishes the
PR comment with configured authorization. No direct publishing is implied by this
note. Shareable artifacts should account for fixture data and redaction; existing
share-only artifact limitations must not be silently bypassed.

## 4. Suggested and generated test scenarios

### Preferred first feature

Help discover scenarios that need testing, then generate executable setup where
possible. This is the user's intended starting point, rather than automatically
inventing assertions or beginning with randomized property tests.

```sh
flow-state story suggest --gateway ./behavior.ts
```

```text
1. Save fails after a draft edit
   Why: SaveFailed has no observed Story coverage.
   Setup: edit → advance debounce → save failure
   Missing: fixture producing save failure
   Assert: required

2. Retry succeeds after save failure
   Why: recovery path has no observed coverage.
   Setup: extend scenario 1 → retry → save success
   Missing: failure-then-success fixture
   Assert: required

3. Sign out with unsaved changes
   Why: sign-out transition is unexercised in DIRTY.
   Setup: edit → sign out
   Assert: required
```

A selected suggestion could generate a Story scaffold with event sequence,
checkpoints, fixture requirements, and visibly missing expectations. Do not emit a
passing test merely because the Story executes successfully. Unasserted scenarios
may still serve playback and observed coverage, but remain unasserted.

Separate finding a path from specifying correctness. Structural model traversal can
suggest bounded paths; existing Stories and fixtures can supply known setup.
Arbitrary guards and external behavior may prevent realizing a structural path.
Mark infeasible/unknown setup honestly. Distinguish deterministic structural
suggestions from AI-inferred business cases, which need human review.

### Later: invariant-driven exploration

Once a user authors an invariant, bounded generated sequences can search for a
counterexample and shrink it to a small reproducible Story. This complements the
scenario suggestion feature; it does not replace the missing correctness oracle.

Example invariant: failed saves preserve the draft. A test-runner adapter could
accept event generators, seed, run/step bounds, and assertions outside the Story.
It would compose ordinary Stories and reuse their production executor.

```text
Invariant failed: failed saves preserve the draft
Seed: 42
Runs attempted: 73
Original sequence: 24 commands
Reduced reproduction: 4 commands

Saved: reproduction.json, failure.trace.json
```

Reproduction needs codecs for event inputs, fixture configuration, and version
identity. Where reproducible, feed the reduced Story into playback. Exploration is
bounded evidence, not exhaustive proof; fixtures must realize asynchronous outcomes
through the real operation kernels rather than injecting invented runtime facts.

## 5. Agent-facing inspection

Expose structured discovery, Story execution, and evidence inspection through a
thin agent adapter over the existing owners. Avoid a second behavior interpreter.

```ts
const tools = behaviorTools(BehaviorGateway);
```

```json
{
  "question": "Why did autosave fail?",
  "basis": "observed-execution",
  "story": "autosave-recovery",
  "checkpoint": "save-failed",
  "finding": {
    "operation": "Editor/save",
    "outcome": "failure",
    "code": "NetworkUnavailable"
  },
  "evidence": { "sequence": 18, "truncated": false }
}
```

Agents can discover flows, run reproductions, inspect blocked events, propose test
scenarios, and summarize PR reviews. Responses should cite evidence identity and
classify declarations, observations, and inference. Do not infer a backend root
cause from a client failure code alone. Execution capabilities need the same
fixture/live-environment distinctions as other hosts.

## 6. Domain packages

### Forms

Own editing/submission behavior while leaving rendering to application components.
Compile to ordinary Flow machines and operations so all inspection, Story, and
playback features work without a form-specific execution engine.

```ts
const ProfileForm = form({
  id: "ProfileForm",
  schema: ProfileSchema,
  initial: ({ input }) => input.profile,
  submit: saveProfile,
  validateOn: "blur",
});
```

```tsx
const profile = useForm(ProfileForm, {
  input: { profile: initialProfile },
});

return (
  <form onSubmit={profile.submit}>
    <input {...profile.field("email").inputProps} />
    <FieldError error={profile.field("email").error} />
    <button disabled={!profile.canSubmit}>Save</button>
  </form>
);
```

Exact schema integration, browser prop typing, machine exposure/registration,
ownership, and hook shape remain open. A possible package value exposes `.machine`
for admission into an ordinary module, plus typed events/selectors/Story helpers.

Initial behavior scope: dirty/touched fields, typed validation issues, server field
errors, duplicate-submit prevention, and explicit reset behavior. Autosave and
multi-step progression should compose later rather than all becoming form options.

```text
ProfileForm
State: editing
Dirty fields: email
Touched fields: email

Submit blocked: email → InvalidEmail
Submission: no attempt in progress
```

### Other packages discussed

| Package | Owned behavior | Inspection/playback benefit |
| --- | --- | --- |
| Multi-step flows / onboarding | Prerequisites, branching, back navigation, resume | Explain unavailable steps; demonstrate branches |
| Editable documents | Draft/saved values, autosave, retry, conflicts | Explain unsaved work and show recovery |
| Collections | Filters, sorting, pagination, selection, bulk operations | Explain visible/selected rows and partial failures |
| Uploads | Queue, progress, cancellation, retry, bounded concurrency | Per-file lifecycle and recovery scenes |
| Approval workflows | Review stages and permission/prerequisite guards | Explain blocked actions and demonstrate approval paths |

Packages should supply useful defaults and reusable scenarios while preserving
application-owned domain decisions. Broad capability should not require learning
the full runtime architecture to implement a normal form, query, or save operation.

## Suggested first experiment

Use one editor autosave/retry Story as the vertical experiment: edit a document,
show unsaved state, advance the debounce, show saving, fail through a fixture, show
the retry notice, and retry successfully.

1. Mount the real app with overlay Play, Next, and Restart controls.
2. Compare visible and headless executions at the same checkpoints.
3. Capture stable screenshots and before/after behavioral evidence for a PR report.
4. Exercise a structured guard reason, such as retry backoff.
5. Suggest an uncovered recovery scenario and expose its missing assertion.

This is a suggested experiment, not a committed sequence or implementation task.
Defer arbitrary seeking, uncontrolled production replay, and durable distributed
workflows until their additional semantics are justified. Persistence and trace
capture alone do not guarantee safe replay of irreversible external work.

## Contract entrypoints to revisit when selecting an experiment

- [Testing](reference/incident-console/implementation/contracts/TESTING.md): inert
  Stories, production executor, checkpoints, model traversal, host assertions.
- [React and hosts](reference/incident-console/implementation/contracts/REACT_AND_HOSTS.md):
  runtime attachment, ownership, rendering, and cleanup.
- [Public API](reference/incident-console/implementation/contracts/PUBLIC_API.md)
  and [semantics](reference/incident-console/implementation/contracts/SEMANTICS.md):
  guards, passive eligibility, route disposition, and production evidence.
- [CLI](reference/incident-console/implementation/contracts/CLI.md) and
  [artifacts](reference/incident-console/implementation/contracts/PERSISTENCE_AND_ARTIFACTS.md):
  command grammar, artifact identity, comparison, truncation, and share boundaries.
