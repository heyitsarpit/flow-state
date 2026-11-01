// The wizard's and the visit's checks (`@flow-state/vitest`, proposed; editor/editor.test.ts says what `at` is).
import { storyTest } from "@flow-state/vitest"; // NEW (proposed)
import { Story } from "flow-state/testing";
import { expect } from "vite-plus/test";
import { Desk } from "../../testing/desk.fake.js";
import { ResolveWizard } from "./resolve-wizard.subroutine.js";
import { Visit } from "./visit.definition.js";
import { Signature } from "./signature.trait.js";
import {
  checkedAgain,
  lateAfterLeaving,
  leftMidResolve,
  partsReleased,
  resolved,
  signatureMissing,
  steppedBack,
  T42,
  wizardAlone,
  wizardRefused,
} from "./resolve.story.js";

const W = ResolveWizard.S;

const { S, O } = Visit;

storyTest(wizardAlone, ({ at }) => {
  expect(at.reason.state).toBe(W.STEPS.REASON);
  expect(at.parts.state).toBe(W.STEPS.PARTS);
  expect(at.parts.memory.lines).toMatchObject([{ key: "BULB-40W", available: 12 }]); // a PartLine copy (F4)
  expect(at.parts.read(Story.records("callback", { name: "onPartAdded" }))).toMatchObject([
    { payload: { partNumber: "BULB-40W" } },
  ]);
  expect(at["back-to-reason"].state).toBe(W.STEPS.REASON);
  expect(at["confirm-discard"].state).toBe(W.DISCARD);
  expect(at.kept.state).toBe(W.STEPS.PARTS); // `.history`: the step Cancel came from, with its lines
  expect(at.kept.read(Story.records("exit", { instance: ["DISCARD"] }))).toMatchObject([
    { name: "Kept" },
  ]);
  expect(at.exited.read(Story.records("exit", { instance: [] }))).toMatchObject([
    {
      name: "Resolved",
      payload: {
        resolution: { reason: "Bulb replaced", parts: ["BULB-40W"], signatureRef: "sig-1" },
      },
    },
  ]);
  // `steps` is private (F19): Stories see it, hosts and views do not.
  expect(
    at.exited.read(Story.records("callback", { name: "onProgressed" })).map((r) => r.payload.step),
  ).toEqual(["parts", "reason", "parts", "signoff"]);
});

storyTest(wizardRefused, ({ at }) => {
  expect(
    at.refused.read(Story.records("verdict", { event: ResolveWizard.E.Submit })),
  ).toMatchObject([
    { result: { _tag: "Denied", reasons: [{ code: "NotAssignedToYou" }] } }, // `denials` names it (F19)
  ]);
});

storyTest(resolved, ({ at }) => {
  // The signature's bare write: `pending` and `progress` on the step's row, no ending event.
  expect(Signature.O.upload.get(at.signing.read(), { ref: "sig-1" })).toMatchObject({
    pending: true,
    progress: { sent: 2_048, total: 2_048 },
  });
  expect(at.resolved.state).toBe(S.RESOLVED);
  expect(at.resolved.read(Desk.reservePart)).toMatchObject([{ input: { partNumber: "BULB-40W" } }]);
  expect(at.resolved.read(Desk).desk.tickets.find((t) => t.ticketId === "T-42")?.status).toBe(
    "closed",
  );
});

storyTest(signatureMissing, ({ at }) => {
  expect(at["sign-again"].state).toBe(S.RESOLVING.STEPS.REASON); // back into the wizard: a fresh entry
  expect(at["sign-again"].memory.notice).toBe("The signature didn't upload. Sign again.");
});

storyTest(steppedBack, ({ at }) => {
  expect(at.jumped.state).toBe(S.RESOLVING.STEPS.REASON);
  expect(at.jumped.memory.step).toBe("reason"); // `onProgressed` drives the bar back
});

storyTest(partsReleased, ({ at }) => {
  expect(at["parts-released"].state).toBe(S.ON_SITE);
  expect(at["parts-released"].read(Desk.releaseParts)).toMatchObject([
    { input: { ...T42, partNumbers: ["BULB-40W"] } },
  ]);
  expect(
    at["parts-released"].read(Desk).desk.parts.find((p) => p.partNumber === "BULB-40W")?.reserved,
  ).toBe(0);
});

storyTest(leftMidResolve, ({ at }) => {
  expect(at["left-mid-resolve"].state).toBe(S.ON_SITE);
  expect(at["left-mid-resolve"].memory.draft).toMatchObject({
    reason: "Bulb replaced",
    parts: [{ partNumber: "BULB-40W" }],
  });
  expect(at.resumed.memory.RESOLVING).toMatchObject({ reason: "Bulb replaced" }); // seeded from the draft
});

storyTest(lateAfterLeaving, ({ at }) => {
  expect(at.late.state).toBe(S.ON_SITE); // a late ending never moves the screen
  expect(at.late.read(Story.records("ending", { operation: O.resolve }))).toMatchObject([
    { channel: "success", route: { kind: "late" } },
  ]);
  expect(at.late.memory.notice).toBe("Resolved");
});

storyTest(checkedAgain, ({ at }) => {
  expect(O.resolve.get(at.unconfirmed, T42).uncertain).toBe(true);
  expect(at.unconfirmed.memory.notice).toBe("We couldn't confirm the resolution");
  expect(at.confirmed.read(Desk.resolve).map((r) => r.input.key)).toHaveLength(2); // the same Attempt, twice
  expect(O.resolve.get(at.confirmed, T42).uncertain).toBe(false);
});
