import { createFifoQueue } from "../../utils/fifo-queue.js";
import type { AnyFlowMachine, FlowEvent } from "../api/types.js";
import type {
  ActiveTransactionEntry,
  FlowRuntimeTransactionAttempt,
  FlowRuntimeTransactionDefinition,
  QueuedTransaction,
  TransactionAttempt,
} from "./orchestrator-transaction-types.js";

const DEFAULT_SERIALIZE_QUEUE_CAPACITY = 1;

export function serializeQueueCapacity<Event extends FlowEvent>(
  definition: FlowRuntimeTransactionDefinition<Event> | FlowRuntimeTransactionAttempt<Event>,
): number {
  return definition.concurrency === "serialize" ? DEFAULT_SERIALIZE_QUEUE_CAPACITY : 0;
}

export function transactionConcurrencyKey<Event extends FlowEvent>(
  definition: FlowRuntimeTransactionDefinition<Event> | FlowRuntimeTransactionAttempt<Event>,
): string {
  return definition.concurrency === "serialize"
    ? (definition.scope?.id ?? definition.id)
    : definition.id;
}

export function createTransactionConcurrency<Machine extends AnyFlowMachine>() {
  const activeTransactions = new Map<string, ReadonlyArray<ActiveTransactionEntry<Machine>>>();
  const queuedTransactions = new Map<
    string,
    ReturnType<typeof createFifoQueue<QueuedTransaction<Machine>>>
  >();
  const latestTransactionAttempts = new Map<string, TransactionAttempt<Machine>>();
  const transactionGenerations = new Map<string, number>();
  const transactionSnapshotOwners = new Map<string, number>();

  const activeEntries = (id: string): ReadonlyArray<ActiveTransactionEntry<Machine>> =>
    activeTransactions.get(id) ?? [];

  const replaceActiveEntries = (
    id: string,
    entries: ReadonlyArray<ActiveTransactionEntry<Machine>>,
  ) => {
    if (entries.length === 0) {
      activeTransactions.delete(id);
      return;
    }

    activeTransactions.set(id, entries);
  };

  const latestActiveEntry = (id: string): ActiveTransactionEntry<Machine> | undefined => {
    const entries = activeEntries(id);
    return entries.length === 0 ? undefined : entries[entries.length - 1];
  };

  const activeEntriesInConcurrencyKey = (
    concurrencyKey: string,
  ): ReadonlyArray<ActiveTransactionEntry<Machine>> =>
    Array.from(activeTransactions.values()).flatMap((entries) =>
      entries.filter((entry) => entry.concurrencyKey === concurrencyKey),
    );

  const beginAttempt = (
    attempt: QueuedTransaction<Machine>["attempt"],
  ): Readonly<{
    readonly concurrencyKey: string;
    readonly generation: number;
  }> => {
    const generation = (transactionGenerations.get(attempt.id) ?? 0) + 1;
    latestTransactionAttempts.set(attempt.id, attempt);
    transactionGenerations.set(attempt.id, generation);
    transactionSnapshotOwners.set(attempt.id, generation);
    return Object.freeze({
      concurrencyKey: transactionConcurrencyKey(attempt),
      generation,
    });
  };

  const latestAttempt = (id: string): TransactionAttempt<Machine> | undefined =>
    latestTransactionAttempts.get(id);

  const queue = (queued: QueuedTransaction<Machine>) => {
    const existing =
      queuedTransactions.get(queued.concurrencyKey) ??
      createFifoQueue<QueuedTransaction<Machine>>();
    existing.enqueue(queued);
    queuedTransactions.set(queued.concurrencyKey, existing);
  };

  const queueSize = (concurrencyKey: string): number =>
    queuedTransactions.get(concurrencyKey)?.size() ?? 0;

  const dequeue = (concurrencyKey: string): QueuedTransaction<Machine> | undefined => {
    const queued = queuedTransactions.get(concurrencyKey);
    if (queued === undefined) {
      return undefined;
    }

    const nextQueued = queued.dequeue();
    if (queued.size() === 0) {
      queuedTransactions.delete(concurrencyKey);
    }

    return nextQueued;
  };

  const clearQueue = (concurrencyKey: string) => {
    queuedTransactions.delete(concurrencyKey);
  };

  const activeIds = (): ReadonlyArray<string> => Array.from(activeTransactions.keys());

  const activeEntriesById = (): ReadonlyArray<
    readonly [string, ReadonlyArray<ActiveTransactionEntry<Machine>>]
  > => Array.from(activeTransactions.entries());

  const isSnapshotOwner = (id: string, generation: number): boolean =>
    transactionSnapshotOwners.get(id) === generation;

  return {
    activeEntries,
    replaceActiveEntries,
    latestActiveEntry,
    activeEntriesInConcurrencyKey,
    beginAttempt,
    latestAttempt,
    queue,
    queueSize,
    dequeue,
    clearQueue,
    activeIds,
    activeEntriesById,
    isSnapshotOwner,
  } as const;
}
