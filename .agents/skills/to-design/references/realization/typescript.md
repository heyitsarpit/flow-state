# TypeScript realization (target: typescript)

Apply this guide across the implementation and every concrete Spec design section, including
models, operations, algorithms, and composition; its scope is not limited to `realization`.

Read when ordinary TypeScript is the chosen target. Apply choices in code or the requested proposal.
Use the project's runtime, compiler settings, and established libraries.
Preserve Effect's modeling and runtime discipline; identify which guarantees need host support.

## Mapping

| Spec content             | TypeScript realization                                               |
|--------------------------|----------------------------------------------------------------------|
| `model` value            | Schema-derived type; brand only for useful nominal distinction.      |
| `model` state            | Discriminated unions for closed states; explicit shared fields.      |
| `model` transition       | Pure function, or owner operation when state changes.                |
| `operations` entry       | Function or method; Promise only for asynchronous work.              |
| Transformer boundary     | Function implementing the transformation concern.                    |
| Capability boundary      | Explicit dependency; independent contract when substitution needs it. |
| `protocol`               | Shared schema-derived or named type; validate untrusted input.       |
| `owner`                  | Class with private state, factory closure, or encapsulated module.   |
| `composition.boundaries` | Public signatures carrying named protocols and established facts.    |
| `rules.publication`      | Enforce the promised visibility with the storage/host mechanism.     |
| `model` error            | neverthrow Result / ResultAsync with a named recoverable error type. |
| `composition.uses`       | Data and dependencies as arguments; construct at the owning scope.   |
| Asynchronous lifetime    | Cooperative cancellation; join owned work before releasing resources. |
| `tests`                  | Public-boundary checks using the project runner and real components. |

## Library choices

Prefer these when the capability is needed and the project has no established equivalent.
Check installed versions and host support; do not add the entire list as a default stack.

| Need                    | Recommendation and limit                                           |
|-------------------------|--------------------------------------------------------------------|
| Admission and types     | [Zod][zod]: declare constraints; infer types; brand when useful.     |
| Recoverable errors      | [neverthrow][nt]: Result / ResultAsync; map, andThen, match.         |
| Exhaustive branching    | [ts-pattern][patterns]: complex variants; switch for simple cases.  |
| Concurrent work         | [p-limit][limit] for simple limits; [p-queue][queue] for scheduling. |
| Node diagnostics        | [Pino][logs]: structured events, child context, and redaction.       |

Use p-queue for priorities, pause/resume, or rate limits; running tasks must cooperate with abort.
p-limit does not cancel active tasks. Neither provides structured concurrency.
Use [Effection][scope] when child lifetimes, cancellation, and release need a scope runtime.
Keep logging context and causes useful for diagnosis; protect sensitive fields at the logger.

## Inference and public contracts

- Infer implementation details. Derive types with typeof / ReturnType when useful; a class name
  already names its instance type. Do not duplicate an implementation with a matching interface.
- Declare independent contracts when substitution or API stability needs them. Check the
  implementation against that contract instead of relying only on errors at consumers.
- Add explicit return types for measured inference or declaration-emission bottlenecks;
  an interface is not automatically faster. See [TypeScript performance guidance][compiler].

## Construct and narrow valid values

- Use `[T, ...T[]]` where an operation requires a nonempty sequence. Keep `T[]` for total
operations.
  Represent an ordered range as a start and nonnegative duration, validated at construction.
- Narrow by discriminant before using custom guards; a guard must actually verify its claimed shape.
  Do not assert away missing evidence.
- Use `satisfies` to check a value against a contract while preserving its inferred type.
- Make variant handling exhaustive. For a switch, assign the remaining value to `never` in its
  default branch so a new unhandled variant fails compilation.

## Rules the types cannot enforce

- Accept unknown input; declare admission constraints in schemas and derive types from them.
  Share protocol definitions. Use readonly only when mutation would violate a declared contract.
  It does not prevent mutation through aliases; copy or protect snapshots when facts must be stable.
- Hide owned state behind operations; use #private when runtime privacy matters. TypeScript has no
  linear types: recheck one-shot and stale facts at the owner. A reusable handle is not proof.
- Await permits interleaving. Keep publication indivisible using the actual storage/host mechanism;
  an event loop does not make changes spanning awaits or external effects atomic.
- Pass dependencies explicitly and construct them at their owning lifetime. Reuse established
  libraries for larger needs; do not introduce a DI container or concurrency framework by default.
