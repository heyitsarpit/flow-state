import { assert, describe, it } from "@effect/vitest";
import { Effect, Exit, Option, Result, Scope } from "effect";

import { definition } from "../../definition/definition.js";
import { Failure } from "../../diagnostic/diagnostic.js";
import { machine } from "../../machine/machine.js";
import { makeActorDirectory } from "../actor/actor-directory.js";
import { makeEvidenceJournal } from "../evidence/evidence-journal.js";
import { evidenceSequence } from "../evidence/evidence-record.js";
import {
  makeEvidenceSink,
  type AttachmentDrainResult,
  type EvidenceSink,
} from "../evidence/evidence-sink.js";

const Definition = definition({
  id: "runtime-next/evidence-journal-owner",
  states: ["idle"],
  events: {},
});

const Machine = Result.getOrThrow(
  machine(Definition, ({ S }) => ({ default: S.idle, states: { idle: {} } })),
);

const acceptedJournal = (sink: EvidenceSink) =>
  Effect.gen(function* () {
    const ownerScope = yield* Scope.make();
    const app = {};
    const plan = {};
    const journal = Result.getOrThrow(makeEvidenceJournal({ app, plan, ownerScope, capacity: 1 }));
    Result.getOrThrow(journal.attach(Result.getOrThrow(journal.issueAttachment(sink))));
    const directory = makeActorDirectory<string>({ machines: [Machine] });

    const reserved = Result.getOrThrow(
      directory.reserve({
        kind: "stable",
        ref: { machine: Machine, id: "close-result", persist: false },
      }),
    );

    assert.ok(reserved._tag === "create");
    const fence = reserved.reservation.identity;
    const credit = Result.getOrThrow(journal.registerActor(fence));
    Result.getOrThrow(
      journal.prepareTurn(credit, {
        _tag: "turn",
        fence,
        provenance: { app, plan, actor: fence },
        timestamp: 1,
        publicationRevision: 1,
        machineTurnRevision: 1,
        cause: { _tag: "event" },
        before: { value: 0 },
        after: { value: 1 },
      }),
    ).accept({ revision: 1 });
    credit.release();

    return { journal, ownerScope };
  });

