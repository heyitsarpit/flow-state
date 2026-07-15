import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";

import * as flow from "./index.js";
import { test } from "./testing.js";

type RecordValue = Readonly<{
  readonly id: string;
  readonly name: string;
}>;

type SaveEvent = Readonly<{ readonly type: "SAVE" }>;

const recordResource = flow.resource<[id: string], RecordValue>({
  id: "P2.parameterizedPreview.record",
  key: (id) => flow.createKey("p2.parameterized-preview", id),
  lookup: (id) => Effect.succeed({ id, name: "loaded" }),
});

const saveBoth = flow.transaction<
  Readonly<{ readonly left: string; readonly right: string }>,
  never,
  never,
  never,
  SaveEvent
>({
  id: "P2.parameterizedPreview.saveBoth",
  params: ({ context }: { readonly context: { readonly left: string; readonly right: string } }) =>
    context,
  preview: {
    apply: ({ params }) => [
      {
        ref: recordResource.ref(params.left),
        replace: { id: params.left, name: "left-preview" },
      },
      {
        ref: recordResource.ref(params.right),
        replace: { id: params.right, name: "right-preview" },
      },
    ],
  },
  commit: () => Effect.never,
  concurrency: "reject-while-running",
});

const saveMachine = flow.machine<
  Readonly<{ readonly left: string; readonly right: string }>,
  SaveEvent,
  "ready",
  "ready"
>({
  id: "P2.parameterizedPreview.machine",
  initial: "ready",
  context: () => ({ left: "left", right: "right" }),
  states: {
    ready: {
      on: {
        SAVE: { submit: saveBoth },
      },
    },
  },
});

const seededRecords = [
  {
    ref: recordResource.ref("left"),
    value: { id: "left", name: "left-seed" },
  },
  {
    ref: recordResource.ref("right"),
    value: { id: "right", name: "right-seed" },
  },
] as const;

const previewApp = flow.app({
  modules: [
    flow.module("P2ParameterizedPreview", {
      resources: { record: recordResource },
      transactions: { saveBoth },
      machines: { save: saveMachine },
    }),
  ],
});

function expectBothPreviews(get: (ref: ReturnType<typeof recordResource.ref>) => unknown): void {
  expect(get(recordResource.ref("left"))).toMatchObject({
    value: { id: "left", name: "left-preview" },
  });
  expect(get(recordResource.ref("right"))).toMatchObject({
    value: { id: "right", name: "right-preview" },
  });
}

describe("parameterized transaction preview identity", () => {
  it("publishes every same-definition preview through the runtime owner", async () => {
    const runtime = flow.runtime(
      previewApp.layer({ store: flow.store.test(), orchestrators: flow.orchestrators.test() }),
    );
    runtime.resources.seedResources(seededRecords);
    const actor = runtime.createActor(saveMachine);

    actor.send({ type: "SAVE" });

    expectBothPreviews((ref) => runtime.resources.get(ref));

    await actor.dispose();
    expect(runtime.resources.get(recordResource.ref("left"))).toMatchObject({
      value: { id: "left", name: "left-seed" },
    });
    expect(runtime.resources.get(recordResource.ref("right"))).toMatchObject({
      value: { id: "right", name: "right-seed" },
    });
    await runtime.dispose();
  });

  it("publishes the same exact-instance previews through Flow Test", async () => {
    const harness = test(saveMachine)
      .with({ resources: seededRecords })
      .run([{ type: "SAVE" }]);

    expect(Object.values(harness.getSnapshot().resources)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: { id: "left", name: "left-preview" } }),
        expect.objectContaining({ value: { id: "right", name: "right-preview" } }),
      ]),
    );
  });
});
