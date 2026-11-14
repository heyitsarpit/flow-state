import type { Mutant } from "./dsl/oracle.ts";

/**
 * A wrong runtime a host test must catch: source edits of `src/`, the test file and the test's
 * name, and the assertion message its failure must carry (T54 A0 review N3).
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
    name: "disposal.drops-unsent-ending",
    says: "a never-sent head's NotSent { Disposed } at Runtime disposal is dropped, not owed",
    test: "src/host/ledger.test.ts",
    named: "a never-sent head at Runtime disposal",
    red: "the NotSent is heard once after the reload",
    edits: [
      {
        file: "src/core/lane-moves.ts",
        find: "endingMail(at.actor, ending);\n    else\n      park(",
        replace: "endingMail(at.actor, ending);\n    else if (at.id.length < 0)\n      park(",
      },
    ],
  },
  {
    name: "ledger.start-skips-kept",
    says: "a start mails no Kept ending, so a Kept row gets no try",
    test: "src/host/ledger.test.ts",
    named: "a Kept row gets one try per start",
    red: "one try at the first adoption",
    edits: [
      {
        file: "src/core/incarnations.ts",
        find: "    for (const p of kept) {\n      for (const ending of p.endings)",
        replace:
          "    for (const p of kept) {\n      for (const ending of p.endings.filter(() => false))",
      },
    ],
  },
];
