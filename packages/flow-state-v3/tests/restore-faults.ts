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
    name: "lane-record-keeps-mayHaveApplied",
    tests: [RESTORE],
    says: "a lane record still carries mayHaveApplied",
    rule: "Codec I7",
    edits: [
      {
        file: "src/core/record.ts",
        find: "      ...head,\n",
        replace: "      ...head,\n      mayHaveApplied: false,\n",
      },
    ],
  },
  {
    name: "owed-row-without-channel",
    tests: ["src/host/lanes.test.ts"],
    says: "an owed record's rows carry no channel",
    rule: "Codec I7",
    edits: [{ file: "src/core/record.ts", find: "      channel: r.channel,\n", replace: "" }],
  },
  {
    name: "owed-record-keyed-kept",
    tests: ["src/host/lanes.test.ts"],
    says: "an identity's owed rows are saved under kept/ instead of owed/",
    rule: "Codec I7",
    edits: [
      {
        file: "src/core/record.ts",
        find: "export const owedRecordKey = (key: string) => `owed/${key}`;",
        replace: "export const owedRecordKey = (key: string) => `kept/${key}`;",
      },
    ],
  },
  {
    name: "boot-wakes-in-flight-only",
    tests: [RESTORE],
    says: "the boot wakes only identities with a lane in flight or a saved row, not one owed a row it derived",
    rule: "Restore I1",
    edits: [
      {
        file: "src/core/incarnations.ts",
        find: ".filter((l) => l.inFlight || l.endings.length > 0)",
        replace: ".filter((l) => l.inFlight)",
      },
    ],
  },
  {
    name: "boot-wakes-in-flight-only-swept",
    tests: ["tests/rules/sweep-unattached.test.ts"],
    says: "the same fault as boot-wakes-in-flight-only, shown to the reload sweep: a reload over a Held head with a queued commit leaves its identity asleep",
    rule: "Restore I1",
    edits: [
      {
        file: "src/core/incarnations.ts",
        find: ".filter((l) => l.inFlight || l.endings.length > 0)",
        replace: ".filter((l) => l.inFlight)",
      },
    ],
  },
  {
    name: "commit-past-record-bound-admitted",
    tests: [UNENCODABLE],
    says: "a commit is checked on its input alone, so a queue past the lane record's bound withholds the identity for good",
    rule: "Codec R4",
    edits: [
      {
        file: "src/core/lanes.ts",
        find: "    if (!fits(incarnation.actor, operation.name, id, { input, owner })) {",
        replace:
          "    if (!fits(incarnation.actor, operation.name, id, { input, owner }) && id === `never`) {",
      },
    ],
  },
  {
    name: "lane-sized-in-flight",
    tests: ["tests/restore/lane-bound.test.ts"],
    says: "a commit's lane record is sized with its head in flight, so a record at the bound outgrows it when the head goes Held",
    rule: "WriteAhead I21",
    edits: [
      {
        file: "src/core/lanes.ts",
        find: "        phase: Phase.Held(),\n      },\n      queue: existing",
        replace:
          "        phase: existing?.head.phase ?? Phase.Held(),\n      },\n      queue: existing",
      },
    ],
  },
  {
    name: "lane-sized-at-its-retry-count",
    tests: ["tests/restore/lane-bound.test.ts"],
    says: "a commit's lane record is sized at its head's retry count today, so a re-send's extra digit outgrows it",
    rule: "WriteAhead I21",
    edits: [
      {
        file: "src/core/lanes.ts",
        find: "        retryCount: Number.MAX_SAFE_INTEGER,",
        replace: "        retryCount: existing?.head.retryCount ?? 0,",
      },
    ],
  },
  {
    name: "lane-id-unchecked",
    tests: [UNENCODABLE],
    says: "a commit whose lane id an owed row cannot hold is admitted, and saving its ending fails",
    rule: "Codec R4",
    edits: [
      {
        file: "src/core/lanes.ts",
        find: "      ) && Result.isSuccess(encodeOwed(actor, [row]))",
        replace: "      ) && row.reason !== ``",
      },
    ],
  },
  {
    name: "unsaved-value-saved-null",
    tests: ["tests/transfers/durability.test.ts"],
    says: "an ending whose value has no saved form keeps its channel with a null value, so its mapping refuses the turn at each start",
    rule: "Codec R4",
    edits: [
      {
        file: "src/core/record.ts",
        find: '({ ...r, channel: "unknown", reason: "Restored", value: undefined }) satisfies OwedRow;',
        replace: "({ ...r, value: undefined }) satisfies OwedRow;",
      },
    ],
  },
  {
    name: "flow-made-row-counted-unsaved",
    tests: [RESTORE],
    says: "a Flow-made unknown row with no value is counted as unsavable and reported at every owed write",
    rule: "Codec R4",
    edits: [
      {
        file: "src/core/record.ts",
        find: "  value: r.value === undefined ? null : r.value,",
        replace: "  value: r.value,",
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
        find: "    const refused = blocked.flatMap(({ t }) => t.tickets.map((ticket) => ticket.id));",
        replace: "    const refused = blocked.flatMap(() => Array.of<TicketId>());",
      },
    ],
  },
  {
    name: "displaced-lost-with-its-lane",
    tests: ["tests/write-lanes/policy-cells.test.ts"],
    says: "a lane that goes Idle drops its record while a displaced Attempt's ending is still owed",
    rule: "WriteAhead I17",
    edits: [
      {
        file: "src/core/persist.ts",
        find: ".filter((d) => d.lane === id && d.owed);",
        replace: ".filter((d) => d.lane === id && d.owed && tx.world().lanes.has(id));",
      },
    ],
  },
  {
    name: "quarantine-forgotten-at-boot",
    tests: [RESTORE],
    says: "the boot drops what it could not read, so a quarantined lane no longer holds its key",
    rule: "Restore I15",
    edits: [
      {
        file: "src/core/incarnations.ts",
        find: "      quarantined: new Map(restored.quarantined.map((q) => [q.key, q.reason])),",
        replace: "      quarantined: new Map(),",
      },
    ],
  },
  {
    name: "null-format-read-as-current",
    tests: [RESTORE],
    says: "a record whose format is null is read as the current format",
    rule: "Restore R5",
    edits: [
      {
        file: "src/core/record.ts",
        find: "const Format = Schema.Literal(FORMAT);",
        replace: "const Format = Schema.NullOr(Schema.Literal(FORMAT));",
      },
    ],
  },
  {
    name: "newer-format-read",
    tests: [RESTORE],
    says: "a record of any numeric format is read, a newer or fractional one included",
    rule: "Restore R5",
    edits: [
      {
        file: "src/core/record.ts",
        find: "const Format = Schema.Literal(FORMAT);",
        replace: "const Format = Schema.Number;",
      },
    ],
  },
  {
    name: "quarantined-lane-admits-commit",
    tests: [RESTORE],
    says: "a commit on a quarantined lane's key goes ahead",
    rule: "Restore I15",
    edits: [
      {
        file: "src/core/lanes.ts",
        find: "    if (tx.world().quarantined.has(laneRecordKey(id))) {",
        replace: "    if (tx.world().quarantined.has(`never/${id}`)) {",
      },
    ],
  },
  {
    name: "cancel-keeps-quarantine",
    tests: [RESTORE],
    says: "a cancel on a quarantined lane's key leaves its record",
    rule: "Restore R8",
    edits: [
      {
        file: "src/core/lanes.ts",
        find: "              persistence.saveLane(incarnation.actor, a.id);",
        replace: "              ledger.letGoKept(incarnation.actor, a.id);",
      },
    ],
  },
  {
    name: "fresh-start-unreported",
    tests: [RESTORE],
    says: "an ensure over an undecodable actor record starts fresh with no RecordUndecodable",
    rule: "Restore R5",
    edits: [
      {
        file: "src/core/incarnations.ts",
        find: "    if (quarantined !== undefined)\n      tx.act(",
        replace: "    if (quarantined === `never`)\n      tx.act(",
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
        replace: "  if (quarantined === `never` && compiled !== undefined)",
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
        find: "          tx.set({ ...tx.world(), persistence: false });\n",
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
        file: "src/host/runtime.ts",
        find: "    if (!opened || !driver.world().persistence || !driver.stored())",
        replace: "    if (!opened || !driver.world().persistence)",
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
        file: "src/host/runtime.ts",
        find: "    if (!opened || !driver.world().persistence || !driver.stored())",
        replace: "    if (!driver.world().persistence || !driver.stored())",
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
        file: "src/host/runtime.ts",
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
        find: "      if (!tx.world().withheld.has(actorKey(t.actor)))",
        replace: "      if (tx.world().withheld.size < 0)",
      },
    ],
  },
  {
    name: "no-items-bound",
    tests: ["src/core/codec.test.ts", UNENCODABLE],
    says: "an array of any length encodes",
    rule: "Codec I2",
    edits: [{ file: "src/core/codec.ts", find: "  items: 4096,", replace: "  items: 1_000_000," }],
  },
  {
    name: "silent-while-withheld",
    tests: [UNENCODABLE],
    says: "a ticket withheld with its identity times its silence from the send, not from its batch",
    rule: "WriteAhead R12",
    edits: [
      {
        file: "src/core/persist.ts",
        find: "    return Option.some(ticket.id);",
        replace:
          "    armTimer(Timer.Silent({ ticket: ticket.id }), tx.env.now + SILENT_MS);\n\n    return Option.some(ticket.id);",
      },
    ],
  },
  {
    name: "head-restored-not-sent",
    tests: ["tests/transfers/transfers.test.ts", RESTORE],
    says: "a Held head is restored NotSent Restored, though it may have been sent",
    rule: "Restore I6",
    edits: [
      {
        file: "src/core/ledger.ts",
        find: '          channel: "unknown",\n          reason: "Restored",',
        replace: '          channel: "notSent",\n          reason: "Restored",',
      },
    ],
  },
  {
    name: "queued-restored-unknown",
    tests: ["tests/write-lanes/policy-cells.test.ts"],
    says: "a queued commit, never sent, is restored unknown Restored",
    rule: "Restore R3",
    edits: [
      {
        file: "src/core/record.ts",
        find: '          channel: "notSent" as const,',
        replace: '          channel: "unknown" as const,',
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
];
