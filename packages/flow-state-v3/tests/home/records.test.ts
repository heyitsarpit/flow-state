import { describe, expect, it } from "vite-plus/test";
import { loungeBeforeDevices } from "../../fixtures/home/stories/edges.ts";
import { lounge } from "../../fixtures/home/stories/usual.ts";
import { played } from "../rules/played.ts";

// Owner: the full record decoding Task (Records R12's reference table). Today a record whose
// memory lacks a field the definition has since added is quarantined and the room starts fresh.
describe("a record saved before a memory field was added (Records R12, its reference table)", () => {
  it.fails("Records R12: a memory field the record lacks starts at its declared initial value, and the rest of the record restores", async () => {
    const run = await played(loungeBeforeDevices);
    const snapshot = run.checkpoints.restored.read(lounge);

    expect({ state: snapshot?.state, devices: snapshot?.memory.devices }).toEqual({
      state: "ONLINE.IDLE",
      devices: [],
    });
  });
});
