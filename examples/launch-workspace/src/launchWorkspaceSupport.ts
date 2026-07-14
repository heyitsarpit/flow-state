import { Option } from "effect";

import * as flow from "flow-state";
import type { FlowEvent } from "flow-state";

import type { LaunchAsset, LaunchChecklistItem } from "./domain";
import type { AssetUploadProgress } from "./services";
import { canRequestApproval, canSaveProject } from "./launchWorkspaceGuards";
import { permissionsResource, readinessResource } from "./launchWorkspaceResources";
import { uploadStream } from "./launchWorkspaceStreams";

export const Session = flow.module(
  "Session",
  {
    resources: {
      permissions: permissionsResource,
    },
    policies: {
      canSaveProject,
      canRequestApproval,
    },
  },
  {
    tags: ["session", "permissions"],
    screens: ["Overview", "Editor", "Approval"],
    fixtures: ["launchWorkspaceSeed.permissions"],
  },
);

export interface ChecklistContext {
  readonly items: readonly LaunchChecklistItem[];
}

type ChecklistEvent = { readonly type: "TOGGLE_CHECK"; readonly id: string } & FlowEvent;

const checklist = flow.machine<ChecklistContext, ChecklistEvent, "active">({
  id: "Checklist.checklist",
  initial: "active",
  context: () => ({
    items: [
      { id: "check-1", title: "Finalize copy", done: true },
      { id: "check-2", title: "Approve asset bundle", done: false },
    ],
  }),
  states: {
    active: {
      on: {
        TOGGLE_CHECK: {
          update: ({ context, event }) => ({
            items: context.items.map((item) =>
              item.id === event.id ? { ...item, done: !item.done } : item,
            ),
          }),
        },
      },
    },
  },
});

export const Checklist = flow.module(
  "Checklist",
  {
    checklist,
    machines: { checklist },
  },
  {
    tags: ["checklist"],
    screens: ["Overview"],
    fixtures: ["defaultChecklist"],
  },
);

const dashboardView = flow.view<
  unknown,
  string,
  { readonly metricStatus: string; readonly metricFreshness: string }
>({
  id: "Readiness.dashboardView",
  sources: ["resources"],
  select: ({ resources }) => ({
    metricStatus: resources[readinessResource.id]?.status ?? "idle",
    metricFreshness: resources[readinessResource.id]?.freshness ?? "fresh",
  }),
});

export const Readiness = flow.module(
  "Readiness",
  {
    metrics: readinessResource,
    dashboardView,
    resources: { metrics: readinessResource },
    views: { dashboardView },
  },
  {
    tags: ["readiness"],
    screens: ["Overview"],
    fixtures: ["launchWorkspaceSeed.readiness"],
  },
);

export interface AssetsContext {
  readonly assets: readonly LaunchAsset[];
  readonly latest: Option.Option<AssetUploadProgress>;
}

type AssetsState = "idle" | "uploading" | "complete";
type AssetsEvent =
  | ({ readonly type: "CHOOSE_ASSETS"; readonly assets: readonly LaunchAsset[] } & FlowEvent)
  | ({ readonly type: "START_UPLOAD" } & FlowEvent)
  | ({ readonly type: "UPLOAD_PROGRESS"; readonly progress: AssetUploadProgress } & FlowEvent)
  | ({ readonly type: "UPLOAD_DONE" } & FlowEvent);

const upload = flow.machine<AssetsContext, AssetsEvent, AssetsState>({
  id: "Assets.upload",
  initial: "idle",
  context: () => ({
    assets: [],
    latest: Option.none(),
  }),
  states: {
    idle: {
      on: {
        CHOOSE_ASSETS: {
          update: ({ event }) => (event.type === "CHOOSE_ASSETS" ? { assets: event.assets } : {}),
        },
        START_UPLOAD: "uploading",
      },
    },
    uploading: {
      invoke: uploadStream,
      on: {
        UPLOAD_PROGRESS: {
          update: ({ event }) =>
            event.type === "UPLOAD_PROGRESS" ? { latest: Option.some(event.progress) } : {},
        },
        UPLOAD_DONE: "complete",
      },
    },
    complete: {
      after: flow.after({ id: "Assets.dismissComplete", delay: "2 seconds", target: "idle" }),
    },
  },
});

export const Assets = flow.module(
  "Assets",
  {
    upload,
    uploadStream,
    machines: { upload },
    streams: { uploadStream },
  },
  {
    tags: ["assets"],
    screens: ["Assets"],
    fixtures: ["launchWorkspaceSeed.assets"],
  },
);
