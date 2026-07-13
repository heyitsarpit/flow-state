import { expect } from "vite-plus/test";

type TimedReceipt = Readonly<Record<string, unknown>>;
type SnapshotWithReceipts = Readonly<{
  readonly receipts: ReadonlyArray<TimedReceipt>;
}>;
type NormalizedValue =
  | null
  | boolean
  | number
  | string
  | ReadonlyArray<NormalizedValue>
  | {
      readonly [key: string]: NormalizedValue;
    };

type ParityHarness = Readonly<{
  snapshot: () => SnapshotWithReceipts;
  receipts: () => ReadonlyArray<TimedReceipt>;
  issues: () => ReadonlyArray<unknown>;
}>;

type ParityActor = Readonly<{
  getSnapshot: () => SnapshotWithReceipts;
  receipts: () => ReadonlyArray<TimedReceipt>;
  issues: () => ReadonlyArray<unknown>;
}>;

const normalizeReceiptTiming = (receipt: TimedReceipt) => ({
  ...receipt,
  ...("startedAt" in receipt && typeof receipt.startedAt === "number" ? { startedAt: 0 } : {}),
  ...("completedAt" in receipt && typeof receipt.completedAt === "number"
    ? { completedAt: 0 }
    : {}),
  ...("endedAt" in receipt && typeof receipt.endedAt === "number" ? { endedAt: 0 } : {}),
  ...("durationMillis" in receipt && typeof receipt.durationMillis === "number"
    ? { durationMillis: 0 }
    : {}),
});

const normalizeSnapshotTiming = <Snapshot extends SnapshotWithReceipts>(snapshot: Snapshot) => ({
  ...snapshot,
  receipts: snapshot.receipts.map((receipt) => normalizeReceiptTiming(receipt)),
});

const normalizeIssueValue = (value: unknown): NormalizedValue => {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeIssueValue(entry));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "fiberId")
        .map(([key, entry]) => [key, normalizeIssueValue(entry)]),
    );
  }
  return value as null | boolean | number | string;
};

export const expectNormalizedRuntimeParity = (harness: ParityHarness, actor: ParityActor) => {
  expect(normalizeSnapshotTiming(harness.snapshot())).toEqual(
    normalizeSnapshotTiming(actor.getSnapshot()),
  );
  expect(harness.receipts().map((receipt) => normalizeReceiptTiming(receipt))).toEqual(
    actor.receipts().map((receipt) => normalizeReceiptTiming(receipt)),
  );
  expect(harness.issues().map((issue) => normalizeIssueValue(issue))).toEqual(
    actor.issues().map((issue) => normalizeIssueValue(issue)),
  );
};
