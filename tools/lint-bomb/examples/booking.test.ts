// Behavior checks drive the same JSON workflow and real in-memory owner as the executable demo.
import assert from "node:assert/strict";
import { describe, it } from "@effect/vitest";
import { Cause, Deferred, Effect, Exit, Fiber, Result, Schema } from "effect";
import { BookingLedger, bookWorkshop, encodeReceipt } from "./booking.ts";

// Controlled fixtures stay independent of the implementation's parser and pricing calculation.
const request = (requestId: string, seats: number, budgetCents: number) =>
  `{"requestId":"${requestId}","customerId":"alice","seats":${seats},"budgetCents":${budgetCents}}`;

describe("Workshop booking", () => {
  it.effect("B01 invalid input and an unaffordable quote leave the owner unchanged", () =>
    Effect.gen(function* () {
      const ledger = yield* BookingLedger;

      for (const input of [
        "{",
        request("negative", -1, 100_000),
        request("fraction", 1.5, 100_000),
        request("too-many", 5, 100_000),
        request("budget", 1, 0),
        request("extra", 1, 100_000).replace('"customerId"', '"unexpected":true,"customerId"'),
      ]) {
        const result = yield* Effect.result(bookWorkshop(input));

        assert(Result.isFailure(result));
        assert.equal(result.failure._tag, "InvalidBooking");
      }

      const unaffordable = yield* Effect.result(bookWorkshop(request("cheap", 2, 20_000)));

      assert(Result.isFailure(unaffordable));
      assert.equal(unaffordable.failure._tag, "BudgetExceeded");
      assert.deepEqual(yield* ledger.availability, { remaining: 5, bookings: 0 });
    }).pipe(Effect.provide(BookingLedger.layer)),
  );

  it.effect("B02 cancellation before admission cannot reserve seats", () =>
    Effect.gen(function* () {
      const ledger = yield* BookingLedger;

      const exit = yield* Effect.exit(
        Effect.interrupt.pipe(Effect.andThen(bookWorkshop(request("not-started", 2, 100_000)))),
      );

      assert(Exit.isFailure(exit));
      assert(Cause.hasInterrupts(exit.cause));
      assert.deepEqual(yield* ledger.availability, { remaining: 5, bookings: 0 });
    }).pipe(Effect.provide(BookingLedger.layer)),
  );

  it.effect(
    "B03 a receipt round-trips; an identical normalized request replays without consuming seats",
    () =>
      Effect.gen(function* () {
        const ledger = yield* BookingLedger;
        const input = request("repeat", 2, 100_000);
        const first = yield* bookWorkshop(input);
        const replay = yield* bookWorkshop(input.replace('"seats"', '"note":null,"seats"'));
        const wire = yield* encodeReceipt(first);
        const parsed = yield* Schema.decodeEffect(Schema.fromJsonString(Schema.Unknown))(wire);

        assert.deepEqual(first, {
          requestId: "repeat",
          customerId: "alice",
          seats: 2,
          totalCents: 25_000,
        });
        assert.deepEqual(replay, first);
        assert.deepEqual(parsed, first);
        assert.deepEqual(yield* ledger.availability, { remaining: 3, bookings: 1 });
      }).pipe(Effect.provide(BookingLedger.layer)),
  );

  it.effect("B04 changed request details conflict without replacing the original receipt", () =>
    Effect.gen(function* () {
      const ledger = yield* BookingLedger;
      const first = yield* bookWorkshop(request("conflict", 2, 100_000));
      const changed = yield* Effect.result(bookWorkshop(request("conflict", 1, 100_000)));

      assert(Result.isFailure(changed));
      assert.equal(changed.failure._tag, "RequestConflict");
      assert.deepEqual(yield* bookWorkshop(request("conflict", 2, 100_000)), first);
      assert.deepEqual(yield* ledger.availability, { remaining: 3, bookings: 1 });
    }).pipe(Effect.provide(BookingLedger.layer)),
  );

  // Test obligation: competing calls must preserve capacity and identity guarantees.
  // concurrency: 2 permits overlap; it does not force every possible interleaving.
  it.effect(
    "B05 competing reservations cannot oversell; concurrent duplicates consume seats once",
    () =>
      Effect.gen(function* () {
        const ledger = yield* BookingLedger;

        const results = yield* Effect.forEach(
          [request("alice", 3, 100_000), request("bob", 3, 100_000)],
          (input) => Effect.result(bookWorkshop(input)),
          { concurrency: 2 },
        );

        assert.equal(results.filter(Result.isSuccess).length, 1);
        assert.equal(results.filter(Result.isFailure).length, 1);
        assert.deepEqual(yield* ledger.availability, { remaining: 2, bookings: 1 });

        const duplicates = yield* Effect.forEach(
          [request("shared", 2, 100_000), request("shared", 2, 100_000)],
          bookWorkshop,
          { concurrency: 2 },
        );

        assert.deepEqual(duplicates[0], duplicates[1]);
        assert.deepEqual(yield* ledger.availability, { remaining: 0, bookings: 2 });
      }).pipe(Effect.provide(BookingLedger.layer)),
  );

  it.effect("B06 a full ledger rejects new IDs but retains replay evidence", () =>
    Effect.gen(function* () {
      const ledger = yield* BookingLedger;
      const first = yield* bookWorkshop(request("first", 1, 100_000));

      yield* bookWorkshop(request("second", 1, 100_000));
      yield* bookWorkshop(request("third", 1, 100_000));

      const full = yield* Effect.result(bookWorkshop(request("fourth", 1, 100_000)));

      assert(Result.isFailure(full));
      assert.equal(full.failure._tag, "LedgerFull");
      assert.deepEqual(yield* bookWorkshop(request("first", 1, 100_000)), first);
      assert.deepEqual(yield* ledger.availability, { remaining: 2, bookings: 3 });
    }).pipe(Effect.provide(BookingLedger.layer)),
  );

  it.effect("B07 cancellation after commitment preserves the receipt for a later retry", () =>
    Effect.gen(function* () {
      const ledger = yield* BookingLedger;
      const committed = yield* Deferred.make();

      const worker = yield* Effect.forkScoped(
        Effect.gen(function* () {
          yield* bookWorkshop(request("cancelled", 2, 100_000));
          yield* Deferred.succeed(committed, undefined);
          yield* Effect.never;
        }),
      );

      yield* Deferred.await(committed);

      yield* Fiber.interrupt(worker);

      const exit = yield* Fiber.await(worker);

      assert(Exit.isFailure(exit));
      assert(Cause.hasInterrupts(exit.cause));
      assert.equal((yield* bookWorkshop(request("cancelled", 2, 100_000))).totalCents, 25_000);
      assert.deepEqual(yield* ledger.availability, { remaining: 3, bookings: 1 });
    }).pipe(Effect.provide(BookingLedger.layer)),
  );

  it.effect("B08 independent Layer builds do not share workshop state", () =>
    Effect.gen(function* () {
      const observe = Effect.gen(function* () {
        const ledger = yield* BookingLedger;

        yield* bookWorkshop(request("isolated", 1, 100_000));

        return yield* ledger.availability;
      }).pipe(Effect.provide(BookingLedger.layer));

      assert.deepEqual(yield* observe, { remaining: 4, bookings: 1 });
      assert.deepEqual(yield* observe, { remaining: 4, bookings: 1 });
    }),
  );

  // Requirements B-R2/R3/R5 -> Invariants B-I1/I2/I3/I4 -> public-boundary Test obligation B09.
  // Generated sequences check capacity and retained identities after each operation.
  // Expected results use admitted request facts and declared limits, not the private transition.
  const BookingSequence = Schema.NonEmptyArray(Schema.Literals([1, 2, 3, 4])).check(
    Schema.isMaxLength(12),
  );

  it.effect.prop(
    "B09 generated booking sequences conserve seats and retain every committed identity",
    [BookingSequence],
    ([seatsByRequest]) =>
      Effect.gen(function* () {
        const ledger = yield* BookingLedger;
        const committed: { id: string; seats: number; json: string }[] = [];
        const prices = [0, 12_500, 25_000, 37_500, 50_000];
        let consumed = 0;

        for (const [index, seats] of seatsByRequest.entries()) {
          const id = `generated-${index}`;
          const input = request(id, seats, 100_000);
          const shouldAccept = committed.length < 3 && consumed + seats <= 5;
          const result = yield* Effect.result(bookWorkshop(input));

          assert.equal(Result.isSuccess(result), shouldAccept);

          if (Result.isSuccess(result)) {
            committed.push({ id, seats, json: input });
            consumed += seats;
          }

          assert.deepEqual(yield* ledger.availability, {
            remaining: 5 - consumed,
            bookings: committed.length,
          });

          // Totals alone miss replacement of old receipts; replay every prior identity after each step.
          for (const prior of committed) {
            assert.deepEqual(yield* bookWorkshop(prior.json), {
              requestId: prior.id,
              customerId: "alice",
              seats: prior.seats,
              totalCents: prices[prior.seats],
            });
          }
        }
      }).pipe(Effect.provide(BookingLedger.layer)),
    { arbitrary: { runs: 64, seed: 20261021 } },
  );

  it.effect(
    "B10 changed admitted request fields reject while preflight budget failure retains its precedence",
    () =>
      Effect.gen(function* () {
        const ledger = yield* BookingLedger;
        const input = request("stable", 2, 100_000);

        yield* bookWorkshop(input);

        for (const changed of [
          request("stable", 1, 100_000),
          input.replace('"alice"', '"bob"'),
          input.replace('"seats"', '"note":"new note","seats"'),
          request("stable", 2, 90_000),
        ]) {
          const result = yield* Effect.result(bookWorkshop(changed));

          assert(Result.isFailure(result));
          assert.equal(result.failure._tag, "RequestConflict");
          assert.deepEqual(yield* bookWorkshop(input), {
            requestId: "stable",
            customerId: "alice",
            seats: 2,
            totalCents: 25_000,
          });
        }

        const unaffordable = yield* Effect.result(bookWorkshop(request("stable", 2, 1)));

        assert(Result.isFailure(unaffordable));
        assert.equal(unaffordable.failure._tag, "BudgetExceeded");
        assert.deepEqual(yield* ledger.availability, { remaining: 3, bookings: 1 });
      }).pipe(Effect.provide(BookingLedger.layer)),
  );

  it.effect("B11 exact budget and capacity boundaries admit affordable requests inclusively", () =>
    Effect.gen(function* () {
      const ledger = yield* BookingLedger;
      const fourSeats = yield* bookWorkshop(request("four", 4, 50_000));
      const lastSeat = yield* bookWorkshop(request("last", 1, 12_500));

      assert.deepEqual(fourSeats, {
        requestId: "four",
        customerId: "alice",
        seats: 4,
        totalCents: 50_000,
      });
      assert.deepEqual(lastSeat, {
        requestId: "last",
        customerId: "alice",
        seats: 1,
        totalCents: 12_500,
      });
      assert.deepEqual(yield* ledger.availability, { remaining: 0, bookings: 2 });

      const excess = yield* Effect.result(bookWorkshop(request("excess", 1, 12_500)));

      assert(Result.isFailure(excess));
      assert.equal(excess.failure._tag, "SoldOut");
      assert.deepEqual(yield* bookWorkshop(request("four", 4, 50_000)), {
        requestId: "four",
        customerId: "alice",
        seats: 4,
        totalCents: 50_000,
      });
    }).pipe(Effect.provide(BookingLedger.layer)),
  );

  it.effect("B12 changing returned receipts cannot alter retained booking facts", () =>
    Effect.gen(function* () {
      const input = request("isolated", 2, 100_000);
      const first = yield* bookWorkshop(input);

      // Simulate mutation by JavaScript consumers despite the readonly TypeScript view.
      Object.assign(first, { seats: 999, totalCents: 1 });

      const replay = yield* bookWorkshop(input);

      assert.deepEqual(replay, {
        requestId: "isolated",
        customerId: "alice",
        seats: 2,
        totalCents: 25_000,
      });

      Object.assign(replay, { requestId: "changed", seats: 0 });

      const ledger = yield* BookingLedger;

      assert.deepEqual(yield* bookWorkshop(input), {
        requestId: "isolated",
        customerId: "alice",
        seats: 2,
        totalCents: 25_000,
      });
      assert.deepEqual(yield* ledger.availability, { remaining: 3, bookings: 1 });
    }).pipe(Effect.provide(BookingLedger.layer)),
  );

  it.effect("B13 the Service itself admits input before touching reservations", () =>
    Effect.gen(function* () {
      const ledger = yield* BookingLedger;
      const invalid = yield* Effect.result(ledger.book(request("forged", -1, 100_000)));

      assert(Result.isFailure(invalid));
      assert.equal(invalid.failure._tag, "InvalidBooking");
      assert.deepEqual(yield* ledger.availability, { remaining: 5, bookings: 0 });
      assert.deepEqual(yield* ledger.book(request("direct", 2, 100_000)), {
        requestId: "direct",
        customerId: "alice",
        seats: 2,
        totalCents: 25_000,
      });
      assert.deepEqual(yield* ledger.availability, { remaining: 3, bookings: 1 });
    }).pipe(Effect.provide(BookingLedger.layer)),
  );
});
