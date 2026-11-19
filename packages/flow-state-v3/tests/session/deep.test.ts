import { Effect } from "effect";
import assert from "node:assert/strict";
import { describe, expect, it } from "vite-plus/test";
import { mainNests, nestView, workspaceGrownSetup } from "../../fixtures/session/app.ts";
import { type Folder, foldersOf, Nests } from "../../fixtures/session/machines/nests.ts";
import {
  DEEP,
  deepAndWideNests,
  importAt,
  importPastStack,
  PAST_STACK,
} from "../../fixtures/session/stories/values.ts";
import { render } from "../../src/host/trace.ts";
import { FlowError } from "../../src/index.ts";
import { checked } from "../rules/rules.ts";
import { DEEP_TIMEOUT, depthOf, kindValueTests, unencodable, VIEW } from "./deep-cases.ts";

// A folder tree `depth` deep whose innermost kid is a number: a payload its Schema refuses.
const loose = (value: unknown) =>
  // SAFETY: the refused payload is one the types reject; the send must refuse it at run time too.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the untyped caller a send guards against
  value as never;

const brokenFolder = (depth: number) => {
  let tree: unknown = { kids: [7] };

  for (let n = 0; n < depth; n += 1) tree = { kids: [tree] };

  return loose(tree);
};

describe("values of any depth (Codec R1, R4, R6; Actors R18, R19)", () => {
  kindValueTests([
    ["Lists", "past"],
    ["Folders", "past"],
    ["Maps", "past"],
    ["Tree", "past"],
    ["Kinds", "past"],
    ["Lists", "deep"],
    ["Folders", "deep"],
  ]);

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
        expect(depthOf(run.checkpoints.reloaded.read(mainNests)?.memory.folders)).toBeGreaterThan(
          depth - 1,
        );
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
        run.checkpoints[cut].read(nestView)?.memory.folders;

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
