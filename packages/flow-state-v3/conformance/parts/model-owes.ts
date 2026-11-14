import { Option } from "effect";
import type { Owes, TaskRef } from "../coverage.ts";
import { rules } from "../dsl/lifecycle-rules.ts";
import { FORGED_ROWS, refusalCells } from "./adversary.ts";

const UNFORGEABLE = new Set(
  refusalCells(rules)
    .filter((c) => !FORGED_ROWS.has(`${c.table}.${c.row}`))
    .map((c) => `${c.table}.${c.row}.${c.column}.${c.guard}`),
);

// RETURN_TYPE: an Option of a TaskRef, so a misspelled owner fails to compile.
const suiteOwner = (field: string): Option.Option<TaskRef> => {
  const [, , column = "", guard = ""] = field.split(".");

  if (column === "CancelAll" || guard.startsWith("cancelAll")) return Option.some("@task.V3.T53");

  return UNFORGEABLE.has(field) ? Option.some("@task.V3.T61") : Option.none();
};

// RETURN_TYPE: a TaskRef, so a misspelled owner fails to compile.
const sliceOwner = (field: string): TaskRef => {
  const [table, row = "", column = "", guard = ""] = field.split(".");
  const disposal = /dispos/iu.test(`${row} ${guard}`) || row === "RuntimeDisposed";

  if (table === "deadlines") return row === "AwaitRestore" ? "@task.V3.T20" : "@task.V3.T18";

  if (table === "promotion" || table === "tableB") return "@task.V3.T18";

  if (disposal) return "@task.V3.T55";

  if (guard === "storageRefused") return "@task.V3.T19";

  if (["Reload", "BootSettles", "Opens"].includes(row) || column === "Restoring")
    return "@task.V3.T20";

  return table === "tableC" ? "@task.V3.T54" : "@task.V3.T18";
};

/**
 * The open Task a model field's gap is owed to, by its group: a retired `cancelAll` cell to
 * @task.V3.T53, which retires round-14; a refusal cell no forged report can make (outside
 * `FORGED_ROWS`) to @task.V3.T61, since only a suite that drops a report or forges a send reaches
 * it; then lane policies, the promotion rule and the lane deadlines to @task.V3.T18; storage
 * refusals to @task.V3.T19; restore, boot and the restore deadlines to @task.V3.T20; the ledger's
 * lives to @task.V3.T54; the Runtime's disposal to @task.V3.T55.
 */
export const ownerOf = (field: string) =>
  Option.getOrElse(suiteOwner(field), () => sliceOwner(field));

