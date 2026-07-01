type ReadyWorkTask = () => void;
type ReadyWorkFlushMode = "dispatch" | "manual";

type ReadyWorkQueue = {
  pending: Array<ReadyWorkTask>;
  deferred: Array<ReadyWorkTask>;
  flushing: boolean;
  flushMode: ReadyWorkFlushMode | null;
  started: boolean;
};

const readyWorkQueues = new WeakMap<object, ReadyWorkQueue>();

function queueFor(owner: object): ReadyWorkQueue {
  const existing = readyWorkQueues.get(owner);
  if (existing !== undefined) {
    return existing;
  }

  const queue: ReadyWorkQueue = {
    pending: [],
    deferred: [],
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
    queue.deferred.push(task);
    return;
  }

  queue.pending.push(task);
}

export function startReadyWork(owner: object): void {
  queueFor(owner).started = true;
}

export function dispatchReadyWork(owner: object, task: ReadyWorkTask): void {
  const queue = queueFor(owner);
  queue.pending.push(task);
  if (!queue.started) {
    return;
  }

  flushReadyWorkNow(owner, "dispatch");
}

export function readyWorkPendingCount(owner: object): number {
  const queue = queueFor(owner);
  return queue.pending.length + queue.deferred.length;
}

function promoteDeferred(queue: ReadyWorkQueue): void {
  if (queue.deferred.length === 0) {
    return;
  }

  queue.pending.push(...queue.deferred);
  queue.deferred.length = 0;
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
    while (queue.pending.length > 0) {
      const task = queue.pending.shift();
      task?.();
    }
  } finally {
    queue.flushing = false;
    queue.flushMode = null;
  }
}

export async function flushReadyWork(owner: object): Promise<void> {
  flushReadyWorkNow(owner, "manual");
}