- Expose host clocks, cancellation, and I/O controls when deterministic verification needs them.
  Retain inputs, state, and causes that explain failures.

## Examples

These mirror the Effect guide using Zod and neverthrow, without recreating its runtime.

### Schema admission and optional branding

```ts
import { z } from "zod";

const Priority = z.number().int().min(0).max(100).brand<"Priority">();
type Priority = z.infer<typeof Priority>;

const rawPriority: unknown = 10;
const admission = Priority.safeParse(rawPriority);
```

- The schema owns validation; use admission.data only after admission.success. No handwritten
  guard, repeated type declaration, or assertion is needed.
- Like Effect Schema.brand, branding preserves nominal distinction after validation without adding
  runtime checks. Omit it when the distinction adds no value.

### Closed states and plain transformations

```ts
type JobState =
  | { tag: "Queued"; id: string; priority: Priority }
  | { tag: "Running"; id: string; startedAt: number }
  | { tag: "Done"; id: string; result: string };

function queuedJob(id: string, priority: Priority): JobState {
  return { tag: "Queued", id, priority };
}
```

- Like tagged enums, each variant carries its required data. Queued jobs need no startedAt or
  result.
- queuedJob transforms established inputs; it does not revalidate Priority.

### A substitutable capability and its lifetime

```ts
import { ok, err, type Result, type ResultAsync } from "neverthrow";

type RenderedMessage = { recipient: string; body: string };
type Receipt = { providerId: string };
type SendError =
  | { tag: "Rejected"; cause: unknown }
  | { tag: "SubmissionUncertain"; cause: unknown };

interface Sender {
  send(message: RenderedMessage, signal: AbortSignal): ResultAsync<Receipt, SendError>;
  close(): Promise<void>;
}
type OpenSender = (signal: AbortSignal) => Promise<Sender>;
```

Sender is an independent contract for interchangeable providers, not a copy of one implementation.

- **Service / Layer:** supply a configured OpenSender factory; construct and share Sender at its
  owning lifetime. Explicit arguments do not recreate R's typed requirement tracking.
- **Scope / structured concurrency:** propagate cancellation to owned work and join it before
  releasing resources. AbortSignal requires cooperating adapters; it does not cancel a Promise.
  Use the project's task/scope library when these guarantees need more than a local arrangement.
- **Error channels:** compose expected failures with map / andThen and handle them with match.
  Translate known failures at adapters; do not turn every caught unknown into a domain rejection.
  ResultAsync supplies no separate defect channel or cancellation runtime; define those explicitly.
- **Finalization:** await release on success, failure, and cancellation; preserve both operation
  and cleanup failures. Acquisition cleans up partial resources if it fails. Cleanup must not
  inherit an already-cancelled request signal; external effects need their own recovery contract.

### An owner factory and a one-shot operation

```ts
type NotRunning = { tag: "NotRunning"; id: string };

function createJobOwner(initialRunningIds: readonly string[]) {
  const running = new Set(initialRunningIds);
  return {
    complete(id: string): Result<void, NotRunning> {
      // One synchronous check-and-change; no await or external callback.
      if (!running.delete(id)) {
        return err({ tag: "NotRunning", id });
      }
      return ok(undefined);
    },
  };
}

const jobs = createJobOwner(["job-1"]);
type JobOwner = ReturnType<typeof createJobOwner>;
jobs.complete("job-1"); // Ok: removed from the running set.
jobs.complete("job-1"); // Err: the same id cannot complete twice.
```

- Construct the factory at the scope owning this job state; callers cannot access its mutable set.
- The readonly input array promises no caller-array mutation; the owned Set remains mutable.
- The id is reusable in TypeScript; the owner enforces one-shot completion at runtime.
- This publication works for the private in-memory set on one event loop. Shared storage or an
  asynchronous completion effect needs its own publication mechanism; this code does not supply it.

[zod]: https://zod.dev/api
[nt]: https://github.com/supermacro/neverthrow
[patterns]: https://github.com/gvergnaud/ts-pattern
[limit]: https://github.com/sindresorhus/p-limit
[queue]: https://github.com/sindresorhus/p-queue
[scope]: https://github.com/thefrontside/effection
[logs]: https://github.com/pinojs/pino
[compiler]: https://github.com/microsoft/TypeScript/wiki/Performance#using-type-annotations
