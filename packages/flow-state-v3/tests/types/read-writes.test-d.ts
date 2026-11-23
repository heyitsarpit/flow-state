import { describe, expectTypeOf, it } from "vite-plus/test";
import { Thread } from "../../fixtures/chat/machines/thread.ts";
import { history } from "../../fixtures/chat/operations/reads.ts";
import { send } from "../../fixtures/chat/operations/writes.ts";
import type { Message } from "../../fixtures/chat/services.ts";
import type { ReadWrite, WriteOptions } from "../../src/index.ts";

// Plan Operations O3, O5: a read change is named by its contract, `history.write(key, data)`, with
// its key typed by the read's key fields and its data by the read's value, a value or an update of
// the current one; `writes` reads the success value and the input, typed from the write's contract.
// Each pin is two-sided: the right shape needs no annotation, a wrong one does not compile.

type History = { readonly messages: ReadonlyArray<typeof Message.Type> };

describe("Plan Operations O3, O5: read changes are typed by their read", () => {
  it("a change's key is the read's key, and its data the read's value or an update of it", () => {
    expectTypeOf(history.write).parameter(0).toEqualTypeOf<{ readonly thread: string }>();
    expectTypeOf(history.write)
      .parameter(1)
      .toEqualTypeOf<History | ((current: History) => History)>();
    expectTypeOf(history.write).returns.toEqualTypeOf<ReadWrite>();

    // @ts-expect-error Plan Operations O5: `clientId` is not the history's key
    history.write({ clientId: "c-1" }, { messages: [] });
    // @ts-expect-error Plan Operations O5: an update returns the read's value
    history.write({ thread: "general" }, (current) => current.messages);
  });

  it("an operation's `writes` reads its success value and input, typed by its contract", () => {
    send.outcomes(
      {
        success: Thread.E.Sent.from((v, { input }) => ({ clientId: input.clientId, id: v.id })),
        failure: {},
        unknown: Thread.E.SendUnsure,
      },
      {
        writes: ({ value, input }) => {
          expectTypeOf(value).toEqualTypeOf<{
            readonly id: string;
            readonly thread: string;
            readonly author: string;
          }>();
          expectTypeOf(input.text).toEqualTypeOf<string>();

          return [history.write({ thread: value.thread }, { messages: [] })];
        },
      },
    );

    expectTypeOf<Parameters<typeof send.outcomes>[1]>().toEqualTypeOf<
      WriteOptions<
        { readonly id: string; readonly thread: string; readonly author: string },
        { readonly thread: string; readonly clientId: string; readonly text: string }
      >
    >();

    send.outcomes(
      {
        success: Thread.E.Sent.from((v, { input }) => ({ clientId: input.clientId, id: v.id })),
        failure: {},
        unknown: Thread.E.SendUnsure,
      },
      // @ts-expect-error Plan Operations O3: `writes` returns read changes, not values
      { writes: ({ value }) => [{ thread: value.thread }] },
    );
  });
});
