// From review 5's probes (scratch m5-r3b), kept as a spike fixture.
import { eq } from "../flow.ts";
import type { Condition } from "../flow.ts";
export const extW = ({ record }: any): Condition => eq(record.boardId, "a");
export const holder = { w: ({ record }: any): Condition => eq(record.boardId, "b") };
export const mk = () => ({ record }: any): Condition => eq(record.boardId, "c");
