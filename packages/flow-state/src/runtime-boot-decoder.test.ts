import { describe, expect, it } from "vite-plus/test";

import { decodeRuntimeBootPayload } from "./runtime/runtime-boot-decoder.js";

type SnapshotFamily = "resources" | "transactions" | "streams" | "timers" | "children";
const snapshotFamilies = [
  "resources",
  "transactions",
  "streams",
  "timers",
  "children",
] as const satisfies ReadonlyArray<SnapshotFamily>;

const validEntries: Readonly<Record<SnapshotFamily, Readonly<Record<string, unknown>>>> = {
  resources: {
    id: "resource",
    status: "success",
    availability: "value",
    activity: "idle",
    freshness: "fresh",
    isPlaceholderData: false,
    value: { ok: true },
  },
  transactions: {
    id: "transaction",
    status: "success",
    value: { ok: true },
  },
  streams: {
    id: "stream",
    status: "running",
    generation: 1,
    emitted: 1,
    hasValue: true,
    value: { ok: true },
  },
  timers: {
    id: "timer",
    status: "scheduled",
    generation: 1,
    parentState: "ready",
    startedAt: 0,
    dueAt: 10,
  },
  children: {
    id: "child",
    status: "active",
    generation: 1,
    actorId: "actor/child",
    state: "ready",
    parentState: "ready",
    supervision: "continue-on-failure",
  },
};

const nestedChildSnapshot = {
  value: "ready",
  context: {},
  resources: {},
  transactions: {},
  streams: {},
  timers: {},
  children: {},
  receipts: [],
};

function omit(
  value: Readonly<Record<string, unknown>>,
  key: string,
): Readonly<Record<string, unknown>> {
  return Object.fromEntries(Object.entries(value).filter(([entryKey]) => entryKey !== key));
}

function payloadWith(
  family: SnapshotFamily,
  entry: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const emptyFamilies: Record<SnapshotFamily, Readonly<Record<string, unknown>>> = {
    resources: {},
    transactions: {},
    streams: {},
    timers: {},
    children: {},
  };
  const id = String(entry.id ?? validEntries[family].id);

  return {
    version: "flow-state/runtime-boot.v1",
    resources: [],
    actors: [
      {
        id: "actor",
        snapshot: {
          value: "ready",
          context: {},
          ...emptyFamilies,
          [family]: { [id]: entry },
          receipts: [],
        },
      },
    ],
  };
}

function expectRejected(
  family: SnapshotFamily,
  entry: Readonly<Record<string, unknown>>,
  path: string,
  reason: string,
): void {
  expect(() => decodeRuntimeBootPayload(payloadWith(family, entry))).toThrow(
    expect.objectContaining({
      code: "FLOW-RUNTIME-002",
      debug: expect.objectContaining({ path, reason }),
    }),
  );
}

