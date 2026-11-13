// The Customer tab: the ticket's customer as the roster's `Customer` record. A trait with a read and no write: its
// placement is released when the tab is frozen and placed again on thaw, from the thawed memory (rule 52).
import { Schema } from "effect";
import { Flow, trait } from "flow-state";
import { RosterDomain } from "../../Roster/roster.domain.js";

export const CustomerCard = trait(
  {
    id: "CustomerCard",
    memory: {
      workspaceId: Flow.input(Schema.String),
      customerId: Flow.input(Schema.NullOr(Schema.String)),
    },
    operations: () => ({ customers: RosterDomain.customers }), // bare: the card reads `Customer.get`
  },
  ({ O }) => ({
    activities: [
      O.customers.subscribe(({ memory }) => ({ workspaceId: memory.workspaceId }), {
        when: ({ memory }) => memory.customerId !== null,
      }),
    ],
  }),
);
