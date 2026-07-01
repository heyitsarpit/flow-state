import { createFifoQueue } from "../../fifo-queue.js";
import type { FlowEvent, FlowMachine } from "../api/types.js";
import type {
  ActiveTransactionEntry,
  QueuedTransaction,
  TransactionAttempt,
  UnknownFlowTransactionDefinition,
} from "./orchestrator-transaction-types.js";

export function transactionConcurrencyKey<Event extends FlowEvent>(
  definition: UnknownFlowTransactionDefinition<Event>,
): string {
  return definition.config.concurrency === "serialize"
    ? (definition.config.scope?.id ?? definition.id)
    : definition.id;
}

export function createTransactionConcurrency<Machine extends FlowMachine>() {
  const activeTransactions = new Map<string, ReadonlyArray<ActiveTransactionEntry>>();
  const queuedTransactions = new Map<
    string,
    ReturnType<typeof createFifoQueue<QueuedTransaction<Machine>>>
  >();
  const latestTransactionAttempts = new Map<string, TransactionAttempt>();
  const transactionGenerations = new Map<string, number>();
  const transactionSnapshotOwners = new Map<string, number>();

  const activeEntries = (id: string): ReadonlyArray<ActiveTransactionEntry> =>
    activeTransactions.get(id) ?? [];

  const replaceActiveEntries = (id: string, entries: ReadonlyArray<ActiveTransactionEntry>) => {
    if (entries.length === 0) {
      activeTransactions.delete(id);
      return;
    }

    activeTransactions.set(id, entries);
  };

  const latestActiveEntry = (id: string): ActiveTransactionEntry | undefined => {
    const entries = activeEntries(id);
    return entries.length === 0 ? undefined : entries[entries.length - 1];
  };

  const activeEntriesInConcurrencyKey = (
    concurrencyKey: string,
  ): ReadonlyArray<ActiveTransactionEntry> =>
    Array.from(activeTransactions.values()).flatMap((entries) =>
      entries.filter((entry) => entry.concurrencyKey === concurrencyKey),
    );

  const beginAttempt = (
    definition: QueuedTransaction<Machine>["definition"],
    params: unknown,
  ): Readonly<{
    readonly concurrencyKey: string;
    readonly generation: number;
  }> => {
    const generation = (transactionGenerations.get(definition.id) ?? 0) + 1;
    latestTransactionAttempts.set(definition.id, {
      definition,
      params,
    });
    transactionGenerations.set(definition.id, generation);
    transactionSnapshotOwners.set(definition.id, generation);
    return Object.freeze({
      concurrencyKey: transactionConcurrencyKey(definition),
      generation,
    });
  };

  const latestAttempt = (id: string): TransactionAttempt | undefined =>
    latestTransactionAttempts.get(id);

  const queue = (queued: QueuedTransaction<Machine>) => {
    const existing =
      queuedTransactions.get(queued.concurrencyKey) ??
      createFifoQueue<QueuedTransaction<Machine>>();
    existing.enqueue(queued);
    queuedTransactions.set(queued.concurrencyKey, existing);
  };

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
    readonly [string, ReadonlyArray<ActiveTransactionEntry>]
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
    dequeue,
    clearQueue,
    activeIds,
    activeEntriesById,
    isSnapshotOwner,
  } as const;
}
