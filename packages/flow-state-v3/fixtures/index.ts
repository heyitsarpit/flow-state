import type { Part } from "./part.ts";
import { cellsPart, payPart } from "./pay/index.ts";
import { signIn } from "./sign-in.ts";
import { syncClient } from "./sync.ts";

/**
 * Every part the suite generates scripts for: the catalogue's pilots, then the checkout's Pay and
 * Cells. Transfers is a Story fixture (`fixtures/transfers/`), not a part.
 */
export const parts: ReadonlyArray<Part> = [syncClient, signIn, payPart, cellsPart];

/**
 * The parts the app mix runs in one runtime, one per machine id (Compile I14): the pilots. Cells
 * shares Pay's machine id.
 */
export const mixed: ReadonlyArray<Part> = [syncClient, signIn];

export const mixedWithPay: ReadonlyArray<Part> = [...mixed, payPart];
