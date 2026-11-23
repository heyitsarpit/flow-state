import { Option } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { benches } from "../../bench/benches/index.ts";
import { manifests } from "../../fixtures/index.ts";
import { LIMITS } from "../limits.ts";

// The proofs run the Stories the benches time, saved stress Stories among them, so they run with
// the stress files.
describe("bench proofs", () => {
  it("every manifest's saved stress Story has a turn bench", () => {
    const ids = new Set(benches.map((b) => b.id));

    for (const m of manifests)
      expect(ids.has(`turn.${m.savedStress.story.id.replace("/", ".")}.per-turn-ms`)).toBe(true);
  });

  it(
    "every bench's proof passes: it does the work it claims",
    async () => {
      for (const b of benches) {
        const subject = await b.load();

        expect({ id: b.id, problem: await subject.proof() }).toEqual({
          id: b.id,
          problem: Option.none(),
        });
      }
    },
    LIMITS.benchProofs,
  );
});
