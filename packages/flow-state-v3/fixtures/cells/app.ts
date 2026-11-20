import { Layer } from "effect";
import { actorRef, app, runtimeSetup } from "../../src/index.ts";
import { ShopLive } from "../services/shop/adapters/shop.ts";
import { CellsMachine } from "./machines/cells.ts";
import { layerIndexedDb } from "../../src/host/persistence.ts";

/**
 * The checkout app with Cells in place of Pay.
 */
export const cellsShop = app({ id: "cells", machines: { pay: CellsMachine } });

/**
 * The Cells checkout's real setup: the shop over HTTP, persisted, each capture written at once.
 */
export const cellsSetup = runtimeSetup({
  app: cellsShop,
  services: Layer.merge(ShopLive("https://shop.example"), layerIndexedDb()),
  scope: "cells",
  persistence: { captureMs: 0 },
});

/**
 * The Cells checkout the stories use.
 */
export const cellsCheckout = actorRef(CellsMachine, "checkout-1");
