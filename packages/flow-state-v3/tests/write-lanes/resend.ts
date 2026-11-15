import { expect } from "vite-plus/test";
import { Shop } from "../../fixtures/pay/server.ts";
import { Fake, type StoryRun, type WorldWord } from "../../src/host/testing/index.ts";
import { charges, CHECK, keys, onWire, state } from "../checkout.ts";

/**
 * `pay` lost before it landed, then re-read: no order and an intent still needing a payment
 * method, so the same Attempt is sent again once its capture is written; `resend` meets the
 * re-send (held by default).
 */
export const toResend = (id: string, resend: WorldWord = Shop.confirm.hold()) =>
  onWire(id, Shop.confirm.drop())
    .checkpoint("unsure")
    .world(Fake.storage.hold())
    .advance(CHECK)
    .checkpoint("resending")
    .world(resend, Fake.storage.release())
    .checkpoint("resent");

/**
 * What every re-send asserts: unsure with no charge, PAYING while its capture is out, nothing sent
 * before the capture, then a second send with the same id (WriteAhead R13; WriteLanes R5).
 */
export const expectResent = (run: StoryRun<"unsure" | "resending" | "resent">) => {
  const { unsure, resending, resent } = run.checkpoints;

  expect(state(unsure)).toBe("UNSURE");
  expect(charges(unsure)).toBe(0);
  expect(state(resending)).toBe("PAYING");
  expect(resending.read(Shop.confirm)).toHaveLength(1);
  expect(resent.read(Shop.confirm)).toHaveLength(2);
  expect(keys(resent)).toBe(1);
};