const UNNOTICED = {
  "deadlines.Await": "Released Superseded NotSentCancelled",
  "deadlines.AwaitLetGo": "",
  "deadlines.AwaitRestore": "plain runtimeDisposal disposeActor forget",
  "deadlines.Commit": "",
  "deadlines.PendingCancel": "",
  "deadlines.UnretainedRelease": "",
  promotion: "",
  "tableA.BootSettles":
    "Queued.always Unsent.always OnWire.always Interrupted.always Restoring.always",
  "tableA.DisposalStarts": "Queued.always Resending.always Interrupted.always Restoring.always",
  "tableA.EndDefinite":
    "Queued.always Unsent.always Resending.always OnWire.disposing Interrupted.running Interrupted.disposing Restoring.always Gone.evidenceFirst",
  "tableA.EndNotSent":
    "Queued.cancelAll Queued.cancelAllOutOfOrder Queued.disposed Queued.other Unsent.pendingCancel Unsent.storageRefused Resending.always Interrupted.always Restoring.restored Restoring.pendingCancel Restoring.other Gone.evidenceFirst Gone.pendingCancel",
  "tableA.EndUnknown":
    "Queued.always Unsent.always Resending.storageRefused Resending.other OnWire.released OnWire.disposed OnWire.disposedRunning Interrupted.disposed Interrupted.other Held.unowedRestore Restoring.headRestored Restoring.other Gone.evidenceFirst Gone.pendingCancel Gone.restoredAfterDisposal",
  "tableA.Released":
    "Queued.always Resending.awaited Resending.none Interrupted.always Held.awaited Restoring.always",
  "tableA.Reload":
    "Queued.always Unsent.always Resending.always OnWire.always Interrupted.always Restoring.always",
  "tableA.RuntimeDisposed":
    "Queued.always Resending.always OnWire.always Interrupted.always Restoring.always",
  "tableA.Send":
    "Queued.always Unsent.cancelPending Resending.cancelPending OnWire.always Interrupted.always Held.always Restoring.always Gone.always",
  "tableA.StepEnds": "Queued.always Interrupted.unstoppable Restoring.always",
  "tableA.Superseded":
    "Queued.awaited Queued.none Unsent.awaited Resending.always Interrupted.always Restoring.always",
  "tableB.Held": "latest.always serialize.always cancel.always Release.always CancelAll.always",
  "tableB.Idle":
    "reject.kept latest.always serialize.always cancel.always Retry.always Cancel.none Cancel.kept CancelAll.always Release.always",
  "tableB.Interrupted":
    "reject.always latest.always serialize.always cancel.always Retry.always Release.always Cancel.always CancelAll.always",
  "tableB.OnWire":
    "latest.always serialize.always cancel.always Retry.always Release.always Cancel.always CancelAll.always",
  "tableB.Resending":
    "reject.always latest.always serialize.always cancel.always Retry.always Release.always Cancel.always CancelAll.always",
  "tableB.Restoring":
    "reject.always latest.always serialize.always cancel.free cancel.pendingCancel Retry.always Release.always Cancel.always CancelAll.always",
  "tableB.Unsent":
    "latest.free latest.pendingCancel serialize.always cancel.free cancel.pendingCancel Retry.always Release.always Cancel.always CancelAll.always",
  "tableC.Delivered":
    "Owed.disposing Parked.running Parked.disposing ParkedOpen.running ParkedOpen.disposing Refused.running Refused.disposing Kept.running Kept.disposing KeptOpen.running KeptOpen.disposing Evidence.always Maybe.running Maybe.disposing",
  "tableC.DisposalStarts":
    "Owed.always Parked.always ParkedOpen.always Delivering.always Refused.always Kept.always KeptOpen.always Evidence.always Maybe.always",
  "tableC.InvalidTurn":
    "ParkedOpen.always Delivering.first Delivering.retry Delivering.retryNeverSent Refused.always Kept.always KeptOpen.always Evidence.always Maybe.always",
  "tableC.Opens":
    "Owed.always Parked.always ParkedOpen.always Delivering.always Refused.always Kept.always KeptOpen.always Evidence.always Maybe.always",
  "tableC.Parked":
    "Parked.always ParkedOpen.always Delivering.always Refused.always Kept.always KeptOpen.always Evidence.always Maybe.always",
  "tableC.RecordedLetGo":
    "Owed.letGo Parked.letGo Parked.none ParkedOpen.letGo ParkedOpen.none Delivering.always Refused.always Kept.letGo Kept.none KeptOpen.letGo KeptOpen.none Evidence.always Maybe.letGo Maybe.none",
  "tableC.RecordedOther":
    "Owed.forgotten Parked.forgotten Parked.none ParkedOpen.forgotten ParkedOpen.none Delivering.always Refused.always Kept.always KeptOpen.always Evidence.always Maybe.forgotten Maybe.none",
  "tableC.Reload":
    "Owed.inDisposal Owed.live ParkedOpen.always Delivering.always Refused.always Kept.always KeptOpen.always Evidence.always Maybe.always",
  "tableC.StepEnds":
    "Owed.inDisposal Parked.held ParkedOpen.always Delivering.always Refused.always Kept.always KeptOpen.always Evidence.always Maybe.always",
  "tableC.Unmapped":
    "Owed.always Parked.always ParkedOpen.always Delivering.always Refused.always Kept.always KeptOpen.always Evidence.always Maybe.always",
  "tableC.Unparked":
    "Parked.always ParkedOpen.always Delivering.always Refused.always Kept.always KeptOpen.always Evidence.always Maybe.always",
} satisfies Readonly<Record<string, string>>;

/**
 * The model fields no part's run and no forged report notices yet (Conformance I61, T39), each
 * owed by its group ({@link ownerOf}) to the open Task whose scope adds the part or production
 * feature that reaches its cell.
 *
 * **Gotchas**
 *
 * - Recorded from a production run of the pilots and the adversary: a change detector, never an
 *   expected result. A field that becomes noticed fails the field gate until its row is dropped.
 */
export const modelOwed: ReadonlyArray<Owes> = Object.entries(UNNOTICED).flatMap(([head, rest]) =>
  (rest === "" ? [head] : rest.split(" ").map((tail) => `${head}.${tail}`)).map((subject) => ({
    subject,
    clause: Option.none<string>(),
    task: ownerOf(subject),
    why: "no part's run and no forged report reaches this field yet",
  })),
);
