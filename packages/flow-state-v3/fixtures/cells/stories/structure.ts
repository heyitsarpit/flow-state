import { Fake } from "../../../src/host/testing/index.ts";
import { cellsCheckout } from "../app.ts";
import { Shop } from "../../services/shop/server/shop.ts";
import { cellsStory } from "./usual.ts";

const start = { _tag: "Start", cartId: "c1", intentId: "pi1" } as const;

const visa = { _tag: "PayRequested", paymentMethodId: "visa" } as const;

/**
 * A charge is on the wire, its answer held, when the Runtime is disposed; the disposal's bound
 * passes and the tab reloads.
 */
export const disposedOnWire = cellsStory("cells/disposed-on-wire")
  .ensure(cellsCheckout)
  .send(cellsCheckout, start)
  .world(Shop.confirm.hold({ at: "response" }))
  .send(cellsCheckout, visa)
  .checkpoint("on wire")
  .disposeRuntime()
  .advance("6 seconds")
  .reload()
  .checkpoint("reloaded");

/**
 * The store holds the charge's acknowledging write, so it is never sent, when the Runtime is
 * disposed; the held writes land as the tab reloads.
 */
export const neverSentDisposed = cellsStory("cells/never-sent-disposed")
  .ensure(cellsCheckout)
  .send(cellsCheckout, start)
  .world(Fake.storage.hold())
  .send(cellsCheckout, visa)
  .disposeRuntime()
  .advance("6 seconds")
  .reload({ heldWrites: "land" })
  .checkpoint("reloaded");

/**
 * A charge is on the wire, its answer held, when the tab reloads.
 */
export const reloadedOnWire = cellsStory("cells/reloaded-on-wire")
  .ensure(cellsCheckout)
  .send(cellsCheckout, start)
  .world(Shop.confirm.hold({ at: "response" }))
  .send(cellsCheckout, visa)
  .reload()
  .checkpoint("reloaded");
