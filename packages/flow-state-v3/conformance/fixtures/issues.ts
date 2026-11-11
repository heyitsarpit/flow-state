import { Schema } from "effect";
import { Empty, type Fixture, writeOf } from "./fixture.ts";
import { guarded, to, updating } from "./handlers.ts";
import { classifyWith, row } from "./reference.ts";

const ById = Schema.Struct({ id: Schema.String });

const stay = to("stay");

const latestWrite = writeOf(ById, {
  concurrency: "latest",
  releasesOnLeave: [],
  success: "Settled",
  failure: { Gone: "IssueGone", Refused: "Failed", NotSent: "Failed" },
  unknown: { event: "RenameUnsure" },
  classify: classifyWith(() => false),
});

/**
 * `Issues/List` (`issuesFixture` in `prototypes/conformance/typed/issues.ts`): entity writes over
 * `Issue|<id>`. `rename` (`latest`, keyed by `id`) predicts the title and slug and confirms the
 * answer's title (WriteLanes R1, R13); `like` and `remove` are declared for their rows only.
 */
export const Issues = {
  name: "issues",
  machine: "Issues/List",
  events: {
    Load: Empty,
    Toggle: Schema.Struct({ id: Schema.String, liked: Schema.Boolean }),
    Edit: Schema.Struct({ id: Schema.String, title: Schema.String }),
    Delete: ById,
    ReconcileLike: ById,
    CancelLike: ById,
    CancelRename: ById,
  },
  memory: Schema.Struct({ toast: Schema.NullOr(Schema.String) }),
  input: Empty,
  states: ["READY"] as const,
  operations: {
    rename: latestWrite,
    like: {
      ...latestWrite,
      reference: { ...latestWrite.reference, unknown: { event: "LikeUnsure" } },
    },
  },
  rows: [
    row("Edit", "any", "same", [{ operation: "rename", kind: "commit" }]),
    row("Toggle", "any", "same", [{ operation: "like", kind: "commit" }]),
    row("CancelRename", "any", "same", [{ operation: "rename", kind: "cancel", keyed: true }]),
  ],
  handlers: {
    initial: "READY",
    root: {
      Load: [stay],
      Listed: [stay],
      ListFailed: [stay],
      Toggle: [stay],
      Edit: [guarded(stay)],
      Delete: [guarded(stay)],
      ReconcileLike: [stay],
      CancelLike: [stay],
      CancelRename: [stay],
      Settled: [stay],
      IssueGone: [stay],
      Failed: [updating(stay)],
      LikeUnsure: [guarded(stay), updating(stay)],
      RenameUnsure: [updating(stay)],
      RemoveUnsure: [updating(stay)],
    },
    states: {},
    schedules: {},
    parts: {},
  },
} satisfies Fixture;
