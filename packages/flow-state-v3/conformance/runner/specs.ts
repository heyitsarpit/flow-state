import { Data, Effect, Schema } from "effect";
import { CORE_SPECS, type CoreSpec, type TaskRef } from "../coverage.ts";
import { runChild } from "./child.ts";

/**
 * The workflow CLI could not show a core Spec, or showed it in a shape the gate cannot read.
 */
export class SpecUnreadable extends Data.TaggedError("SpecUnreadable")<{
  readonly spec: string;
  readonly why: string;
}> {}

const Shown = Schema.Struct({
  spec: Schema.Struct({
    invariants: Schema.Array(Schema.Struct({ id: Schema.TemplateLiteral(["I", Schema.Number]) })),
  }),
});

const decodeShown = Schema.decodeUnknownEffect(Schema.fromJsonString(Shown));

const invariantsIn = (root: string, spec: CoreSpec) =>
  runChild("workflow", ["show", `@spec.${spec}`, "--json", "--root", root], 30).pipe(
    Effect.mapError((e) => new SpecUnreadable({ spec, why: e.why })),
    Effect.flatMap((out) =>
      out.code === 0
        ? Effect.mapError(
            decodeShown(out.stdout),
            (e) => new SpecUnreadable({ spec, why: String(e) }),
          )
        : Effect.fail(new SpecUnreadable({ spec, why: out.stderr })),
    ),
    Effect.flatMap((shown) =>
      shown.spec.invariants.length === 0
        ? Effect.fail(new SpecUnreadable({ spec, why: "it lists no Invariants" }))
        : Effect.succeed(shown.spec.invariants.map((i) => `${spec} ${i.id}` as const)),
    ),
  );

/**
 * Every Invariant of the core Specs, read with `workflow show @spec.<name> --json` from the
 * repository at `root`.
 */
export const coreInvariants = (root: string) =>
  Effect.map(
    Effect.forEach(CORE_SPECS, (spec) => invariantsIn(root, spec), { concurrency: 4 }),
    (lists) => lists.flat(),
  );

const ShownTask = Schema.Struct({ task: Schema.Struct({ status: Schema.String }) });

const decodeTask = Schema.decodeUnknownEffect(Schema.fromJsonString(ShownTask));

const isOpen = (root: string, owner: TaskRef) =>
  runChild("workflow", ["show", owner, "--json", "--root", root], 30).pipe(
    Effect.flatMap((out) =>
      out.code === 0 ? decodeTask(out.stdout) : Effect.fail(new Error(out.stderr)),
    ),
    Effect.map((shown) => shown.task.status !== "done"),
    Effect.orElseSucceed(() => false),
  );

/**
 * The owners, of those given, that the workflow CLI resolves to a Task whose status is not done.
 *
 * **Details**
 *
 * An owner that does not resolve, or whose record cannot be read, is left out, so the coverage
 * gate reports every row it owns.
 */
export const openTasks = (root: string, owners: ReadonlyArray<TaskRef>) =>
  Effect.map(
    Effect.forEach(
      [...new Set(owners)],
      (owner) => Effect.map(isOpen(root, owner), (open) => [owner, open] as const),
      { concurrency: 4 },
    ),
    (judged) => new Set(judged.flatMap(([owner, open]) => (open ? [owner] : []))),
  );
