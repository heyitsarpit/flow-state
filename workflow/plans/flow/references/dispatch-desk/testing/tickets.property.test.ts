// The entity property test (entity-domain.md section 8): random interleavings of writes,
// pushes, failures, reordered and lost responses, checked against C1 to C8. The oracle is the
// demo server itself, so a filter, order or side effect the domain forgets shows as a failure.
import { test } from "vite-plus/test";
import { propertyTest } from "flow-state/testing";
import { DemoTicketApi } from "../app/demo-api.js";
import { TicketsDomain } from "../features/Tickets/ticket.domain.js";

const workspace = { workspaceId: "north" };

test("tickets converge", () =>
  propertyTest([TicketsDomain], {
    fixture: DemoTicketApi,
    // Resource keys are TypeScript types, so the read inputs to probe are listed explicitly.
    inputs: {
      ticketById: [
        { workspaceId: "north", ticketId: "T-42" },
        { workspaceId: "north", ticketId: "T-43" },
      ],
      list: [
        workspace,
        { ...workspace, status: "open" },
        { ...workspace, assignee: "dispatcher-7" },
        { ...workspace, search: "lobby" },
      ],
      openCount: [workspace],
    },
    seed: 1,
    runs: 50,
    steps: 40,
  }));
