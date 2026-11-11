import type { Mutant, Probe } from "../dsl/oracle.ts";

const DECLINE = "  noteEnding(tx, { op: a.op, actor: a.actor }, e);\n  enqueue(tx, {";

/**
 * The old suite's wrong runtimes whose text anchors no longer match round-14, re-anchored and
 * held by `delivered-once` (WriteLanes I15).
 *
 * **Details**
 *
 * Both drop a declined send's ending before it is delivered: the old suite's
 * `pay16.decline-not-delivered` and `lost.decline.mail` edited the decline in `lane.ts`, whose
 * `noteEnding` call now carries the actor.
 */
export const carriedDeliveredOnceMutants: ReadonlyArray<Mutant> = [
  {
    name: "pay16.decline-not-delivered",
    says: "a declined send's ending is noted but never queued for delivery",
    expects: "WriteLanes I15",
    runtime: "prototype",
    cases: ["PAY-02", "LANE-02"],
    edits: [
      {
        file: "lane.ts",
        find: DECLINE,
        replace: "  noteEnding(tx, { op: a.op, actor: a.actor }, e);\n  void (tx, {",
      },
    ],
  },
  {
    name: "lost.decline.mail",
    says: "a declined send's ending is lost before delivery (the same fault as pay16's, by its own edit)",
    expects: "WriteLanes I15",
    runtime: "prototype",
    cases: ["PAY-02", "LANE-02"],
    edits: [
      {
        file: "lane.ts",
        find: DECLINE,
        replace: "  noteEnding(tx, { op: a.op, actor: a.actor }, e);\n  void ({",
      },
    ],
  },
];

/**
 * Two wrong runtimes the step 9 review found (its H2), both losing a restorable record at a boot.
 *
 * **Details**
 *
 * They were `disposal` mutants (Actors I29) while a boot owed each held head's restore by its own
 * step's end. Restore R1 stands (the user, 2026-11-11): a Held lane's identity stays a record until
 * something reaches it, so a restore parked at the boot is on time, and Actors I29 no longer
 * catches them. What they break, a record that does not round-trip (WriteAhead I4), has no oracle
 * yet; they stay as pending probes, red by case expectations, until one exists.
 */
export const carriedRecordProbes: ReadonlyArray<Probe> = [
  {
    name: "k.drop-row",
    says: "a boot deletes every actor with a restored ending in its mail, so the ending parks with no incarnation (step 9 review H2)",
    holds: "pending",
    runtime: "prototype",
    cases: ["PAY-05", "PAY-08/reloadDuringCharge"],
    edits: [
      {
        file: "durable.ts",
        find: 'import { getActor, setActor, noActors, type Actors } from "./actors.ts";',
        replace:
          'import { getActor, setActor, noActors, deleteActor, type Actors } from "./actors.ts";',
      },
      {
        file: "durable.ts",
        find: "tx.w = { ...tx.w, nextMint: maxMint + 1 };",
        replace:
          'tx.w = { ...tx.w, nextMint: maxMint + 1 }; for (const m of [...(tx.w.mail as any)] as any[]) if (m.k === "ending" && m.restored && getActor(tx.w.actors, m.actor)) tx.w = { ...tx.w, actors: deleteActor(tx.w.actors, m.actor) };',
      },
    ],
  },
  {
    name: "q1a.unchanged-resets",
    says: "a boot resets every restored actor as if its definition's shape changed (step 9 review H2)",
    holds: "pending",
    runtime: "prototype",
    cases: ["PAY-05", "PAY-08/reloadDuringCharge"],
    edits: [
      {
        file: "durable.ts",
        find: "  if (!now || !isShape(was) || (sameList(was.states, now.states) && sameList(was.fields, now.fields))) return false;",
        replace: "  if (!now || !isShape(was)) return false;\n  return true;",
      },
    ],
  },
];

/**
 * Runtime reports the lifecycle reads, each lied about so a named check must kill it (policy:
 * a mutant for each report the checks read).
 *
 * **Details**
 *
 * - `lie.failures-unmapped`: every failure ending is called unmapped and dropped, though the
 *   fixture maps it; its `UnmappedEnding` excuses nothing (WriteLanes I15).
 * - `lie.no-incarnated`: no incarnation is reported, so no parked or kept ending would be owed if
 *   the lifecycle took liveness from the report (WriteLanes I15, `delivered-once`).
 */
export const reportLieMutants: ReadonlyArray<Mutant> = [
  {
    name: "lie.failures-unmapped",
    says: "a delivered failure ending is reported UnmappedEnding and dropped, though its machine maps it",
    expects: "WriteLanes I15",
    runtime: "prototype",
    cases: ["PAY-02"],
    edits: [
      {
        file: "turn.ts",
        find: "  const mapped = mappedFor(m, item);",
        replace: '  const mapped = item.ending.ch === "failure" ? undefined : mappedFor(m, item);',
      },
    ],
  },
  {
    name: "lie.no-incarnated",
    says: "the runtime never reports an incarnation beginning",
    expects: "WriteLanes I15",
    runtime: "prototype",
    cases: ["DLV-04"],
    edits: [
      {
        file: "world.ts",
        find: "  void tx.evidence.push({ kind, ...fields });",
        replace: '  void (kind === "incarnation" || tx.evidence.push({ kind, ...fields }));',
      },
    ],
  },
];
