/**
 * Runs `body` while counting calls to the host's timer functions, then puts them back.
 */
export const countingHostTimers = async <A>(body: () => Promise<A>) => {
  const calls = { timeout: 0, interval: 0, immediate: 0 };

  /* oxlint-disable flow-state/no-timers -- the guard swaps the host's timers for counting wrappers that forward each call unchanged, and puts them back; it arms no timer itself */
  const host = {
    setTimeout: globalThis.setTimeout,
    setInterval: globalThis.setInterval,
    setImmediate: globalThis.setImmediate,
  };

  globalThis.setTimeout = Object.assign((...args: Parameters<typeof setTimeout>) => {
    calls.timeout += 1;

    return host.setTimeout(...args);
  }, host.setTimeout);
  globalThis.setInterval = Object.assign((...args: Parameters<typeof setInterval>) => {
    calls.interval += 1;

    return host.setInterval(...args);
  }, host.setInterval);
  globalThis.setImmediate = Object.assign((...args: Parameters<typeof setImmediate>) => {
    calls.immediate += 1;

    return host.setImmediate(...args);
  }, host.setImmediate);

  try {
    return { result: await body(), calls };
  } finally {
    Object.assign(globalThis, host);
  }
  /* oxlint-enable flow-state/no-timers */
};