describe("runtime boot decoder nested snapshot strictness", () => {
  it("accepts the exact documented nested snapshot records", () => {
    for (const family of snapshotFamilies) {
      expect(() =>
        decodeRuntimeBootPayload(payloadWith(family, validEntries[family])),
      ).not.toThrow();
    }
  });

  it("rejects unknown fields in every nested snapshot family", () => {
    for (const family of snapshotFamilies) {
      const id = validEntries[family].id;
      expectRejected(
        family,
        { ...validEntries[family], unexpected: true },
        `$.actors[0].snapshot.${family}.${String(id)}.unexpected`,
        "unknown-field",
      );
    }
  });

  it("requires every documented nested discriminant and identity field", () => {
    const requiredFields: Readonly<Record<SnapshotFamily, ReadonlyArray<string>>> = {
      resources: ["id", "status", "availability", "activity", "freshness", "isPlaceholderData"],
      transactions: ["id", "status"],
      streams: ["id", "status", "hasValue"],
      timers: ["id", "status", "generation", "parentState", "startedAt", "dueAt"],
      children: ["id", "status", "generation"],
    };

    for (const family of snapshotFamilies) {
      const id = validEntries[family].id;
      for (const field of requiredFields[family]) {
        expectRejected(
          family,
          omit(validEntries[family], field),
          `$.actors[0].snapshot.${family}.${String(id)}.${field}`,
          "missing-field",
        );
      }
    }
  });

  it("distinguishes an absent optional field from present undefined", () => {
    expect(() =>
      decodeRuntimeBootPayload(payloadWith("resources", validEntries.resources)),
    ).not.toThrow();
    expectRejected(
      "resources",
      { ...validEntries.resources, updatedAt: undefined },
      "$.actors[0].snapshot.resources.resource.updatedAt",
      "unsupported-undefined",
    );
  });

  it("rejects contradictory resource lifecycle records", () => {
    const cases: ReadonlyArray<Readonly<Record<string, unknown>>> = [
      { ...validEntries.resources, status: "loading", availability: "value" },
      { ...validEntries.resources, status: "success", availability: "empty" },
      {
        ...validEntries.resources,
        status: "failure",
        availability: "failure",
        value: { ok: true },
      },
      {
        ...omit(validEntries.resources, "value"),
        status: "failure",
        availability: "failure",
      },
    ];

    for (const entry of cases) {
      expectRejected(
        "resources",
        entry,
        "$.actors[0].snapshot.resources.resource",
        "contradictory-resource-snapshot",
      );
    }
  });

  it("rejects contradictory transaction terminal records", () => {
    const cases: ReadonlyArray<Readonly<Record<string, unknown>>> = [
      omit(validEntries.transactions, "value"),
      { ...validEntries.transactions, error: "failure" },
      { id: "transaction", status: "failure" },
      { id: "transaction", status: "failure", error: "failure", value: { ok: true } },
      { id: "transaction", status: "pending", value: { ok: true } },
      { id: "transaction", status: "defect", error: "failure" },
    ];

    for (const entry of cases) {
      expectRejected(
        "transactions",
        entry,
        "$.actors[0].snapshot.transactions.transaction",
        "contradictory-transaction-snapshot",
      );
    }
  });

  it("rejects contradictory stream value and failure records", () => {
    const cases: ReadonlyArray<Readonly<Record<string, unknown>>> = [
      { id: "stream", status: "idle", hasValue: false, generation: 1 },
      { ...validEntries.streams, hasValue: false },
      omit(validEntries.streams, "value"),
      { ...validEntries.streams, error: "failure" },
      { ...validEntries.streams, status: "failure" },
    ];

    for (const entry of cases) {
      expectRejected(
        "streams",
        entry,
        "$.actors[0].snapshot.streams.stream",
        "contradictory-stream-snapshot",
      );
    }
  });

  it("rejects contradictory timer lifecycle records", () => {
    const cases: ReadonlyArray<Readonly<Record<string, unknown>>> = [
      { ...validEntries.timers, endedAt: 10 },
      { ...validEntries.timers, dueAt: -1 },
      { ...validEntries.timers, status: "fired" },
      { ...validEntries.timers, status: "fired", endedAt: 9 },
      { ...validEntries.timers, status: "interrupt" },
      { ...validEntries.timers, status: "interrupt", endedAt: -1 },
    ];

    for (const entry of cases) {
      expectRejected(
        "timers",
        entry,
        "$.actors[0].snapshot.timers.timer",
        "contradictory-timer-snapshot",
      );
    }
  });

  it("rejects contradictory child lifecycle records", () => {
    const cases: ReadonlyArray<Readonly<Record<string, unknown>>> = [
      { id: "child", status: "idle", generation: 1, actorId: "actor/child" },
      { id: "child", status: "idle", generation: 1, state: "ready" },
      { id: "child", status: "idle", generation: 1, snapshot: nestedChildSnapshot },
      { id: "child", status: "idle", generation: 1, parentState: "ready" },
      {
        id: "child",
        status: "idle",
        generation: 1,
        supervision: "continue-on-failure",
      },
      { ...validEntries.children, state: "other", snapshot: nestedChildSnapshot },
      { ...omit(validEntries.children, "state"), snapshot: nestedChildSnapshot },
    ];

    for (const entry of cases) {
      expectRejected(
        "children",
        entry,
        "$.actors[0].snapshot.children.child",
        "contradictory-child-snapshot",
      );
    }
  });

  it("rejects invalid nested facts and map identities", () => {
    const cases = [
      [
        "resources",
        { ...validEntries.resources, updatedAt: Number.POSITIVE_INFINITY },
        "updatedAt",
        "non-finite-number",
      ],
      [
        "streams",
        { ...validEntries.streams, emitted: -1 },
        "emitted",
        "expected-non-negative-safe-integer",
      ],
      [
        "streams",
        { ...validEntries.streams, generation: 0 },
        "generation",
        "expected-positive-safe-integer",
      ],
      ["timers", { ...validEntries.timers, dueAt: Number.NaN }, "dueAt", "non-finite-number"],
      [
        "timers",
        { ...validEntries.timers, generation: 1.5 },
        "generation",
        "expected-positive-safe-integer",
      ],
      [
        "children",
        { ...validEntries.children, generation: 0 },
        "generation",
        "expected-positive-safe-integer",
      ],
    ] as const;

    for (const [family, entry, field, reason] of cases) {
      expectRejected(
        family,
        entry,
        `$.actors[0].snapshot.${family}.${String(validEntries[family].id)}.${field}`,
        reason,
      );
    }

    expect(() =>
      decodeRuntimeBootPayload({
        version: "flow-state/runtime-boot.v1",
        resources: [],
        actors: [
          {
            id: "actor",
            snapshot: {
              value: "ready",
              context: {},
              resources: { wrong: validEntries.resources },
              transactions: {},
              streams: {},
              timers: {},
              children: {},
              receipts: [],
            },
          },
        ],
      }),
    ).toThrow(
      expect.objectContaining({
        code: "FLOW-RUNTIME-002",
        debug: expect.objectContaining({
          path: "$.actors[0].snapshot.resources.wrong.id",
          reason: "map-key-id-mismatch",
        }),
      }),
    );
  });

  it("applies the same strict validation recursively to child snapshots", () => {
    const nestedSnapshot = {
      value: "ready",
      context: {},
      resources: {
        resource: { ...validEntries.resources, unexpected: true },
      },
      transactions: {},
      streams: {},
      timers: {},
      children: {},
      receipts: [],
    };

    expectRejected(
      "children",
      { ...validEntries.children, snapshot: nestedSnapshot },
      "$.actors[0].snapshot.children.child.snapshot.resources.resource.unexpected",
      "unknown-field",
    );
  });
});
