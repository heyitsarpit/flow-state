import { describe, expectTypeOf, it } from "vite-plus/test";
import { Thread } from "../../fixtures/chat/machines/thread.ts";
import { deleteMessage, send } from "../../fixtures/chat/operations/writes.ts";
import type { Ending, MapperContext } from "../../src/index.ts";

// Operations R2 and DerivedTypes: an ending mapper takes `(value, { input, key })`, the context
// typed from its contract as `MapperContext<I, Pick<I, Key[number]>>`, with no annotation: the
// first mapper reads both with no directive, and the second is refused for reading `text`, which is
// in the send's input, not its key `["thread"]`.

describe("Operations R2: an ending mapper's context is inferred from its contract", () => {
  it("a delete's mapper reads its input and its key, both typed", () => {
    deleteMessage.outcomes({
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

    expectTypeOf<Parameters<typeof send.outcomes>[0]["success"]>().toEqualTypeOf<
      Ending<
        { readonly id: string; readonly thread: string; readonly author: string },
        string,
        MapperContext<
          { readonly thread: string; readonly clientId: string; readonly text: string },
          { readonly thread: string }
        >
      >
    >();
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
