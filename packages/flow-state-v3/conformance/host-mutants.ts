import type { Mutant } from "./dsl/oracle.ts";

/**
 * A wrong runtime a host test must catch: source edits of `src/`, the test file and the test's
 * name, and the assertion message its failure must carry.
 */
export type HostMutant = {
  readonly name: string;
  readonly says: string;
  readonly test: string;
  readonly named: string;
  readonly red: string;
  readonly edits: Mutant["edits"];
};

/**
 * The host tests' mutants, played by the runner's `host-mutants` mode: each on its own copy of the
 * package, killed only when its named test fails with its `red` message. A mutant whose edit no
 * longer applies fails the mode, so the step that rewrites its code rewrites the mutant.
 */
export const hostMutants: ReadonlyArray<HostMutant> = [
  {
    name: "ledger.suspend-waits-queued-only",
    says: "a suspend leaves a Retrying row in the mailbox of an incarnation that is gone",
    test: "src/core/ledger.test.ts",
    named: "suspend: Queued and Retrying rows wait",
    red: "the laneless and the Retrying row wait, the Kept row stays",
    edits: [
      {
        file: "src/core/ledger.ts",
        find: '    else if (Delivery.$is("Queued")(row.delivery) || Delivery.$is("Retrying")(row.delivery))',
        replace: '    else if (Delivery.$is("Queued")(row.delivery))',
      },
    ],
  },
  {
    name: "ledger.refusal-keeps-a-waiting-row",
    says: "a refusal writes Kept over a row its own turn sent to wait",
    test: "src/core/ledger.test.ts",
    named: "tryOne: a refusal leaves a row its turn suspended Waiting",
    red: "the suspended row stays Waiting",
    edits: [
      {
        file: "src/core/ledger.ts",
        find: '        else if (Delivery.$is("Retrying")(now.value.delivery)) {',
        replace: "        else {",
      },
    ],
  },
  {
    name: "lanes.sent-before-ignores-held",
    says: "a Held head counts as never sent",
    test: "src/core/cells.test.ts",
    named: "sentBefore.Held-retryCount-0",
    red: "a Held head with retryCount 0 was sent before: true",
    edits: [
      {
        file: "src/core/world.ts",
        find: '  Phase.$is("Held")(head.phase) ||\n',
        replace: "",
      },
    ],
  },
  {
    name: "ledger.keep-replaces",
    says: "a row kept on its lane replaces the identity's other rows",
    test: "src/core/ledger.test.ts",
    named: "two rows refused twice on one lane",
    red: "two Kept rows on one lane",
    edits: [
      {
        file: "src/core/ledger.ts",
        find: "          replace(now.value, Option.some({ ...now.value, delivery: Delivery.Kept() }));",
        replace: "          setRows(row.actor, [{ ...now.value, delivery: Delivery.Kept() }]);",
      },
    ],
  },
  {
    name: "ledger.suspend-skips-laneless",
    says: "a suspend leaves a queued row with no lane queued",
    test: "src/core/ledger.test.ts",
    named: "suspend: Queued and Retrying rows wait",
    red: "the laneless and the Retrying row wait, the Kept row stays",
    edits: [
      {
        file: "src/core/ledger.ts",
        find: '    else if (Delivery.$is("Queued")(row.delivery) || Delivery.$is("Retrying")(row.delivery))',
        replace:
          '    else if ((Delivery.$is("Queued")(row.delivery) || Delivery.$is("Retrying")(row.delivery)) && Option.isSome(row.lane))',
      },
    ],
  },
  {
    name: "ledger.start-skips-kept",
    says: "a start gives a Kept row no try",
    test: "src/core/ledger.test.ts",
    named: "start: Waiting rows queue",
    red: "the Kept row takes its one try",
    edits: [
      {
        file: "src/core/ledger.ts",
        find: '      if (Delivery.$is("Kept")(row.delivery)) {',
        replace: '      if (Delivery.$is("Kept")(row.delivery) && row.reason === "") {',
      },
    ],
  },
  {
    name: "ledger.close-no-report",
    says: "a row closed as evidence reports nothing",
    test: "src/core/ledger.test.ts",
    named: "tryOne: heard closes Delivered",
    red: "closing an unmapped row records evidence",
    edits: [
      {
        file: "src/core/ledger.ts",
        find: "Recorded: ({ why }) => recorded(row, why)",
        replace: "Recorded: () => undefined",
      },
    ],
  },
  {
    name: "ledger.stale-reference-delivers",
    says: "a mail reference to a row not in the mailbox is tried",
    test: "src/core/ledger.test.ts",
    named: "tryOne: refused once is Retrying",
    red: "its reference does nothing",
    edits: [
      {
        file: "src/core/ledger.ts",
        find: '        if (!Delivery.$is("Queued")(row.delivery) && !Delivery.$is("Retrying")(row.delivery))',
        replace: '        if (row.id === "")',
      },
    ],
  },
  {
    name: "mint.shared-counter",
    says: "Attempt ids come from the world's shared counter, so other ids renumber them",
    test: "src/host/ledger.test.ts",
    named: "Attempt ids keep their numbers",
    red: "the Attempt ids are equal",
    edits: [
      {
        file: "src/core/lane-moves.ts",
        find: "id: tx.mintAttempt(),",
        replace: 'id: tx.mint("att"),',
      },
    ],
  },
  {
    name: "seed.thirty-two-bits",
    says: "the boot seed is one Uint32",
    test: "src/host/platform/browser.test.ts",
    named: "each boot's seed",
    red: "a seed of 32 bits",
    edits: [
      {
        file: "src/host/platform/browser.ts",
        find: "new Uint32Array(4)",
        replace: "new Uint32Array(1)",
      },
    ],
  },
  {
    name: "disposal.drops-unsent-ending",
    says: "a never-sent head's NotSent { Disposed } at Runtime disposal is dropped, not owed",
    test: "src/host/ledger.test.ts",
    named: "a never-sent head at Runtime disposal",
    red: "the NotSent is heard once after the reload",
    edits: [
      {
        file: "src/core/lane-moves.ts",
        find: "        notSent(at, why, lane.head.id, lane.head.owner);",
        replace: "        if (open()) notSent(at, why, lane.head.id, lane.head.owner);",
      },
    ],
  },
  {
    name: "ledger.start-skips-kept-on-adoption",
    says: "a start gives a Kept row no try, so an adoption hears nothing",
    test: "src/host/ledger.test.ts",
    named: "a Kept row gets one try per start",
    red: "one try at the first adoption",
    edits: [
      {
        file: "src/core/ledger.ts",
        find: '      if (Delivery.$is("Kept")(row.delivery)) {',
        replace: '      if (Delivery.$is("Kept")(row.delivery) && row.reason === "") {',
      },
    ],
  },
];
