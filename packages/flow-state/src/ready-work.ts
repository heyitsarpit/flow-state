type ReadyWorkTask = () => void;

type ReadyWorkQueue = {
  pending: Array<ReadyWorkTask>;
  flushing: boolean;
};

const readyWorkQueues = new WeakMap<object, ReadyWorkQueue>();

function queueFor(owner: object): ReadyWorkQueue {
  const existing = readyWorkQueues.get(owner);
  if (existing !== undefined) {
    return existing;
  }

  const queue: ReadyWorkQueue = {
    pending: [],
    flushing: false,
  };
  readyWorkQueues.set(owner, queue);
  return queue;
}

export function enqueueReadyWork(owner: object, task: ReadyWorkTask): void {
  queueFor(owner).pending.push(task);
}

export async function flushReadyWork(owner: object): Promise<void> {
  const queue = queueFor(owner);
  if (queue.flushing) {
    return;
  }

  queue.flushing = true;
  try {
    while (queue.pending.length > 0) {
      const task = queue.pending.shift();
      task?.();
    }
  } finally {
    queue.flushing = false;
  }
}
