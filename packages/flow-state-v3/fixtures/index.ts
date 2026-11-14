import type { Part } from "./part.ts";
import { cellsPart, payPart } from "./pay/index.ts";
import { signIn } from "./sign-in.ts";
import { syncClient } from "./sync.ts";
import { transfers } from "./transfers.ts";

/**
 * Every part the suite generates scripts for: the catalogue's pilots, then the checkout's Pay and
 * Cells.
 */
export const parts: ReadonlyArray<Part> = [syncClient, transfers, signIn, payPart, cellsPart];

/**
 * The parts the app mix runs in one runtime, one per machine id (Compile I14): the pilots. Cells
 * shares Pay's machine id.
 */
export const mixed: ReadonlyArray<Part> = [syncClient, transfers, signIn];
