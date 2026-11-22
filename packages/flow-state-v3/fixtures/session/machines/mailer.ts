import { Schema } from "effect";
import { actorRef, definition, Flow, machine, send } from "../../../src/index.ts";
import { Inbox, InboxMachine } from "./inbox.ts";

/**
 * How many messages one newsletter run sends.
 */
export const NEWSLETTER = 1000;

const inbox = () => actorRef(InboxMachine, "main");

/**
 * A newsletter mailer, named by its list: a run sends every subscriber's copy to the main inbox
 * in one turn, so a thousand messages wait in one mailbox.
 */
export const Mailer = definition({
  id: "Workspace/Mailer",
  states: ["READY"],
  events: { Run: {} },
  memory: { list: Flow.input(Schema.String), runs: Flow.initial(Schema.Number, 0) },
});

/**
 * The mailer: each run counts, and sends its thousand copies in order.
 */
export const MailerMachine = machine(Mailer, ({ S }) => ({
  default: S.READY,
  on: {
    Run: {
      updateMemory: ({ memory }) => ({ runs: memory.runs + 1 }),
      actions: Array.from({ length: NEWSLETTER }, (_, n) =>
        send(
          inbox,
          Inbox.E.Arrive.from(({ memory }) => ({
            id: `${memory.list}-${String(memory.runs)}-${String(n)}`,
            from: memory.list,
            at: n,
            replyTo: "",
          })),
        ),
      ),
    },
  },
}));
