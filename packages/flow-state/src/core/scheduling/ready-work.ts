import { createFifoQueue } from "../../utils/fifo-queue.js";

type ReadyWorkTask = () => void;
type ReadyWorkFlushMode = "dispatch" | "manual";

type ReadyWorkQueue = {
  pending: ReturnType<typeof createFifoQueue<ReadyWorkTask>>;
  deferred: ReturnType<typeof createFifoQueue<ReadyWorkTask>>;
  flushing: boolean;
  flushMode: ReadyWorkFlushMode | null;
  started: boolean;
};

const READY_WORK_TURN_LIMIT = 64;
const readyWorkQueues = new WeakMap<object, ReadyWorkQueue>();

function queueFor(owner: object): ReadyWorkQueue {
  const existing = readyWorkQueues.get(owner);
  if (existing !== undefined) {
    return existing;
  }

  const queue: ReadyWorkQueue = {
    pending: createFifoQueue<ReadyWorkTask>(),
    deferred: createFifoQueue<ReadyWorkTask>(),
    flushing: false,
    flushMode: null,
    started: false,
  };
  readyWorkQueues.set(owner, queue);
  return queue;
}

export function enqueueReadyWork(owner: object, task: ReadyWorkTask): void {
  const queue = queueFor(owner);
  if (queue.flushing && queue.flushMode === "dispatch") {
    queue.deferred.enqueue(task);
    return;
  }

  queue.pending.enqueue(task);
}

export function startReadyWork(owner: object): void {
  queueFor(owner).started = true;
}

export function dispatchReadyWork(owner: object, task: ReadyWorkTask): void {
  const queue = queueFor(owner);
  queue.pending.enqueue(task);
  if (!queue.started) {
    return;
  }

  flushReadyWorkNow(owner, "dispatch");
}

export function readyWorkPendingCount(owner: object): number {
  const queue = queueFor(owner);
  return queue.pending.size() + queue.deferred.size();
}

function promoteDeferred(queue: ReadyWorkQueue): void {
  while (queue.deferred.size() > 0) {
    const task = queue.deferred.dequeue();
    if (task !== undefined) {
      queue.pending.enqueue(task);
    }
  }
}

export function flushReadyWorkNow(owner: object, mode: ReadyWorkFlushMode = "manual"): void {
  const queue = queueFor(owner);
  if (queue.flushing) {
    return;
  }

  if (mode === "manual") {
    promoteDeferred(queue);
  }

  queue.flushing = true;
  queue.flushMode = mode;
  try {
    let processed = 0;
    while (queue.pending.size() > 0 && processed < READY_WORK_TURN_LIMIT) {
      const task = queue.pending.dequeue();
      processed += 1;
      task?.();
    }
  } finally {
    queue.flushing = false;
    queue.flushMode = null;
  }
}

export async function flushReadyWork(owner: object): Promise<void> {
  const queue = queueFor(owner);
  while (readyWorkPendingCount(owner) > 0 && !queue.flushing) {
    flushReadyWorkNow(owner, "manual");
  }
}
