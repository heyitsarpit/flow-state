import type { Lie } from "./oracle.ts";

const ADMIT = "  const a = getActor(tx.w.actors, item.actor);\n  const lane = tx.w.lanes[laneId];";

const FAIL = 'item.ending.ch !== "success"';

const SAME_MAIL =
  '[...tx.w.mail].some((x: any) => x.actor === item.actor && !(x.k === "ending" && x.attempt === item.attempt))';

const OTHER_MAIL = "[...tx.w.mail].some((x: any) => x.actor !== item.actor)";

const RELEASED = 'note(tx, "Released", { op: item.op, attempt: item.attempt ?? "" });';

const EVIDENCE_ONLY =
  'return note(tx, "evidenceOnly", { op: item.op, attempt: item.attempt ?? "" });';

const DELIVERED_NOT_RUN =
  'note(tx, "delivered", { op: item.op, attempt: item.attempt ?? "", event: "x" }); return;';

const OTHER_ACTOR =
  'const a0 = getActor(tx.w.actors, item.actor);\n  const other = a0 && item.attempt && item.ending.ch === "failure" ? (tx.w.actors as any).flat().filter(Boolean).flatMap((b: any) => Object.values(b)).find((x: any) => x.machine === a0.machine && x.key !== a0.key) : undefined;\n  const a = other ?? a0;\n  const lane = tx.w.lanes[laneId];';

const when = (condition: string, body: string) => `${ADMIT}\n  if (a && ${condition}) { ${body} }`;

/**
 * Wrong runtimes the one-delivery oracle must catch: each edits how the prototype admits an
 * ending.
 *
 * **Details**
 *
 * - `a2.deliv-fail-samemail`: an ending not taken while its actor has other mail is said
 *   delivered and runs nothing.
 * - `d154.moved-fail-released`: the same ending is said released and recorded as evidence.
 * - `lie.released`: an ending not taken while another actor has mail is released and recorded.
 * - `e8.wa-failure`: a failure ending runs in another live actor of the same machine.
 */
export const oneDeliveryLies: ReadonlyArray<Lie> = [
  {
    name: "a2.deliv-fail-samemail",
    says: "an ending is said delivered while its actor has mail, and no turn runs it",
    runtime: "prototype",
    cases: ["DLV-01"],
    edits: [
      { file: "turn.ts", find: ADMIT, replace: when(`${FAIL} && ${SAME_MAIL}`, DELIVERED_NOT_RUN) },
    ],
  },
  {
    name: "d154.moved-fail-released",
    says: "an ending is said released and recorded as evidence while its actor has mail",
    runtime: "prototype",
    cases: ["DLV-01"],
    edits: [
      {
        file: "turn.ts",
        find: ADMIT,
        replace: when(`${FAIL} && ${SAME_MAIL}`, `${RELEASED} ${EVIDENCE_ONLY}`),
      },
    ],
  },
  {
    name: "lie.released",
    says: "an ending is released and recorded as evidence while another actor has mail",
    runtime: "prototype",
    cases: ["DLV-02"],
    edits: [
      {
        file: "turn.ts",
        find: ADMIT,
        replace: when(`${FAIL} && ${OTHER_MAIL}`, `${RELEASED} ${EVIDENCE_ONLY}`),
      },
    ],
  },
  {
    name: "e8.wa-failure",
    says: "a failure ending runs in another live actor of the same machine",
    runtime: "prototype",
    cases: ["DLV-03"],
    edits: [{ file: "turn.ts", find: ADMIT, replace: OTHER_ACTOR }],
  },
];
