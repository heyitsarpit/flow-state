"use client";

import { useEffect, useState } from "react";

import { FlowProvider } from "flow-state/react";

import { createOfflineClientRuntime } from "../app/runtime";
import { movieResource, outboxResource } from "../features/offline/resources";
import { emptyOutbox, fixtureMovie } from "../services/layers";
import { OfflineScreen } from "./OfflineScreen";

type OfflineRuntime = ReturnType<typeof createOfflineClientRuntime>;

export function OfflineRecoveryClient({
  createRuntime = createOfflineClientRuntime,
}: Readonly<{ readonly createRuntime?: () => OfflineRuntime }>) {
  const [runtime, setRuntime] = useState<OfflineRuntime>();

  useEffect(() => {
    const owner = createRuntime();
    owner.resources.seedResources([
      { ref: movieResource.ref("movie-1"), value: fixtureMovie },
      { ref: outboxResource.ref(), value: emptyOutbox },
    ]);
    setRuntime(owner);
    return () => void owner.dispose();
  }, [createRuntime]);

  return runtime === undefined ? (
    <main aria-busy="true">Restoring offline data…</main>
  ) : (
    <FlowProvider runtime={runtime}>
      <OfflineScreen />
    </FlowProvider>
  );
}
