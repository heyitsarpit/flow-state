"use client";

import { useEffect, useRef } from "react";

import { FlowProvider } from "@flow-state/core";
import type { FlowRuntimeBootPayload } from "@flow-state/core";

import {
  createLaunchWorkspaceBrowserRuntime,
  launchWorkspaceActorId,
  launchWorkspaceSeed,
} from "../src/launchWorkspace";
import { LaunchWorkspaceShell } from "../src/launchWorkspaceShell";

type LaunchWorkspaceClientProps = Readonly<{
  readonly boot?: FlowRuntimeBootPayload;
}>;

export function LaunchWorkspaceClient({ boot }: LaunchWorkspaceClientProps) {
  const runtimeRef = useRef<ReturnType<typeof createLaunchWorkspaceBrowserRuntime> | null>(null);
  const workspaceSnapshotRef = useRef(
    boot?.actors.find((actor) => actor.id === launchWorkspaceActorId)?.snapshot,
  );

  if (runtimeRef.current === null) {
    const runtime = createLaunchWorkspaceBrowserRuntime();
    if (boot === undefined) {
      runtime.resources.seedResources(launchWorkspaceSeed);
    } else {
      runtime.hydrateBoot(boot);
    }
    runtimeRef.current = runtime;
  }

  const runtime = runtimeRef.current;

  useEffect(() => {
    return () => {
      void runtime.dispose();
    };
  }, [runtime]);

  return (
    <FlowProvider runtime={runtime}>
      <LaunchWorkspaceShell
        {...(workspaceSnapshotRef.current === undefined
          ? {}
          : { workspaceSnapshot: workspaceSnapshotRef.current })}
      />
    </FlowProvider>
  );
}
