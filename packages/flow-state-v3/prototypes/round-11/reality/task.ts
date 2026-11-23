// D122: what `Host.later` is on a page. A `MessageChannel` post is a new task, with no 4 ms clamp once nested and no background throttling, which is why React's scheduler uses one (`scheduler/src/forks/Scheduler.js`, from memory). `setTimeout(f, 0)` is the fallback where there is none.
export const newTask = (): ((f: () => void) => void) => {
  if (typeof MessageChannel === "undefined") return (f) => void setTimeout(f, 0);
  const q: Array<() => void> = [];
  const channel = new MessageChannel();
  channel.port1.onmessage = () => q.shift()?.();
  return (f) => {
    q.push(f);
    channel.port2.postMessage(0);
  };
};
