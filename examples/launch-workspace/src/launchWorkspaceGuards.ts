import type { FlowSnapshot } from "@flow-state/core/server";

import { fixtureApproval, fixturePermissions } from "./domain";
import type { ApprovalRequest, Permissions } from "./domain";
import type { LaunchWorkspaceContext, LaunchWorkspaceState } from "./launchWorkspace";

export function canSaveProject({
  context,
  snapshot,
}: {
  readonly context?: LaunchWorkspaceContext;
  readonly snapshot?: FlowSnapshot<LaunchWorkspaceContext, LaunchWorkspaceState>;
}): boolean {
  const currentContext = context ?? snapshot?.context;
  const permissions =
    snapshot === undefined
      ? fixturePermissions
      : resourceValue<Permissions>(snapshot.resources, "launch.permissions");
  return (
    currentContext?.connection === "online" &&
    permissions !== undefined &&
    permissions.canEditProject &&
    (currentContext?.draft.name.trim().length ?? 0) > 0
  );
}

export function canRequestApproval({
  context,
  snapshot,
}: {
  readonly context?: LaunchWorkspaceContext;
  readonly snapshot?: FlowSnapshot<LaunchWorkspaceContext, LaunchWorkspaceState>;
}): boolean {
  void context;
  const permissions =
    snapshot === undefined
      ? fixturePermissions
      : resourceValue<Permissions>(snapshot.resources, "launch.permissions");
  const approval =
    snapshot === undefined
      ? fixtureApproval
      : resourceValue<ApprovalRequest>(snapshot.resources, "launch.approval");
  return (
    permissions !== undefined &&
    approval !== undefined &&
    permissions.canRequestApproval &&
    approval.status === "draft"
  );
}

export function resourceValue<TValue>(
  resources: Readonly<Record<string, { readonly id?: string; readonly value?: unknown }>>,
  id: string,
): TValue | undefined {
  const resource = Object.values(resources).find((entry) => "id" in entry && entry.id === id);
  return resource?.value as TValue;
}
