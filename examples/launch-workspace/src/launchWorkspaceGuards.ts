import type { FlowResourceSnapshot, FlowSnapshot } from "flow-state";

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
      : authoritativeResourceValue<Permissions>(snapshot.resources, "launch.permissions");
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
      : authoritativeResourceValue<Permissions>(snapshot.resources, "launch.permissions");
  const approval =
    snapshot === undefined
      ? fixtureApproval
      : authoritativeResourceValue<ApprovalRequest>(snapshot.resources, "launch.approval");
  return (
    permissions !== undefined &&
    approval !== undefined &&
    permissions.canRequestApproval &&
    approval.status === "draft"
  );
}

export function resourceValue<TValue>(
  resources: Readonly<Record<string, FlowResourceSnapshot>>,
  id: string,
): TValue | undefined {
  const resource = resourceSnapshot(resources, id);
  return resource?.availability === "value" ? (resource.value as TValue) : undefined;
}

function authoritativeResourceValue<TValue>(
  resources: Readonly<Record<string, FlowResourceSnapshot>>,
  id: string,
): TValue | undefined {
  const resource = resourceSnapshot(resources, id);
  return resource?.availability === "value" && !resource.isPlaceholderData
    ? (resource.value as TValue)
    : undefined;
}

function resourceSnapshot(
  resources: Readonly<Record<string, FlowResourceSnapshot>>,
  id: string,
): FlowResourceSnapshot | undefined {
  return Object.values(resources).find((entry) => entry.id === id);
}
