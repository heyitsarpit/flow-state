import type { Part } from "./part.ts";
import { signIn } from "./sign-in.ts";
import { syncClient } from "./sync.ts";
import { transfers } from "./transfers.ts";

/**
 * Every part the suite generates scripts for, in catalogue order.
 */
export const parts: ReadonlyArray<Part> = [syncClient, transfers, signIn];
