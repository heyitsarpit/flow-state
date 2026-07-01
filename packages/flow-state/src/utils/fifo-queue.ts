const COMPACT_AFTER_DEQUEUES = 64;

export function createFifoQueue<Value>() {
  let items: Value[] = [];
  let head = 0;

  const compact = () => {
    if (head === 0) {
      return;
    }

    if (head === items.length) {
      items = [];
      head = 0;
      return;
    }

    if (head >= COMPACT_AFTER_DEQUEUES && head * 2 >= items.length) {
      items = items.slice(head);
      head = 0;
    }
  };

  return {
    size: () => items.length - head,
    enqueue: (value: Value) => {
      items.push(value);
    },
    dequeue: (): Value | undefined => {
      if (head === items.length) {
        return undefined;
      }

      const value = items[head];
      head += 1;
      compact();
      return value;
    },
    clear: () => {
      items = [];
      head = 0;
    },
  } as const;
}
