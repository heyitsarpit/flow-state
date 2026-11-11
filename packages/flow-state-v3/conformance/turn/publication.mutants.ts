import type { Mutant } from "../dsl/oracle.ts";

const NO_FREEZE = [
  { file: "adapter.ts", find: "        logged.guard(r.input);\n", replace: "" },
  {
    file: "adapter.ts",
    find: '        if (r.out !== "fatal") logged.guard(r.out);\n',
    replace: "",
  },
  { file: "adapter.ts", find: "        logged.guard(w);\n", replace: "" },
];

/**
 * Wrong runtimes the `publication` oracle must catch.
 *
 * **Details**
 *
 * `w.patch-in-place` is the old suite's lie (a turn's memory patch written into the memory object
 * a published snapshot holds); since round-14's host freezes what it logs, the lie also drops
 * that freeze, as a runtime that never froze its snapshots would (Turn R24).
 */
export const publicationMutants: ReadonlyArray<Mutant> = [
  {
    name: "w.patch-in-place",
    says: "a turn's memory patch is written into the published memory object instead of a copy",
    expects: "Turn I29",
    runtime: "prototype",
    cases: ["PAY-01"],
    edits: [
      ...NO_FREEZE,
      {
        file: "turn.ts",
        find: "    w.root = withKid(w.root, path, (i) => ({ ...i, memory: { ...i.memory, ...patch } }));",
        replace: "    Object.assign(kidAt(w.root, path)!.memory as object, patch);",
      },
    ],
  },
  {
    name: "pub.move-copies-memory",
    says: "a turn that only moves state copies the memory object, so an unchanged part loses its identity",
    expects: "Turn I30",
    runtime: "prototype",
    cases: ["PAY-04"],
    edits: [
      {
        file: "turn.ts",
        find: "  w.root = withKid(w.root, mv.path, (i) => ({ ...i, leaf: dest, activations, history }));",
        replace:
          "  w.root = withKid(w.root, mv.path, (i) => ({ ...i, leaf: dest, activations, history, memory: { ...i.memory } }));",
      },
    ],
  },
];
