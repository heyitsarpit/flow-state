import type { Fault } from "./faults.ts";

const SAVED = "tests/restore/saved-records.test.ts";

/**
 * Wrong runtimes for saved records' install: a boot that starts every restored identity, owed or
 * not, so an install fires turns.
 */
export const recordFaults: ReadonlyArray<Fault> = [
  {
    name: "install-fires-event",
    tests: [SAVED],
    says: "the boot starts every restored identity, not only those owed an ending",
    rule: "Records R17, I14",
    edits: [
      {
        file: "src/core/incarnations.ts",
        find: '    for (const actor of owing.values()) ensure(actor, Option.none(), "wake", Option.none());',
        replace:
          '    for (const actor of [...owing.values(), ...restored.records.map((r) => r.actor)])\n      ensure(actor, Option.none(), "wake", Option.none());',
      },
    ],
  },
];