describe("runtime-next evidence journal owner", () => {
  it.effect("publishes a fixed close result across repeated callers", () =>
    Effect.gen(function* () {
      const sink = yield* makeEvidenceSink({ id: "fixed-close", capacity: 1 });
      const { journal, ownerScope } = yield* acceptedJournal(sink);

      const first = yield* journal.close();
      const attachment = first.attachments[0];

      assert.ok(attachment !== undefined);
      assert.strictEqual(attachment.accounting.accepted, 1);
      assert.strictEqual(attachment.accounting.delivered, 1);
      assert.ok(Object.isFrozen(first));
      assert.ok(Object.isFrozen(first.attachments));
      assert.ok(Object.isFrozen(attachment));
      assert.ok(Object.isFrozen(attachment.accounting));
      assert.ok(Object.isFrozen(first.truncatedBefore));
      assert.ok(Object.isFrozen(attachment.truncatedBefore));
      assert.ok(Object.isFrozen(attachment.accounting.greatestOmittedSequence));
      assert.ok(Object.isFrozen(attachment.failureCause));
      assert.strictEqual(Reflect.set(first, "through", 0), false);
      assert.strictEqual(Reflect.set(first.attachments, 0, {}), false);
      assert.strictEqual(Reflect.set(first.attachments, "length", 0), false);
      assert.strictEqual(Reflect.set(attachment, "status", "failed"), false);
      assert.strictEqual(Reflect.set(attachment.accounting, "accepted", 100), false);

      const repeated = yield* journal.close();
      assert.strictEqual(repeated, first);
      assert.strictEqual(repeated.through, 1);
      assert.strictEqual(repeated.attachments.length, 1);
      assert.strictEqual(repeated.attachments[0]?.status, "drained");
      assert.strictEqual(repeated.attachments[0]?.accounting.accepted, 1);
      assert.strictEqual(repeated.attachments[0]?.accounting.delivered, 1);
      yield* Scope.close(ownerScope, Exit.void);
    }),
  );

  it.effect("detaches a retained sink result before caching close", () =>
    Effect.gen(function* () {
      const through = Result.getOrThrow(evidenceSequence(1));

      const retained = {
        sink: "retained",
        through,
        status: "failed",
        truncatedBefore: Option.some(through),
        accounting: {
          accepted: 1,
          dropped: 0,
          delivered: 0,
          truncated: 0,
          failed: 1,
          detached: 0,
          greatestOmittedSequence: Option.some(through),
        },
        failureCause: Option.some({
          reasons: [
            {
              _tag: "Fail",
              error: {
                code: "InvalidTraceRecord",
                path: ["evidence", "retained"],
                details: { source: "sink" },
                summary: "Retained failure",
                help: "Inspect the sink.",
              },
            },
          ],
        }),
      } satisfies AttachmentDrainResult;

      const sink: EvidenceSink = {
        id: "retained",
        capacity: 1,
        claimOnce: () => Result.succeed(undefined),
        prepareOffer: () =>
          Result.succeed({
            accept: (record) => ({
              sink: "retained",
              sequence: record.sequence,
              status: "accepted",
            }),
            cancel: () => undefined,
          }),
        drain: () => Effect.succeed(retained),
        close: () => Effect.void,
      };

      const { journal, ownerScope } = yield* acceptedJournal(sink);
      const first = yield* journal.close();

      assert.strictEqual(Reflect.set(retained, "status", "drained"), true);
      assert.strictEqual(Reflect.set(retained.accounting, "failed", 99), true);
      assert.strictEqual(Reflect.set(retained.truncatedBefore, "value", 99), true);
      assert.ok(Option.isSome(retained.failureCause));
      const retainedReason = retained.failureCause.value.reasons[0];
      assert.ok(retainedReason?._tag === "Fail");
      assert.strictEqual(Reflect.set(retainedReason.error.details, "source", "changed"), true);
      assert.strictEqual(first.attachments[0]?.status, "failed");
      assert.strictEqual(first.attachments[0]?.accounting.failed, 1);
      assert.deepStrictEqual(first.attachments[0]?.truncatedBefore, Option.some(through));
      const firstFailure = first.attachments[0]?.failureCause;
      assert.ok(firstFailure !== undefined && Option.isSome(firstFailure));
      const firstReason = firstFailure.value.reasons[0];
      assert.ok(firstReason?._tag === "Fail");
      assert.strictEqual(firstReason.error.details.source, "sink");

      const repeated = yield* journal.close();
      assert.strictEqual(repeated, first);
      assert.strictEqual(repeated.attachments[0]?.status, "failed");
      assert.strictEqual(repeated.attachments[0]?.accounting.failed, 1);
      yield* Scope.close(ownerScope, Exit.void);
    }),
  );

  it.effect("detaches failed delivery details without freezing the caller's error", () =>
    Effect.gen(function* () {
      const deliveryFailure = Failure({
        code: "InvalidTraceRecord",
        path: ["evidence", "delivery"],
        details: { attempt: 1 },
        summary: "Delivery rejected",
        help: "Inspect delivery.",
      });

      const sink = yield* makeEvidenceSink({
        id: "failed-close",
        capacity: 1,
        deliver: () => Effect.fail(deliveryFailure),
      });

      const { journal, ownerScope } = yield* acceptedJournal(sink);
      const first = yield* journal.close();
      const failure = first.attachments[0]?.failureCause;

      assert.ok(failure !== undefined && Option.isSome(failure));
      const reason = failure.value.reasons[0];
      assert.ok(reason?._tag === "Fail");
      assert.strictEqual(reason.error.summary, "Delivery rejected");
      assert.strictEqual(Object.isFrozen(deliveryFailure), false);
      assert.strictEqual(Reflect.set(failure.value, "reasons", []), false);
      assert.strictEqual(Reflect.set(failure.value.reasons, 0, {}), false);
      assert.strictEqual(Reflect.set(reason, "error", {}), false);
      assert.strictEqual(Reflect.set(reason.error, "summary", "tampered"), false);
      assert.strictEqual(Reflect.set(deliveryFailure, "summary", "caller changed"), true);

      const repeated = yield* journal.close();
      assert.strictEqual(repeated, first);
      const observed = repeated.attachments[0]?.failureCause;
      assert.ok(observed !== undefined && Option.isSome(observed));
      const observedReason = observed.value.reasons[0];
      assert.ok(observedReason?._tag === "Fail");
      assert.strictEqual(observedReason.error.summary, "Delivery rejected");
      yield* Scope.close(ownerScope, Exit.void);
    }),
  );

  it.effect("stale and foreign credit release cannot retire a recycled identity", () =>
    Effect.gen(function* () {
      const ownerScope = yield* Scope.make();
      const app = {};
      const plan = {};
      const first = Result.getOrThrow(makeEvidenceJournal({ app, plan, ownerScope, capacity: 1 }));
      const second = Result.getOrThrow(makeEvidenceJournal({ app, plan, ownerScope, capacity: 1 }));
      const directory = makeActorDirectory<string>({ machines: [Machine] });
      const ref = { machine: Machine, id: "same-label", persist: false as const };
      const original = Result.getOrThrow(directory.reserve({ kind: "stable", ref }));
      assert.ok(original._tag === "create");
      const stale = Result.getOrThrow(first.registerActor(original.reservation.identity));
      assert.ok(Result.isFailure(first.registerActor(original.reservation.identity)));

      stale.release();
      yield* directory.rollback(
        original.reservation,
        Failure({
          code: "InvalidTraceRecord",
          path: ["actor", "rollback"],
          details: {},
          summary: "Discard the first reservation.",
          help: "Retry with the same actor ref.",
        }),
      );

      const replacement = Result.getOrThrow(directory.reserve({ kind: "stable", ref }));
      assert.ok(replacement._tag === "create");
      const fence = replacement.reservation.identity;
      assert.strictEqual(fence.key, original.reservation.identity.key);
      assert.notStrictEqual(fence.incarnation, original.reservation.identity.incarnation);
      const current = Result.getOrThrow(first.registerActor(fence));
      assert.ok(Result.isFailure(first.registerActor(fence)));
      assert.strictEqual(Reflect.set(current, "fence", original.reservation.identity), false);
      const foreign = Result.getOrThrow(second.registerActor(fence));

      const draft = {
        _tag: "turn" as const,
        fence,
        provenance: { app, plan, actor: fence },
        timestamp: 1,
        publicationRevision: 1,
        machineTurnRevision: 1,
        cause: { _tag: "event" },
        before: { value: 0 },
        after: { value: 1 },
      };

      assert.ok(Result.isFailure(first.prepareTurn(stale, draft)));
      assert.ok(Result.isFailure(first.prepareTurn(foreign, draft)));
      stale.release();
      foreign.release();
      assert.strictEqual(first.sequence(), 0);
      const accepted = Result.getOrThrow(first.prepareTurn(current, draft)).accept({ revision: 1 });
      assert.strictEqual(accepted.sequence, 1);
      current.release();
      assert.strictEqual((yield* first.close()).through, 1);
      assert.strictEqual((yield* second.close()).through, 0);
      yield* Scope.close(ownerScope, Exit.void);
    }),
  );
});
