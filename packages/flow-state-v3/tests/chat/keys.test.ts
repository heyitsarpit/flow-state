import { describe, expect, it } from "vite-plus/test";
import { general } from "../../fixtures/chat/app.ts";
import { newDeleteAfterReload } from "../../fixtures/chat/stories/usual.ts";
import { Chat } from "../../fixtures/chat/server/chat.ts";
import { played } from "../rules/played.ts";

// Operations R1 and I16: the Attempt id is the idempotency key, and an id minted in one boot is
// minted by no other, so a write after a reload never reuses a key the server saw before it.

describe("idempotency keys across boots (Operations R1, I16)", () => {
  it("Operations R1, I16, T4.7: a new delete after a reload carries a key no earlier delete carried", async () => {
    const run = await played(newDeleteAfterReload);
    const keys = run.checkpoints.deleted.read(Chat.remove).map((c) => c.input.key);

    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(2);
    expect(run.checkpoints.deleted.read(general)?.memory.messages).toEqual([]);
  });
});
