import { Option, Predicate } from "effect";
import { expect, it } from "vite-plus/test";
import { mainNests, nestView } from "../../fixtures/session/app.ts";
import {
  DEEP,
  listsPastStack,
  foldersPastStack,
  mapsPastStack,
  kindsPastStack,
  nestAt,
  PAST_STACK,
  treePastStack,
} from "../../fixtures/session/stories/values.ts";
import type { StoryRun } from "../../src/host/testing/index.ts";
import { checked } from "../rules/rules.ts";
import { LIMITS } from "../limits.ts";

export const DEEP_TIMEOUT = LIMITS.deepValue;

export const NESTS = "actor/Workspace/Nests/main";
export const VIEW = "actor/Workspace/NestView/view";

export const unencodable = (run: StoryRun) =>
  run.evidence.flatMap((e) =>
    e._tag === "Reported" && e.code === "UnencodableValue"
      ? [Option.getOrElse(e.record, () => "-")]
      : [],
  );

// FLOW_STATE_ALLOW_UNKNOWN: a node of a restored nest.
type NestNode = unknown;

// RETURN_TYPE: every branch is a list of nodes, an array's own items among them.
const childrenOf = (node: NestNode): ReadonlyArray<NestNode> => {
  if (Array.isArray(node)) return node;

  if (node instanceof Map) return [...node.values()];

  return Predicate.isObject(node) ? Object.values(node) : [];
};

// FLOW_STATE_ALLOW_UNKNOWN: a restored nest, measured without the call stack: its deepest node.
export const depthOf = (root: unknown) => {
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
const heardBy = {
  Lists: { heardOn: "lists", field: "lists" },
  Folders: { heardOn: "folders", field: "folders" },
  Maps: { heardOn: "maps", field: "index" },
  Tree: { heardOn: "trees", field: "tree" },
  Kinds: { heardOn: "kinds", field: "node" },
} as const;

export type KindName = keyof typeof heardBy;

const swept = {
  Lists: listsPastStack,
  Folders: foldersPastStack,
  Maps: mapsPastStack,
  Kinds: kindsPastStack,
  Tree: treePastStack,
};

export const kindValueTests = (cases: ReadonlyArray<readonly [KindName, "past" | "deep"]>) => {
  for (const [kind, scale] of cases) {
    const { heardOn, field } = heardBy[kind];

    const [depth, story] =
      scale === "past"
        ? ([PAST_STACK, () => swept[kind]] as const)
        : ([DEEP, () => nestAt(kind, DEEP, `session/${kind.toLowerCase()}-deep`)] as const);

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
  }
};
