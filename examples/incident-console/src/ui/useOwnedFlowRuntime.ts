"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface DisposableRuntime {
  readonly dispose: () => Promise<void>;
}

export type OwnedRuntimeState<Runtime extends DisposableRuntime> =
  | Readonly<{ readonly status: "starting" }>
  | Readonly<{ readonly status: "ready"; readonly runtime: Runtime }>
  | Readonly<{ readonly status: "closing" }>
  | Readonly<{ readonly status: "failure"; readonly message: string }>;

export const useOwnedFlowRuntime = <Runtime extends DisposableRuntime>(
  createRuntime: () => Runtime,
  onDisposed: () => void,
): Readonly<{
  readonly state: OwnedRuntimeState<Runtime>;
  readonly close: () => void;
}> => {
  const [state, setState] = useState<OwnedRuntimeState<Runtime>>({ status: "starting" });
  const runtimeRef = useRef<Runtime | undefined>(undefined);
  const attempted = useRef(false);
  const mountGeneration = useRef(0);
  const disposal = useRef<Promise<void> | undefined>(undefined);
  const closeNotified = useRef(false);

  const dispose = useCallback(() => {
    const runtime = runtimeRef.current;
    if (runtime === undefined) return Promise.resolve();
    disposal.current ??= runtime.dispose();
    return disposal.current;
  }, []);

  useEffect(() => {
    const generation = ++mountGeneration.current;
    if (!attempted.current) {
      attempted.current = true;
      try {
        const runtime = createRuntime();
        runtimeRef.current = runtime;
        setState({ status: "ready", runtime });
      } catch (cause) {
        setState({
          status: "failure",
          message: cause instanceof Error ? cause.message : String(cause),
        });
      }
    }
    return () => {
      queueMicrotask(() => {
        if (mountGeneration.current === generation) void dispose();
      });
    };
  }, [createRuntime, dispose]);

  const close = useCallback(() => {
    if (state.status !== "ready") return;
    setState({ status: "closing" });
    void dispose().then(() => {
      if (closeNotified.current) return;
      closeNotified.current = true;
      onDisposed();
    });
  }, [dispose, onDisposed, state.status]);

  return { state, close };
};
