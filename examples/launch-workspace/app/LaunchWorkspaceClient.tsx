"use client";

import { useEffect, useState } from "react";

import { FlowProvider } from "flow-state/react";

import { launchWorkspaceActorId } from "../src/launchWorkspaceAssembly";
import { createLaunchWorkspaceBrowserRuntime } from "../src/launchWorkspaceBrowserRuntime";
import { launchWorkspaceSeed } from "../src/launchWorkspaceResources";
import type { LaunchWorkspaceBoot } from "../src/launchWorkspaceServer";
import { LaunchWorkspaceShell } from "../src/launchWorkspaceShell";

type LaunchWorkspaceClientProps = Readonly<{
  readonly boot?: LaunchWorkspaceBoot;
  readonly createRuntime?: typeof createLaunchWorkspaceBrowserRuntime;
}>;

type LaunchWorkspaceClientState =
  | Readonly<{ readonly kind: "fallback" }>
  | Readonly<{
      readonly kind: "ready";
      readonly boot: LaunchWorkspaceBoot | undefined;
      readonly createRuntime: typeof createLaunchWorkspaceBrowserRuntime;
      readonly runtime: ReturnType<typeof createLaunchWorkspaceBrowserRuntime>;
      readonly workspaceSnapshot: LaunchWorkspaceBoot["actors"][number]["snapshot"] | undefined;
    }>
  | Readonly<{
      readonly kind: "failure";
      readonly boot: LaunchWorkspaceBoot | undefined;
      readonly createRuntime: typeof createLaunchWorkspaceBrowserRuntime;
    }>;

export function LaunchWorkspaceClient({
  boot,
  createRuntime = createLaunchWorkspaceBrowserRuntime,
}: LaunchWorkspaceClientProps) {
  const [state, setState] = useState<LaunchWorkspaceClientState>({ kind: "fallback" });

  useEffect(() => {
    let active = true;
    let runtime: ReturnType<typeof createLaunchWorkspaceBrowserRuntime> | undefined;
    let disposePromise: Promise<void> | undefined;
    const disposeOnce = () => {
      if (runtime === undefined) {
        return Promise.resolve();
      }
      disposePromise ??= runtime.dispose();
      return disposePromise;
    };

    try {
      runtime = createRuntime();
      let workspaceSnapshot: LaunchWorkspaceBoot["actors"][number]["snapshot"] | undefined;
      if (boot === undefined) {
        runtime.resources.seedResources(launchWorkspaceSeed);
      } else {
        const hydrated = runtime.hydrateBoot(boot);
        workspaceSnapshot = hydrated.actorSnapshot(launchWorkspaceActorId);
      }

      if (active) {
        setState({ kind: "ready", boot, createRuntime, runtime, workspaceSnapshot });
      } else {
        void disposeOnce();
      }
    } catch {
      void disposeOnce();
      if (active) {
        setState({ kind: "failure", boot, createRuntime });
      }
    }

    return () => {
      active = false;
      void disposeOnce();
    };
  }, [boot, createRuntime]);

  const currentState =
    state.kind !== "fallback" && state.boot === boot && state.createRuntime === createRuntime
      ? state
      : ({ kind: "fallback" } as const);

  if (currentState.kind === "fallback") {
    return <main aria-busy="true">Preparing Launch Workspace…</main>;
  }

  if (currentState.kind === "failure") {
    return <main role="alert">Launch Workspace unavailable.</main>;
  }

  return (
    <FlowProvider runtime={currentState.runtime}>
      <LaunchWorkspaceShell
        {...(currentState.workspaceSnapshot === undefined
          ? {}
          : { workspaceSnapshot: currentState.workspaceSnapshot })}
      />
    </FlowProvider>
  );
}
