import type { Fault } from "./faults.ts";

const RESTORE = "tests/restore/restore.test.ts";
const UNENCODABLE = "tests/restore/unencodable.test.ts";
const HOST = "src/host/restore.test.ts";

/**
 * Wrong runtimes for restore: records in the wrong shape, a boot that wakes too few, loses a
 * displaced Attempt or reads what it should quarantine, a quarantine that lets go, an unencodable
 * record kept silent or ended on, a restore that forgets its context, a failed load that writes,
 * a forget that claims success, and endings restored out of order or as the wrong kind.
 */
export const restoreFaults: ReadonlyArray<Fault> = [
  {
    name: "input-canonical-unchecked",
    tests: ["tests/restore/unencodable.test.ts"],
    says: "a commit's input is checked by its Schema alone, so one with no canonical form withholds its identity for good",
    rule: "Codec R4",
    edits: [
      {
        file: "src/core/lanes.ts",
        find: "Result.isSuccess(operation.walk.input.text(input))",
        replace: "Result.isSuccess(operation.walk.input.encode(input))",
      },
    ],
  },
  {
    name: "ticket-withheld-with-its-identity",
    tests: [UNENCODABLE],
    says: "a ticket whose actor record cannot encode waits with its identity, so its send never ends",
    rule: "WriteAhead R13",
    edits: [
      {
        file: "src/core/persist.ts",
        find: "    const refused = awaited.filter((a) => !sent.includes(a)).map((a) => a.ticket.id);",
        replace: "    const refused = Array.of<TicketId>();",
      },
    ],
  },
  {
    name: "quarantined-actor-reads-absent",
    tests: [RESTORE],
    says: "an actor whose record could not be read shows no quarantined lifecycle",
    rule: "Restore R5",
    edits: [
      {
        file: "src/host/snapshot.ts",
        find: "  if (quarantined !== undefined && compiled !== undefined)",
        replace: "  if (quarantined !== undefined && Number.isNaN(0) && compiled !== undefined)",
      },
    ],
  },
  {
    name: "failed-load-keeps-persistence",
    tests: [RESTORE],
    says: "a Runtime whose store failed to load still writes to it",
    rule: "Restore I16",
    edits: [
      {
        file: "src/core/step.ts",
        find: "          tx.noPersistence();\n",
        replace: "",
      },
    ],
  },
  {
    name: "forget-over-pending-write",
    tests: [HOST],
    says: "a forget deletes and succeeds while the disposal's write may still land",
    rule: "Restore I18",
    edits: [
      {
        file: "src/host/close.ts",
        find: "    if (!opened || Option.isNone(store) || !driver.world().persistence || !driver.stored())",
        replace: "    if (!opened || Option.isNone(store) || !driver.world().persistence)",
      },
    ],
  },
  {
    name: "forget-before-boot",
    tests: [HOST],
    says: "a Runtime that never booted deletes the scope it never owned",
    rule: "Restore R10",
    edits: [
      {
        file: "src/host/close.ts",
        find: "    if (!opened || Option.isNone(store) || !driver.world().persistence || !driver.stored())",
        replace: "    if (Option.isNone(store) || !driver.world().persistence)",
      },
    ],
  },
  {
    name: "forget-deletes-nothing",
    tests: [HOST],
    says: "dispose({ forget: true }) succeeds with the scope's records still saved",
    rule: "Restore R10",
    edits: [
      {
        file: "src/host/close.ts",
        find: "      return yield* Effect.fail(forgetFailed);",
        replace: "      return yield* Effect.fail(forgetFailed);\n\n    if (opened) return;",
      },
    ],
  },
  {
    name: "restore-binds-default-context",
    tests: [HOST],
    says: "a restored consumer binds its app entry's providers, not the ones its record saved",
    rule: "Actors R18",
    edits: [
      {
        file: "src/core/incarnations.ts",
        find: "            (saved) => saved.size > 0,",
        replace: "            (saved) => saved.size < 0,",
      },
    ],
  },
  {
    name: "unencodable-silent",
    tests: [UNENCODABLE],
    says: "an identity whose record cannot encode is withheld with no UnencodableValue",
    rule: "WriteAhead R4",
    edits: [
      {
        file: "src/core/persist.ts",
        find: "    if (!tx.world().withheld.has(actorKey(actor)))",
        replace: "      if (tx.world().withheld.size < 0)",
      },
    ],
  },
  {
    name: "lanes-restored-newest-first",
    tests: [RESTORE],
    says: "a start hears its Held heads in reverse lane-id order",
    rule: "Restore I5",
    edits: [
      {
        file: "src/core/ledger.ts",
        find: "    const lanes = tx.lanesOf(actor).toSorted(([a], [b]) => byCodeUnits(a, b));",
        replace: "    const lanes = tx.lanesOf(actor).toSorted(([a], [b]) => byCodeUnits(b, a));",
      },
    ],
  },
  {
    name: "local-name-restored",
    tests: [RESTORE],
    says: "a record under a local actor's name restores and wakes an actor",
    rule: "Restore R5",
    edits: [
      {
        file: "src/core/identity.ts",
        find: '  if (name.startsWith(LOCAL_PREFIX)) return Result.fail("name");',
        replace: "  if (name.startsWith(LOCAL_PREFIX)) return Result.succeed({});",
      },
    ],
  },
];
