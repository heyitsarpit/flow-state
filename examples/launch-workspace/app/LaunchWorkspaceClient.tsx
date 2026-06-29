"use client";

import { useEffect, useRef } from "react";

import { FlowProvider } from "@flow-state/core";

import { createLaunchWorkspaceBrowserRuntime, launchWorkspaceSeed } from "../src/launchWorkspace";
import { LaunchWorkspaceShell } from "../src/launchWorkspaceShell";

export function LaunchWorkspaceClient() {
  const runtimeRef = useRef<ReturnType<typeof createLaunchWorkspaceBrowserRuntime> | null>(null);

  if (runtimeRef.current === null) {
    const runtime = createLaunchWorkspaceBrowserRuntime();
    runtime.resources.seedResources(launchWorkspaceSeed);
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
      <LaunchWorkspaceShell />
    </FlowProvider>
  );
}
