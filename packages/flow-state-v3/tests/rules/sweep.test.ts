import { describe, it } from "vite-plus/test";
import { checked } from "./rules.ts";
import { slices } from "./sweep.ts";

describe("run rules", () => {
  it("every fixture Story but the stress ones keeps every rule", async () => {
    for (const story of slices.rest) {
      // oxlint-disable-next-line no-await-in-loop -- one run at a time: each Story is its own world
      checked(await story.run());
    }
  });
});
