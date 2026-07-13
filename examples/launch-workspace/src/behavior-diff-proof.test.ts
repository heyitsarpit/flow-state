import { Option } from "effect";
import { describe, expect, it } from "vite-plus/test";

import * as flow from "flow-state";
import {
  buildBehaviorContract,
  diffBehaviorContracts,
  renderBehaviorDiff,
} from "flow-state/inspect";

import { canRequestApproval } from "./launchWorkspaceGuards";
import {
  LaunchWorkspaceApp,
  LaunchWorkspaceModule,
  launchWorkspaceMachine,
  launchWorkspaceStories,
  saveLaunchProjectTransaction,
} from "./launchWorkspaceAssembly";

function createChangedLaunchWorkspaceMachine() {
  const readyState = launchWorkspaceMachine.config.states.ready;
  const saveConflictState = launchWorkspaceMachine.config.states.saveConflict;
  const requestApprovalTransition = readyState.on?.REQUEST_APPROVAL;

  if (
    requestApprovalTransition === undefined ||
    typeof requestApprovalTransition === "string" ||
    Array.isArray(requestApprovalTransition)
  ) {
    throw new Error("Expected a single REQUEST_APPROVAL transition in the proof app.");
  }

  const blockedApprovalBranch: typeof requestApprovalTransition = {
    target: "saveConflict",
    guard: ({ snapshot }) => !canRequestApproval({ snapshot }),
  };

  return Object.freeze({
    ...launchWorkspaceMachine,
    config: {
      ...launchWorkspaceMachine.config,
      states: {
        ...launchWorkspaceMachine.config.states,
        ready: {
          ...readyState,
          on: {
            ...readyState.on,
            REQUEST_APPROVAL: [requestApprovalTransition, blockedApprovalBranch],
          },
        },
        saveConflict: {
          ...saveConflictState,
          on: {
            ...saveConflictState.on,
            RUN_ASSISTANT: {
              target: "runningAssistant",
              update: () => ({ lastTraceEvent: Option.some("assistant:resume") }),
            },
          },
        },
      },
    },
  });
}

function createChangedSaveProjectTransaction() {
  const params = saveLaunchProjectTransaction.config.params;

  if (params === undefined) {
    throw new Error("Expected launch.save-project to define a params selector.");
  }

  return flow.transaction({
    ...saveLaunchProjectTransaction.config,
    params,
    routes: {
      ...saveLaunchProjectTransaction.config.routes,
      interrupt: ["PROJECT_SAVE_FAILED", "error"],
    },
  });
}

function createChangedLaunchWorkspaceApp() {
  const changedMachine = createChangedLaunchWorkspaceMachine();
  const changedSaveProject = createChangedSaveProjectTransaction();
  const changedLaunchWorkspaceModule = flow.module(
    "LaunchWorkspace",
    {
      resources: LaunchWorkspaceModule.resources,
      transactions: {
        ...LaunchWorkspaceModule.transactions,
        saveProject: changedSaveProject,
      },
      machines: {
        ...LaunchWorkspaceModule.machines,
        workspace: changedMachine,
      },
      views: LaunchWorkspaceModule.views,
      fixtures: LaunchWorkspaceModule.fixtures,
    },
    LaunchWorkspaceModule.meta,
  );

  return flow.app({
    modules: Object.freeze(
      LaunchWorkspaceApp.modules.map((module) =>
        module.id === "LaunchWorkspace" ? changedLaunchWorkspaceModule : module,
      ),
    ),
  });
}

describe("launch workspace behavior diff proof", () => {
  it("reports proof-app transition, guard-branch, and transaction-lane changes with new obligations", () => {
    const base = buildBehaviorContract({
      app: LaunchWorkspaceApp,
      stories: [launchWorkspaceStories],
    });
    const changed = buildBehaviorContract({
      app: createChangedLaunchWorkspaceApp(),
      stories: [launchWorkspaceStories],
    });

    const diff = diffBehaviorContracts(base, changed, {
      moduleId: "LaunchWorkspace",
    });
    const output = renderBehaviorDiff(diff);

    expect(diff.summary.changedSections).toEqual([
      "machines",
      "transactions",
      "coverage-obligations",
    ]);
    expect(diff.machines.changed.map((change) => change.id)).toEqual(["launch-workspace"]);
    expect(
      diff.machines.changed[0]?.transitionChanges.added.map((transition) => transition.id),
    ).toEqual(["ready:REQUEST_APPROVAL:1", "saveConflict:RUN_ASSISTANT:0"]);
    expect(diff.transactions.changed.map((change) => change.id)).toEqual(["launch.save-project"]);
    expect(diff.coverageObligations.added.map((obligation) => obligation.id)).toEqual(
      expect.arrayContaining([
        "launch-workspace transition ready:REQUEST_APPROVAL:1",
        "launch-workspace transition saveConflict:RUN_ASSISTANT:0",
        "launch.save-project outcome interrupt",
      ]),
    );
    expect(
      diff.coverageObligations.added
        .filter((obligation) =>
          [
            "launch-workspace transition ready:REQUEST_APPROVAL:1",
            "launch-workspace transition saveConflict:RUN_ASSISTANT:0",
            "launch.save-project outcome interrupt",
          ].includes(obligation.id),
        )
        .map((obligation) => obligation.proofStatus),
    ).toEqual(["needs-proof", "needs-proof", "needs-proof"]);
    expect(output).toContain("# Behavior Diff (module slice: LaunchWorkspace)");
    expect(output).toContain("- Still unproved additions:");
    expect(output).toContain("ready:REQUEST_APPROVAL:1");
    expect(output).toContain("saveConflict:RUN_ASSISTANT:0");
    expect(output).toContain("launch.save-project outcome interrupt");
  });
});
