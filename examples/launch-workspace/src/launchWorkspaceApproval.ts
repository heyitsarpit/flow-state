import { Option } from "effect";

import * as flow from "flow-state";
import type { FlowEvent } from "flow-state";

import { fixturePermissions } from "./domain";
import type { ApprovalRequest, Permissions } from "./domain";

export interface ApprovalContext {
  readonly permissions: Permissions;
  readonly request: Option.Option<ApprovalRequest>;
  readonly denied: Option.Option<string>;
}

type ApprovalState = "draft" | "submitting" | "denied";
type ApprovalEvent =
  | ({ readonly type: "REQUEST_APPROVAL" } & FlowEvent)
  | ({ readonly type: "APPROVAL_DENIED"; readonly reason: string } & FlowEvent);

const approvalFlow = flow.machine<ApprovalContext, ApprovalEvent, ApprovalState>({
  id: "Approval.flow",
  initial: "draft",
  context: () => ({
    permissions: fixturePermissions,
    request: Option.none(),
    denied: Option.none(),
  }),
  states: {
    draft: {
      on: {
        REQUEST_APPROVAL: {
          target: "submitting",
          guard: ({ context }) =>
            context.permissions.canRequestApproval && Option.isSome(context.request),
        },
      },
    },
    submitting: {
      on: {
        APPROVAL_DENIED: {
          target: "denied",
          update: ({ event }) =>
            event.type === "APPROVAL_DENIED" ? { denied: Option.some(event.reason) } : {},
        },
      },
    },
    denied: {},
  },
});

export const Approval = flow.module(
  "Approval",
  {
    flow: approvalFlow,
    machines: { flow: approvalFlow },
  },
  {
    dependencies: ["Session", "Project"],
    tags: ["approval"],
    screens: ["Approval"],
    fixtures: ["launchWorkspaceSeed.approval"],
    permissions: ["requestApproval"],
  },
);
