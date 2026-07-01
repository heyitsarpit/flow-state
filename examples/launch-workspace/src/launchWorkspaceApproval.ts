import { Option } from "effect";

import { flow } from "@flow-state/server";
import type { FlowEvent } from "@flow-state/server";

import { fixturePermissions } from "./domain";
import type { ApprovalRequest, Permissions } from "./domain";

interface ApprovalContext {
  readonly permissions: Permissions;
  readonly request: Option.Option<ApprovalRequest>;
  readonly denied: Option.Option<string>;
}

type ApprovalState = "draft" | "submitting" | "denied";
type ApprovalEvent =
  | ({ readonly type: "REQUEST_APPROVAL" } & FlowEvent)
  | ({ readonly type: "APPROVAL_DENIED"; readonly reason: string } & FlowEvent);

const approvalPersist = flow.persist({
  id: "Approval.persisted",
  version: 1,
  redact: (value: unknown) =>
    typeof value === "object" && value !== null && "customerNote" in value
      ? { redacted: true }
      : value,
});

const approvalPermission = flow.permission({
  id: "Approval.request",
  check: ({ context }: { readonly context: ApprovalContext }) =>
    context.permissions.canRequestApproval && Option.isSome(context.request),
});

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
  () => ({
    flow: approvalFlow,
    persist: approvalPersist,
    permission: approvalPermission,
    machines: { flow: approvalFlow },
    policies: { permission: approvalPermission },
  }),
  {
    dependencies: ["Session", "Project"],
    tags: ["approval"],
    screens: ["Approval"],
    fixtures: ["launchWorkspaceSeed.approval"],
    permissions: ["requestApproval"],
  },
);
