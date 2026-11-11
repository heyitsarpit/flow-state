// The wizard's and the visit's checks (2.10.6): each test runs its Story once and destructures what it names. The
// wizard Story is a fragment alone (`state`, `memory`, `records`); the visit Stories are machine Stories.
import { expect, test } from "vite-plus/test";
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

test("the wizard walks its steps, Back, and the nested dialog", async () => {
  const { reason, parts, backToReason, confirmDiscard, kept, exited } = (await wizardAlone.run())
    .checkpoints;

  expect(reason.state).toBe(W.STEPS.REASON);
  expect(parts.state).toBe(W.STEPS.PARTS);
  expect(parts.memory.lines).toMatchObject([{ key: "BULB-40W", available: 12 }]); // a PartLine copy (F4)
  expect(parts.records("callback", { name: "onPartAdded" })).toMatchObject([
    { payload: { partNumber: "BULB-40W" } },
  ]);
  expect(backToReason.state).toBe(W.STEPS.REASON);
  expect(confirmDiscard.state).toBe(W.DISCARD);
  expect(kept.state).toBe(W.STEPS.PARTS); // `.history`: the step Cancel came from, with its lines
  expect(kept.records("exit", { instance: ["DISCARD"] })).toMatchObject([{ name: "Kept" }]);
  expect(exited.records("exit", { instance: [] })).toMatchObject([
    {
      name: "Resolved",
      payload: {
        resolution: { reason: "Bulb replaced", parts: ["BULB-40W"], signatureRef: "sig-1" },
      },
    },
  ]);
  // `steps` is private (F19): Stories see it, hosts and views do not.
  expect(exited.records("callback", { name: "onProgressed" }).map((r) => r.payload.step)).toEqual([
    "parts",
    "reason",
    "parts",
    "signoff",
  ]);
});

test("the host's guard refuses Submit with an annotated denial", async () => {
  const { refused } = (await wizardRefused.run()).checkpoints;

  expect(refused.records("verdict", { event: ResolveWizard.E.Submit })).toMatchObject([
    { result: { _tag: "Denied", reasons: [{ code: "NotAssignedToYou" }] } }, // `denials` names it (F19)
  ]);
});

test("the whole visit: a part is reserved, the signature uploads, the ticket closes", async () => {
  const { signing, resolved: done } = (await resolved.run()).checkpoints;

  // The signature's bare write: `pending` and `progress` on the step's row, no ending event.
  expect(signing.lane(Signature.O.upload, { ref: "sig-1" })).toMatchObject({
    pending: true,
    progress: { sent: 2_048, total: 2_048 },
  });
  expect(done.state).toBe(S.RESOLVED);
  expect(done.read(Desk.reservePart)).toMatchObject([{ input: { partNumber: "BULB-40W" } }]);
  expect(done.read(Desk).desk.tickets.find((t) => t.ticketId === "T-42")?.status).toBe("closed");
});

test("a signature that never arrived sends the visit back into the wizard", async () => {
  const { signAgain } = (await signatureMissing.run()).checkpoints;

  expect(signAgain.state).toBe(S.RESOLVING.STEPS.REASON); // back into the wizard: a fresh entry
  expect(signAgain.memory.notice).toBe("The signature didn't upload. Sign again.");
});

test("the step bar jumps the wizard through its host event", async () => {
  const { jumped } = (await steppedBack.run()).checkpoints;

  expect(jumped.state).toBe(S.RESOLVING.STEPS.REASON);
  expect(jumped.memory.step).toBe("reason"); // `onProgressed` drives the bar back
});

test("discarding gives the reserved parts back", async () => {
  const { partsReleased: cp } = (await partsReleased.run()).checkpoints;

  expect(cp.state).toBe(S.ON_SITE);
  expect(cp.read(Desk.releaseParts)).toMatchObject([
    { input: { ...T42, partNumbers: ["BULB-40W"] } },
  ]);
  expect(cp.read(Desk).desk.parts.find((p) => p.partNumber === "BULB-40W")?.reserved).toBe(0);
});

test("called away mid-resolve, the draft is handed back and Start resumes it", async () => {
  const { leftMidResolve: left, resumed } = (await leftMidResolve.run()).checkpoints;

  expect(left.state).toBe(S.ON_SITE);
  expect(left.memory.draft).toMatchObject({
    reason: "Bulb replaced",
    parts: [{ partNumber: "BULB-40W" }],
  });
  expect(resumed.memory.RESOLVING).toMatchObject({ reason: "Bulb replaced" }); // seeded from the draft
});

test("a resolution that answers after the wizard was left is a late ending", async () => {
  const { late } = (await lateAfterLeaving.run()).checkpoints;

  expect(late.state).toBe(S.ON_SITE); // a late ending never moves the screen
  expect(late.records("ending", { operation: O.resolve })).toMatchObject([
    { channel: "success", route: { kind: "late" } },
  ]);
  expect(late.memory.notice).toBe("Resolved");
});

test("a lost resolution answer is held, and Check again sends the same Attempt", async () => {
  const { unconfirmed, confirmed } = (await checkedAgain.run()).checkpoints;

  expect(unconfirmed.lane(O.resolve, T42)).toMatchObject({ uncertain: true });
  expect(unconfirmed.memory.notice).toBe("We couldn't confirm the resolution");
  const sends = confirmed.read(Desk.resolve);
  expect(sends).toHaveLength(2);
  expect(sends[0]?.input.key).toBe(sends[1]?.input.key); // the same Attempt, twice
  expect(confirmed.lane(O.resolve, T42)).toBeUndefined(); // answered: the lane is settled, not held
});
