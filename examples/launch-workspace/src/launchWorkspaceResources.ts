import { Effect, Option } from "effect";

import { createKey, createTag } from "flow-state";
import * as flow from "flow-state";
import type { FlowSeededResource } from "flow-state";

import {
  fixtureApproval,
  fixturePermissions,
  fixtureProject,
  fixtureProjectId,
  LaunchAssetId,
} from "./domain";
import type {
  ApprovalRequest,
  LaunchAsset,
  LaunchProject,
  LaunchProjectId,
  Permissions,
  ReadinessMetric,
} from "./domain";

export const projectTag = createTag("launch:project");
export const readinessTag = createTag("launch:readiness");
export const approvalTag = createTag("launch:approval");

export const projectResource = flow.resource<[LaunchProjectId], LaunchProject>({
  id: "launch.project",
  key: (id) => createKey("launch", "project", id),
  lookup: (id) => Effect.succeed({ ...fixtureProject, id }),
  tags: () => [projectTag],
  placeholder: () => Option.some(fixtureProject),
  freshness: { staleAfter: "30 seconds", onInvalidate: "active" },
});

export const permissionsResource = flow.resource<[LaunchProjectId], Permissions>({
  id: "launch.permissions",
  key: (id) => createKey("launch", "permissions", id),
  lookup: () => Effect.succeed(fixturePermissions),
  tags: () => [createTag("launch:permissions")],
  placeholder: () => Option.some(fixturePermissions),
  freshness: { staleAfter: "30 seconds", onInvalidate: "active" },
});

export const readinessResource = flow.resource<[LaunchProjectId], readonly ReadinessMetric[]>({
  id: "launch.readiness",
  key: (id) => createKey("launch", "readiness", id),
  lookup: () =>
    Effect.succeed([
      { id: "traffic", label: "Traffic", score: 91, updatedAt: 1_000 },
      { id: "support", label: "Support", score: 84, updatedAt: 1_000 },
      { id: "legal", label: "Legal", score: 76, updatedAt: 1_000 },
    ]),
  tags: () => [readinessTag],
  freshness: { staleAfter: "15 seconds", onInvalidate: "active" },
});

export const assetsResource = flow.resource<[LaunchProjectId], readonly LaunchAsset[]>({
  id: "launch.assets",
  key: (id) => createKey("launch", "assets", id),
  lookup: (projectId) =>
    Effect.succeed([
      {
        id: LaunchAssetId("asset-1"),
        projectId,
        name: "Press kit.zip",
        size: 14_200_000,
        status: "uploaded",
      },
    ]),
  tags: () => [createTag("launch:assets")],
  freshness: { staleAfter: "30 seconds", onInvalidate: "active" },
});

export const approvalResource = flow.resource<[LaunchProjectId], ApprovalRequest>({
  id: "launch.approval",
  key: (id) => createKey("launch", "approval", id),
  lookup: () => Effect.succeed(fixtureApproval),
  tags: () => [approvalTag],
  placeholder: () => Option.some(fixtureApproval),
  freshness: { staleAfter: "30 seconds", onInvalidate: "active" },
});

export const launchWorkspaceSeed = [
  { ref: projectResource.ref(fixtureProjectId), value: fixtureProject },
  { ref: permissionsResource.ref(fixtureProjectId), value: fixturePermissions },
  {
    ref: readinessResource.ref(fixtureProjectId),
    value: [
      { id: "traffic", label: "Traffic", score: 91, updatedAt: 1_000 },
      { id: "support", label: "Support", score: 84, updatedAt: 1_000 },
      { id: "legal", label: "Legal", score: 76, updatedAt: 1_000 },
    ],
  },
  {
    ref: assetsResource.ref(fixtureProjectId),
    value: [
      {
        id: LaunchAssetId("asset-1"),
        projectId: fixtureProjectId,
        name: "Press kit.zip",
        size: 14_200_000,
        status: "uploaded",
      },
    ],
  },
  { ref: approvalResource.ref(fixtureProjectId), value: fixtureApproval },
] satisfies readonly FlowSeededResource[];
