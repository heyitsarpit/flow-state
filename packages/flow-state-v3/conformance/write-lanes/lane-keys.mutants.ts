import type { Mutant } from "../dsl/oracle.ts";

/**
 * Wrong runtimes the keyed-lane cases' own expectations must catch.
 */
export const laneKeysMutants: ReadonlyArray<Mutant> = [
  {
    name: "lane.keyless-names-latest-lane",
    says: "a key-less member in an ending names the operation's latest lane, not the ending's own Attempt",
    expects: "WriteLanes I14",
    runtime: "prototype",
    cases: ["LANE-13"],
    edits: [
      {
        file: "turn.ts",
        find: "        ? laneOfAttempt(tx.w, it.attempt) // D22: key-less names the ending's own Attempt only",
        replace:
          "        ? Object.values(tx.w.lanes).filter((l) => l.actor === w.a.key && l.op === mem.op).at(-1)",
      },
    ],
  },
  {
    name: "lane.unencodable-refuses-turn",
    says: "a commit whose input cannot encode refuses its turn instead of declining",
    expects: "WriteLanes I18",
    runtime: "prototype",
    cases: ["LANE-14"],
    edits: [
      {
        file: "turn.ts",
        find: '        decline(tx, { ...base, key: r.key, input: r.input, subject: op.fragment ? inc.subject : [] }, "Unencodable"); // D114',
        replace:
          '        throw new Refused(`${w.a.machine} ${mem.op}`, "a commit that cannot encode");',
      },
    ],
  },
  {
    name: "lane.old-version-sends",
    says: "a commit beside an old-version hold is sent instead of declining OldVersion",
    expects: "WriteLanes I17",
    runtime: "prototype",
    cases: ["LANE-15"],
    edits: [
      {
        file: "lane.ts",
        find: '      return decline(tx, a, "OldVersion");',
        replace: '      note(tx, "BesideOldVersionIgnored", {});',
      },
    ],
  },
];
