import { describe, expect, it } from "vite-plus/test";

import { createSubscribedSource } from "./subscribed-source.js";

describe("createSubscribedSource", () => {
  it("keeps reads pure, reconciles subscription races, and releases exactly once", () => {
    let current = 1;
    let subscribeCalls = 0;
    let cleanupCalls = 0;
    let listenerCalls = 0;
    let publish: ((value: number) => void) | undefined;
    const source = createSubscribedSource({
      getCurrent: () => current,
      subscribeToCurrent: (listener) => {
        subscribeCalls += 1;
        publish = listener;
        current = 2;
        return () => {
          cleanupCalls += 1;
        };
      },
    });

    expect(source.getSnapshot()).toBe(1);
    expect(subscribeCalls).toBe(0);

    const unsubscribe = source.subscribe(() => {
      listenerCalls += 1;
    });

    expect(subscribeCalls).toBe(1);
    expect(source.getSnapshot()).toBe(2);
    expect(listenerCalls).toBe(0);

    publish?.(2);
    expect(listenerCalls).toBe(0);

    publish?.(3);
    expect(source.getSnapshot()).toBe(3);
    expect(listenerCalls).toBe(1);

    unsubscribe();
    unsubscribe();
    publish?.(4);

    expect(cleanupCalls).toBe(1);
    expect(listenerCalls).toBe(1);
    expect(source.getSnapshot()).toBe(3);
  });
});
