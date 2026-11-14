import { Data } from "effect";
import type { Limit } from "../limits.ts";
import { PART_ROWS, type PartRoot } from "./owed-varied.ts";

/**
 * One exact break an owed row excuses: an Attempt (every violation of the row's check and
 * Invariant on it), or, for a break with no Attempt, the subject the refusal names (a lane or an
 * actor) at the one step it broke at.
 */
export type OwedItem = Data.TaggedEnum<{
  Attempt: { id: string };
  Item: { subject: string; step: number };
}>;

export const OwedItem = Data.taggedEnum<OwedItem>();

/**
 * A break with no Attempt: its refusal's subject at its step.
 */
export const item = (subject: string, step: number) => OwedItem.Item({ subject, step });

/**
 * One owed row of a script the part player plays (Conformance R22): a {@link Limit} with the Task
 * that owns it and the exact breaks it excuses. Every item must still break, and any other break
 * fails the run.
 */
export type PartOwed = Limit & {
  readonly owner: string;
  readonly items: ReadonlyArray<OwedItem>;
};

/**
 * Whether an item is the violation found on `subject` at `step`.
 */
export const isBreak = (owed: OwedItem, subject: string, step: number) =>
  OwedItem.$match(owed, {
    Attempt: ({ id }) => id === subject,
    Item: (i) => i.subject === subject && i.step === step,
  });

/**
 * The one owed rule (Conformance R22): whether `row` excuses a violation of its script, check and
 * Invariant found on `subject` at `step`.
 */
export const excuses = (row: PartOwed, subject: string, step: number) =>
  row.items.some((i) => isBreak(i, subject, step));

/**
 * Why production re-sends past its budget across a reload: a re-send's retryCount is never
 * re-captured, so a boot restores the count from before it and a spent `retryable({ times })`
 * passes again (WriteAhead R13, WriteLanes I7).
 */
export const RETRY_COUNT =
  "a re-send's raised retryCount is not in the capture batch that precedes it, so a boot restores the count from before the re-send and a spent `retryable({ times })` passes again; the check is the raised count written in that batch (WriteAhead R13, WriteLanes I7)";

/**
 * Production's bug behind a closed head restored after a flush: a flush holds only its own
 * actor's record, not every record dirty when it is issued, so another actor's ending not yet
 * captured is lost at a reload and its head comes back `unknown Restored` (WriteAhead I23). Two
 * paths reach it: an adoption's flush, and a success's flush beside another actor's decline.
 */
export const PARTIAL_FLUSH =
  "a flush holds only its own actor's record, not every record dirty when it is issued (reached by an adoption's flush and by a success's flush), so another actor's ending not yet captured is lost at the reload and its closed head is restored unknown Restored (WriteAhead I23)";

/**
 * The routing of an adopted lane's later endings, which production and the selection model read
 * apart: an adopting start does not take its unbound lanes' heads, so an on-wire head cancelled
 * after the adoption ends late, from the root, where an adopted ending is current (Actors R20,
 * Turn I2); and a queued head's NotSent after the adoption is heard current where the model
 * routes it late (Turn I26). Taking the heads at the start moves both, and the selection model
 * with them.
 */
export const ADOPTED_ROUTING =
  "the routing of an adopted lane's later endings: an on-wire head cancelled after the adoption ends late where an adopted ending is current (Actors R20, Turn I2), and a queued head's NotSent after it is heard current where the model routes it late (Turn I26)";

const owners: Readonly<Record<PartRoot, { readonly why: string; readonly owner: string }>> = {
  retry: { why: RETRY_COUNT, owner: "@task.V3.T19" },
  flush: { why: PARTIAL_FLUSH, owner: "@task.V3.T54" },
  adopted: { why: ADOPTED_ROUTING, owner: "@task.V3.T54" },
};

const rows: ReadonlyArray<PartOwed> = PART_ROWS.map(({ id, check, invariant, root, items }) => ({
  case: id,
  check,
  invariant,
  ...owners[root],
  items: items.map((i) =>
    i._tag === "Attempt" ? OwedItem.Attempt({ id: i.id }) : item(i.subject, i.step),
  ),
}));

/**
 * Production's owed reds among the generated part scripts (Conformance R22): each row names one
 * check and Invariant a script fails by, on the subjects its bug reached, so a fix shows; every
 * other script passes.
 */
export const partsOwed: ReadonlyArray<PartOwed> = rows.filter((r) => !r.case.endsWith("-shrunk"));

/**
 * Production's owed reds among the kept regression scripts (Conformance I49), each a script it
 * fails by a bug a Task owns.
 */
export const regressionsOwed: ReadonlyArray<PartOwed> = rows.filter((r) =>
  r.case.endsWith("-shrunk"),
);

/**
 * Every owed row of a script the part player plays: the generated part scripts' and the kept
 * regressions'. One rule ({@link excuses}) judges them all, by exact break, at every seed.
 */
export const owedRows: ReadonlyArray<PartOwed> = rows;

/**
 * A script kept though most of its answers find no open request: a gap in the generator, owed by
 * the Task that will close it, never hidden by a new seed.
 */
export type ThinPin = { readonly case: string; readonly why: string; readonly owner: string };

const COARSE_BATCHING =
  "generator models write batching too coarsely (a commit behind an in-flight write opens one ack late)";

/**
 * The thin scripts pinned as owed, each checked to stay thin until its owner closes the gap.
 */
export const thinPinned: ReadonlyArray<ThinPin> = [
  { case: "PART-cells-stress-101", why: RETRY_COUNT, owner: "@task.V3.T19" },
  { case: "PART-cells-varied-112", why: COARSE_BATCHING, owner: "@task.V3.T15" },
];
