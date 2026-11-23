/* oxlint-disable flow-state/paired-refusals -- each refusal's positive is the chat fixture's Thread, whose mappers read `{ input, key }` under their own directives, which flip with the first line here */
import { describe, expectTypeOf, it } from "vite-plus/test";
import { Thread } from "../../fixtures/chat/machines/thread.ts";
import { deleteMessage, send } from "../../fixtures/chat/operations/writes.ts";
import type { MapperContext } from "../../src/index.ts";

// Operations R2 and DerivedTypes: an ending mapper takes `(value, { input, key })`, the context
// typed from its contract as `MapperContext<I, Pick<I, Key[number]>>`, with no annotation. Both
// lines below are inverted: today a mapper takes one parameter, so each needs the directive; once
// mappers take the context, the first loses its directive and the second keeps it for its own
// reason (`text` is in the send's input, not its key `["thread"]`).

describe("Operations R2: an ending mapper's context is inferred from its contract", () => {
  it("a delete's mapper reads its input and its key, both typed", () => {
    deleteMessage.outcomes({
      // @ts-expect-error Operations R2 (inverted): a mapper takes one parameter today
      success: Thread.E.Deleted.from((v, ctx) => ({
        messageId: ctx.key.messageId,
        undo: ctx.input.thread + v.undo,
      })),
      failure: { Gone: Thread.E.DeleteFailed.from(() => ({ messageId: "" })) },
      unknown: Thread.E.DeleteUnsure,
    });
  });

  it("a key holds only the contract's key fields", () => {
    send.outcomes({
      // @ts-expect-error Operations R2: `text` is in the send's input, not its key
      success: Thread.E.Sent.from((v, { key }) => ({ clientId: key.text, id: v.id })),
      failure: {},
      unknown: Thread.E.SendUnsure,
    });
  });

  it("the context type is the input and the picked key", () => {
    expectTypeOf<
      MapperContext<{ thread: string; text: string }, { thread: string }>
    >().toEqualTypeOf<{
      readonly input: { thread: string; text: string };
      readonly key: { thread: string };
    }>();
  });
});
