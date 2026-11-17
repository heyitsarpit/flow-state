import { Effect, Option, Predicate } from "effect";
import assert from "node:assert/strict";
import { describe, expect, it } from "vite-plus/test";
import { mainNests, nestView, workspaceGrownSetup } from "../../fixtures/session/app.ts";
import { type Folder, foldersOf, Nests } from "../../fixtures/session/machines/nests.ts";
import {
  DEEP,
  deepAndWideNests,
  foldersPastStack,
  importAt,
  importPastStack,
  listsPastStack,
  mapsPastStack,
  nestAt,
  PAST_STACK,
  treePastStack,
} from "../../fixtures/session/stories/values.ts";
import type { StoryRun } from "../../src/host/testing/index.ts";
import { render } from "../../src/host/trace.ts";
import { FlowError } from "../../src/index.ts";
import { checked } from "../rules/rules.ts";

// A run of a hundred thousand levels takes seconds: each step walks the nest a few times.
const DEEP_TIMEOUT = 120_000;

const NESTS = "actor/Workspace/Nests/main";
const VIEW = "actor/Workspace/NestView/view";

const unencodable = (run: StoryRun) =>
  run.evidence.flatMap((e) =>
    e._tag === "Reported" && e.code === "UnencodableValue"
      ? [Option.getOrElse(e.record, () => "-")]
      : [],
  );

// FLOW_STATE_ALLOW_UNKNOWN: a node of a restored nest.
// RETURN_TYPE: every branch is a list of nodes, an array's own items among them.
const childrenOf = (node: unknown): ReadonlyArray<unknown> => {
  if (Array.isArray(node)) return node;

  if (node instanceof Map) return [...node.values()];

  return Predicate.isObject(node) ? Object.values(node) : [];
};

// FLOW_STATE_ALLOW_UNKNOWN: a restored nest, measured without the call stack: its deepest node.
const depthOf = (root: unknown) => {
  let deepest = 0;
  // FLOW_STATE_ALLOW_UNKNOWN: a node of the nest being measured.
  const stack: Array<readonly [unknown, number]> = [[root, 0]];

  for (let at = stack.pop(); at !== undefined; at = stack.pop()) {
    deepest = Math.max(deepest, at[1]);

    for (const child of childrenOf(at[0])) stack.push([child, at[1] + 1]);
  }

  return deepest;
};

// The view's counter each nest kind is heard on, and the nest's memory field.
const kinds = [
  ["Lists", "lists", "lists"],
  ["Folders", "folders", "folders"],
  ["Maps", "maps", "index"],
  ["Tree", "trees", "tree"],
] as const;

const swept = {
  Lists: listsPastStack,
  Folders: foldersPastStack,
  Maps: mapsPastStack,
  Tree: treePastStack,
};

const loose = (value: unknown) =>
  // SAFETY: the refused payload is one the types reject; the send must refuse it at run time too.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the untyped caller a send guards against
  value as never;

// A folder tree `depth` deep whose innermost kid is a number: a payload its Schema refuses.
const brokenFolder = (depth: number) => {
  let tree: unknown = { kids: [7] };

  for (let n = 0; n < depth; n += 1) tree = { kids: [tree] };

  return loose(tree);
};

describe("values of any depth (Codec R1, R4; Actors R18, R19; Pending D27)", () => {
  for (const [kind, heardOn, field] of kinds)
    for (const [depth, story] of [
      [PAST_STACK, () => swept[kind]],
      [DEEP, () => nestAt(kind, DEEP, `session/${kind.toLowerCase()}-deep`)],
    ] as const)
      it(
        `Codec R1, Actors R19: ${kind} ${depth.toLocaleString("en")} deep save, restore and are heard once; the title alone, an equal rebuild and a reload make up no event`,
        async () => {
          const run = checked(await story().run());

          const heard = (cut: keyof typeof run.checkpoints) =>
            run.checkpoints[cut].read(nestView)?.memory[heardOn];

          expect([
            heard("deep"),
            heard("titled"),
            heard("deeper"),
            heard("again"),
            heard("reloaded"),
            heard("back"),
          ]).toEqual([1, 1, 2, 2, 2, 3]);
          expect(run.checkpoints.deep.records.stored.get(NESTS)).toBeDefined();
          expect(depthOf(run.checkpoints.reloaded.read(mainNests)?.memory[field])).toBeGreaterThan(
            depth - 1,
          );
          expect(run.checkpoints.reloaded.read(mainNests)?.memory["title"]).toBe("renamed");
          expect(unencodable(run)).toEqual([]);
          expect(run.evidence.filter((e) => e._tag === "Issue")).toEqual([]);
        },
        DEEP_TIMEOUT,
      );

  for (const [depth, story] of [
    [PAST_STACK, () => importPastStack],
    [DEEP, () => importAt(DEEP, "session/import-deep")],
  ] as const)
    it(
      `Codec R1, Actors R19: a folder tree ${depth.toLocaleString("en")} deep in an event's payload is decoded and saved; a reaction reading a pin as deep beside the title hears each title once and nothing else`,
      async () => {
        const run = checked(await story().run());

        const view = (cut: keyof typeof run.checkpoints) =>
          run.checkpoints[cut].read(nestView)?.memory;

        expect(view("imported")?.["folders"]).toBe(1);
        expect(
          (["pinned", "first", "unrelated", "reloaded", "second"] as const).map(
            (cut) => view(cut)?.["pins"],
          ),
        ).toEqual([0, 1, 1, 1, 2]);
        expect(
          depthOf(run.checkpoints.reloaded.read(mainNests)?.memory["folders"]),
        ).toBeGreaterThan(depth - 1);
        expect(depthOf(view("reloaded")?.["pinned"])).toBeGreaterThan(depth - 1);
        expect(run.checkpoints.pinned.records.stored.get(VIEW)).toBeDefined();
        expect(unencodable(run)).toEqual([]);
        expect(run.evidence.filter((e) => e._tag === "Issue")).toEqual([]);
        expect(render(run.trace, "text")).toContain("send Workspace/Nests/main Import");
      },
      DEEP_TIMEOUT,
    );

  it(
    "Codec R1: a document a hundred thousand deep beside five thousand siblings imports, compares equal when rebuilt, and restores",
    async () => {
      const run = checked(await deepAndWideNests().run());

      const heard = (cut: keyof typeof run.checkpoints) =>
        run.checkpoints[cut].read(nestView)?.memory["folders"];

      expect([heard("mixed"), heard("again"), heard("reloaded")]).toEqual([1, 1, 1]);
      expect(unencodable(run)).toEqual([]);
    },
    DEEP_TIMEOUT,
  );

  it(
    "E2, Actors R14: a payload the Schema refuses a hundred thousand deep throws InvalidEvent at the event's constructor and at send, never another error",
    () => {
      const deep: Folder = foldersOf(DEEP);

      expect(Nests.E.Import({ folder: deep })._tag).toBe("Import");

      for (const send of [
        () => Nests.E.Import({ folder: brokenFolder(DEEP) }),
        () => {
          const runtime = workspaceGrownSetup.construct();
          Effect.runSync(runtime.ready());
          runtime
            .ensureActor(mainNests)
            .send(loose({ _tag: "Import", folder: brokenFolder(DEEP) }));
        },
      ])
        try {
          send();
          assert.fail("the payload was not refused");
        } catch (error) {
          assert.ok(error instanceof FlowError, String(error));
          expect(error.code).toBe("InvalidEvent");
        }
    },
    DEEP_TIMEOUT,
  );
});
